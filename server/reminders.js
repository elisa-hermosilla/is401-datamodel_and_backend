import { sendNotification, setVapidDetails } from "web-push";
import pool, { query } from "./db.js";
import { decodePushDeviceToken } from "./push-device-token.js";

const MINUTE_MS = 60_000;
const SCHEDULER_LOCK = 824901337;
const POLL_MS = 60_000;
const SUMMARY_TIMEZONE = "America/Denver";

function minuteOfDayAt(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.filter(p => p.type === "hour" || p.type === "minute").map(p => [p.type, Number(p.value)]));
  return values.hour * 60 + values.minute;
}

function inQuietHours(minuteOfDay, startText, endText) {
  const start = Number(startText.slice(0, 2)) * 60 + Number(startText.slice(3, 5));
  const end = Number(endText.slice(0, 2)) * 60 + Number(endText.slice(3, 5));
  if (start === end) return false;
  return start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end;
}

function firstQuietMinute(cursor, prefs) {
  const isQuiet = value => inQuietHours(
    minuteOfDayAt(value, prefs.timezone), prefs.quiet_hours_start, prefs.quiet_hours_end
  );
  let outside = cursor;
  while (isQuiet(outside)) outside -= MINUTE_MS;
  let inside = outside + MINUTE_MS;
  while (inside - outside > MINUTE_MS) {
    const steps = Math.floor((inside - outside) / (2 * MINUTE_MS));
    const middle = outside + Math.max(1, steps) * MINUTE_MS;
    if (isQuiet(middle)) inside = middle;
    else outside = middle;
  }
  return inside;
}

// Preserve the selected lead time by skipping quiet-hour minutes while
// counting back from the due time. This matches the settings preview.
function scheduledTime(dueAt, minutesBefore, prefs) {
  let cursor = new Date(dueAt).getTime();
  let remaining = minutesBefore;
  while (remaining > 0) {
    cursor -= MINUTE_MS;
    if (prefs.quiet_hours_enabled && inQuietHours(
      minuteOfDayAt(cursor, prefs.timezone), prefs.quiet_hours_start, prefs.quiet_hours_end
    )) cursor = firstQuietMinute(cursor, prefs);
    else remaining -= 1;
  }
  return new Date(cursor);
}

function durationText(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function pushPayload(notification) {
  return JSON.stringify({
    title: "Assignment reminder",
    body: `${notification.title} is due in ${durationText(Number(notification.minutes_before))}${notification.course_code ? ` for ${notification.course_code}` : ""}.`,
    url: `/assignments?assignment_id=${notification.assignment_id}`,
  });
}

async function rebuildNotifications() {
  const [{ rows: candidates }, { rows: currentRows }] = await Promise.all([
    query(
      `select a.assignment_id, a.title, a.due_at, c.user_id, c.course_code,
              ro.reminder_offset_id, ro.minutes_before,
              to_char(q.start_time, 'HH24:MI') as quiet_hours_start,
              to_char(q.end_time, 'HH24:MI') as quiet_hours_end,
              (q.user_id is not null) as quiet_hours_enabled
         from assignment a
         join course c on c.course_id = a.course_id
         join reminder_offset ro on ro.user_id = c.user_id
         left join assignment_category cat on cat.assignment_category_id = a.assignment_category_id
         left join quiet_hours q on q.user_id = c.user_id
        where a.completed_at is null and a.due_at > now()
          and coalesce(cat.is_included, true)
          and exists (select 1 from push_device d where d.user_id = c.user_id)`),
    query(`select notification_id, user_id, assignment_id, reminder_offset_id, scheduled_at, sent_at, status
             from notification where assignment_id is not null and reminder_offset_id is not null`),
  ]);

  const byAssignmentOffset = new Map();
  for (const row of currentRows) {
    const key = `${row.assignment_id}:${row.reminder_offset_id}`;
    const list = byAssignmentOffset.get(key) || [];
    list.push(row);
    byAssignmentOffset.set(key, list);
  }
  const wanted = new Set();
  const now = Date.now();
  for (const item of candidates) {
    const key = `${item.assignment_id}:${item.reminder_offset_id}`;
    const planned = scheduledTime(item.due_at, Number(item.minutes_before), {
      quiet_hours_enabled: item.quiet_hours_enabled,
      quiet_hours_start: item.quiet_hours_start || "00:00",
      quiet_hours_end: item.quiet_hours_end || "00:00",
      timezone: "America/Denver",
    });
    const existing = byAssignmentOffset.get(key) || [];
    const current = existing.sort((a, b) => b.notification_id - a.notification_id)[0];
    if (planned.getTime() <= now) {
      if (current?.status === "pending" && new Date(current.scheduled_at).getTime() === planned.getTime()) wanted.add(key);
      continue;
    }

    wanted.add(key);
    if (!current) {
      await query(
        `insert into notification (user_id, assignment_id, reminder_offset_id, scheduled_at, status)
         values ($1, $2, $3, $4, 'pending')`,
        [item.user_id, item.assignment_id, item.reminder_offset_id, planned]);
    } else if (new Date(current.scheduled_at).getTime() !== planned.getTime()) {
      await query(
        `update notification set user_id = $1, scheduled_at = $2,
                sent_at = null, status = 'pending'
          where notification_id = $3`,
        [item.user_id, planned, current.notification_id]);
    } else if (current.status === "cancelled") {
      await query("update notification set status = 'pending', sent_at = null where notification_id = $1",
        [current.notification_id]);
    }

    for (const duplicate of existing.slice(1)) {
      if (duplicate.status === "pending") {
        await query("update notification set status = 'cancelled' where notification_id = $1", [duplicate.notification_id]);
      }
    }
  }

  for (const row of currentRows) {
    const key = `${row.assignment_id}:${row.reminder_offset_id}`;
    if (row.status === "pending" && !wanted.has(key)) {
      await query("update notification set status = 'cancelled' where notification_id = $1", [row.notification_id]);
    }
  }
}

async function deliverDueNotifications() {
  const { rows: due } = await query(
    `select n.notification_id, n.user_id, n.assignment_id, n.reminder_offset_id,
            ro.minutes_before, a.title, c.course_code
       from notification n
       join assignment a on a.assignment_id = n.assignment_id
       join course c on c.course_id = a.course_id
       join reminder_offset ro on ro.reminder_offset_id = n.reminder_offset_id
       left join assignment_category cat on cat.assignment_category_id = a.assignment_category_id
      where n.status = 'pending' and n.scheduled_at <= now()
        and a.due_at > now() and a.completed_at is null and coalesce(cat.is_included, true)
      order by n.scheduled_at limit 100`);

  for (const notification of due) {
    const { rows: devices } = await query(
      "select push_device_id, device_token from push_device where user_id = $1",
      [notification.user_id]);
    let delivered = 0;
    const errors = [];
    for (const device of devices) {
      try {
        await sendNotification(decodePushDeviceToken(device.device_token), pushPayload(notification), { TTL: 3600 });
        delivered += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query("delete from push_device where push_device_id = $1", [device.push_device_id]);
        } else errors.push(String(err.message || "Push delivery failed").slice(0, 300));
      }
    }

    if (delivered) {
      await query(
        `update notification set status = 'sent', sent_at = now()
          where notification_id = $1 and status = 'pending'`,
        [notification.notification_id]);
    } else if (errors.length) {
      await query(
        `update notification set status = 'failed'
          where notification_id = $1 and status = 'pending'`,
        [notification.notification_id]);
      console.error(`Push notification ${notification.notification_id} failed:`, errors[0]);
    } else {
      await query(
        `update notification set status = 'failed'
          where notification_id = $1 and status = 'pending'`,
        [notification.notification_id]);
    }
  }
}

function localDateKey(epochMs, timeZone = SUMMARY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.filter(p => ["year", "month", "day"].includes(p.type)).map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDateKeyDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function localDateTimeToUtc(dateKey, timeText, timeZone = SUMMARY_TIMEZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  const visited = new Map();
  for (let i = 0; i < 6; i += 1) {
    if (visited.has(guess)) {
      const cycleStart = visited.get(guess);
      const cycleInstants = [...visited.keys()].slice(cycleStart);
      return new Date(Math.max(...cycleInstants, guess));
    }
    visited.set(guess, visited.size);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.filter(p => ["year", "month", "day", "hour", "minute"].includes(p.type)).map(p => [p.type, Number(p.value)]));
    const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    const delta = desired - represented;
    if (delta === 0) return new Date(guess);
    guess += delta;
  }
  // A selected local time can be skipped during the spring DST change. In that
  // rare case, use the closest resulting instant rather than blocking delivery.
  return new Date(guess);
}

async function rebuildSummaryNotifications() {
  const [{ rows: settings }, { rows: existingRows }] = await Promise.all([
    query(
      `select s.user_id, to_char(s.send_time, 'HH24:MI') as send_time,
              s.summary_range, array_agg(d.day_of_week order by d.day_of_week) as days
         from summary_setting s
         join summary_day d on d.user_id = s.user_id
        where exists (select 1 from push_device p where p.user_id = s.user_id)
        group by s.user_id, s.send_time, s.summary_range`),
    query(`select notification_id, user_id, scheduled_at, status from notification
            where assignment_id is null and reminder_offset_id is null`),
  ]);

  const byOccurrence = new Map();
  for (const row of existingRows) {
    const key = `${row.user_id}:${new Date(row.scheduled_at).getTime()}`;
    const list = byOccurrence.get(key) || [];
    list.push(row);
    byOccurrence.set(key, list);
  }

  const wanted = new Set();
  const now = Date.now();
  const today = localDateKey(now);
  for (const setting of settings) {
    const activeDays = new Set(setting.days.map(Number));
    for (let offset = 0; offset <= 7; offset += 1) {
      const dateKey = addDateKeyDays(today, offset);
      const [year, month, day] = dateKey.split("-").map(Number);
      if (!activeDays.has(new Date(Date.UTC(year, month - 1, day)).getUTCDay())) continue;
      const scheduledAt = localDateTimeToUtc(dateKey, setting.send_time);
      const occurrenceKey = `${setting.user_id}:${scheduledAt.getTime()}`;
      const existing = byOccurrence.get(occurrenceKey) || [];
      const current = existing.sort((a, b) => b.notification_id - a.notification_id)[0];

      for (const duplicate of existing.slice(1)) {
        if (duplicate.status === "pending") {
          await query("update notification set status = 'cancelled' where notification_id = $1", [duplicate.notification_id]);
        }
      }

      if (scheduledAt.getTime() <= now) {
        if (current?.status === "pending") wanted.add(current.notification_id);
        continue;
      }
      if (!current) {
        const { rows } = await query(
          `insert into notification (user_id, assignment_id, reminder_offset_id, scheduled_at, status)
           values ($1, null, null, $2, 'pending') returning notification_id`,
          [setting.user_id, scheduledAt]);
        wanted.add(rows[0].notification_id);
      } else if (current.status === "cancelled") {
        await query("update notification set status = 'pending', sent_at = null where notification_id = $1",
          [current.notification_id]);
        wanted.add(current.notification_id);
      } else if (current.status === "pending") wanted.add(current.notification_id);
    }
  }

  for (const row of existingRows) {
    if (row.status === "pending" && !wanted.has(row.notification_id)) {
      await query("update notification set status = 'cancelled' where notification_id = $1", [row.notification_id]);
    }
  }
}

function summaryBody(counts, range) {
  const part = (count, label) => `${count} assignment${count === 1 ? "" : "s"} due ${label}`;
  if (range === "today") {
    return counts.today ? `You have ${part(counts.today, "today")}.` : "You're all caught up today.";
  }
  if (range === "today_tomorrow") {
    if (!counts.today && !counts.tomorrow) return "No assignments are due today or tomorrow.";
    return `You have ${part(counts.today, "today")} and ${part(counts.tomorrow, "tomorrow")}.`;
  }
  return counts.next7 ? `You have ${part(counts.next7, "in the next 7 days")}.` : "You're all caught up for the next 7 days.";
}

async function deliverDueSummaries() {
  const { rows: due } = await query(
    `select n.notification_id, n.user_id, s.summary_range
       from notification n
       join summary_setting s on s.user_id = n.user_id
      where n.assignment_id is null and n.reminder_offset_id is null
        and n.status = 'pending' and n.scheduled_at <= now()
      order by n.scheduled_at limit 100`);

  for (const notification of due) {
    const today = localDateKey(Date.now());
    const endOffset = notification.summary_range === "today" ? 1 : notification.summary_range === "today_tomorrow" ? 2 : 7;
    const end = addDateKeyDays(today, endOffset);
    const { rows: assignments } = await query(
      `select a.due_at
         from assignment a
         join course c on c.course_id = a.course_id
         left join assignment_category cat on cat.assignment_category_id = a.assignment_category_id
        where c.user_id = $1 and a.completed_at is null and a.due_at is not null
          and coalesce(cat.is_included, true)`,
      [notification.user_id]);
    const dueKeys = assignments
      .map(row => localDateKey(new Date(row.due_at).getTime()))
      .filter(key => key >= today && key < end);
    const counts = {
      today: dueKeys.filter(key => key === today).length,
      tomorrow: dueKeys.filter(key => key === addDateKeyDays(today, 1)).length,
      next7: dueKeys.length,
    };
    const payload = JSON.stringify({
      title: "Daily summary",
      body: summaryBody(counts, notification.summary_range),
      url: "/dashboard",
    });
    const { rows: devices } = await query(
      "select push_device_id, device_token from push_device where user_id = $1",
      [notification.user_id]);
    let delivered = 0;
    const errors = [];
    for (const device of devices) {
      try {
        await sendNotification(decodePushDeviceToken(device.device_token), payload, { TTL: 3600 });
        delivered += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query("delete from push_device where push_device_id = $1", [device.push_device_id]);
        } else errors.push(String(err.message || "Push delivery failed").slice(0, 300));
      }
    }
    await query(
      "update notification set status = $2, sent_at = case when $2 = 'sent' then now() else sent_at end where notification_id = $1 and status = 'pending'",
      [notification.notification_id, delivered ? "sent" : "failed"]);
    if (!delivered && errors.length) console.error(`Summary notification ${notification.notification_id} failed:`, errors[0]);
  }
}

let running = false;
export async function runReminderCycle() {
  if (running || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  running = true;
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query("select pg_try_advisory_lock($1) as locked", [SCHEDULER_LOCK]);
    if (!rows[0].locked) return;
    try {
      await rebuildNotifications();
      await rebuildSummaryNotifications();
      await deliverDueNotifications();
      await deliverDueSummaries();
      await query("delete from notification where status in ('sent', 'failed', 'cancelled') and coalesce(sent_at, scheduled_at) < now() - interval '90 days'");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [SCHEDULER_LOCK]);
    }
  } catch (err) {
    console.error("Notification cycle failed:", err.message);
  } finally {
    client?.release();
    running = false;
  }
}

export function startReminderScheduler() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("Push reminders are inactive: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
    return;
  }
  setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  runReminderCycle();
  const timer = setInterval(runReminderCycle, POLL_MS);
  timer.unref();
}
