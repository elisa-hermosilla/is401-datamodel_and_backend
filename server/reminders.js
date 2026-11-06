import { sendNotification, setVapidDetails } from "web-push";
import pool, { query } from "./db.js";

const MINUTE_MS = 60_000;
const SCHEDULER_LOCK = 824901337;
const POLL_MS = 60_000;

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
  while (isQuiet(outside)) outside -= 60 * MINUTE_MS;
  let inside = outside + 60 * MINUTE_MS;
  while (inside - outside > MINUTE_MS) {
    const steps = Math.floor((inside - outside) / (2 * MINUTE_MS));
    const middle = outside + Math.max(1, steps) * MINUTE_MS;
    if (isQuiet(middle)) inside = middle;
    else outside = middle;
  }
  return inside;
}

/* Mirrors the Settings preview: quiet-hour minutes are skipped while counting
   backwards from the assignment's due time. The loop only runs when a plan is
   recalculated after an assignment or preference changes. */
function scheduledTime(dueAt, minutesBefore, prefs) {
  let cursor = new Date(dueAt).getTime();
  let remaining = minutesBefore;
  while (remaining > 0) {
    cursor -= MINUTE_MS;
    if (prefs.quiet_hours_enabled && inQuietHours(
      minuteOfDayAt(cursor, prefs.timezone), prefs.quiet_hours_start, prefs.quiet_hours_end
    )) {
      cursor = firstQuietMinute(cursor, prefs);
    } else remaining -= 1;
  }
  return new Date(cursor);
}

async function rebuildDirtySchedules() {
  const { rows: dirty } = await query(
    `select assignment_id, requested_at from reminder_schedule_dirty
      order by requested_at limit 300`);

  for (const item of dirty) {
    const { rows } = await query(
      `select a.assignment_id, a.title, a.due_at, a.completed_at, c.user_id,
              p.assignment_reminders_enabled, p.reminder_minutes,
              p.quiet_hours_enabled, to_char(p.quiet_hours_start, 'HH24:MI') as quiet_hours_start,
              to_char(p.quiet_hours_end, 'HH24:MI') as quiet_hours_end,
              p.timezone, p.push_enabled
         from assignment a
         join course c on c.course_id = a.course_id
         left join assignment_category cat on cat.assignment_category_id = a.assignment_category_id
         left join notification_preferences p on p.user_id = c.user_id
        where a.assignment_id = $1 and coalesce(cat.is_included, true)`,
      [item.assignment_id]);

    const assignment = rows[0];
    await query("delete from push_reminder_job where assignment_id = $1 and status = 'pending'", [item.assignment_id]);
    if (assignment && !assignment.completed_at && assignment.push_enabled && assignment.assignment_reminders_enabled) {
      for (const minutes of assignment.reminder_minutes || []) {
        const fireAt = scheduledTime(assignment.due_at, minutes, assignment);
        // Do not surprise users with a delayed reminder when a new assignment
        // or preference is saved after that reminder point has already passed.
        if (fireAt.getTime() <= Date.now()) continue;
        await query(
          `insert into push_reminder_job
             (assignment_id, user_id, reminder_minutes, due_at, scheduled_at, next_attempt_at)
           values ($1, $2, $3, $4, $5, $5)
           on conflict (assignment_id, due_at, reminder_minutes) do nothing`,
          [assignment.assignment_id, assignment.user_id, minutes, assignment.due_at, fireAt]);
      }
    }
    await query(
      `delete from reminder_schedule_dirty where assignment_id = $1 and requested_at = $2`,
      [item.assignment_id, item.requested_at]);
  }
}

function pushPayload(job) {
  const minutes = Number(job.reminder_minutes);
  let when;
  if (minutes % 1440 === 0) when = `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  else if (minutes % 60 === 0) when = `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  else when = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return JSON.stringify({
    title: "Assignment reminder",
    body: `${job.title} is due in ${when}${job.course_code ? ` for ${job.course_code}` : ""}.`,
    url: "/assignments",
  });
}

async function deliverDueJobs() {
  const { rows: jobs } = await query(
    `select j.job_id, j.assignment_id, j.user_id, j.reminder_minutes,
            a.title, c.course_code
       from push_reminder_job j
       join assignment a on a.assignment_id = j.assignment_id
       join course c on c.course_id = a.course_id
      join notification_preferences p on p.user_id = j.user_id
        and p.push_enabled and p.assignment_reminders_enabled
      where j.status = 'pending' and j.scheduled_at <= now()
        and j.next_attempt_at <= now() and j.due_at > now() and a.completed_at is null
      order by j.scheduled_at limit 100`);

  for (const job of jobs) {
    const { rows: subscriptions } = await query(
      "select subscription_id, endpoint, p256dh, auth from web_push_subscription where user_id = $1",
      [job.user_id]);
    if (!subscriptions.length) {
      await query("update push_reminder_job set next_attempt_at = now() + interval '10 minutes' where job_id = $1", [job.job_id]);
      continue;
    }

    let sent = 0;
    const errors = [];
    for (const sub of subscriptions) {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload(job),
          { TTL: 3600 }
        );
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query("delete from web_push_subscription where subscription_id = $1", [sub.subscription_id]);
        } else {
          errors.push(String(err.message || "Push delivery failed").slice(0, 300));
        }
      }
    }
    if (sent) {
      await query(
        "update push_reminder_job set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where job_id = $1 and status = 'pending'",
        [job.job_id]);
    } else if (errors.length) {
      await query(
        "update push_reminder_job set attempts = attempts + 1, next_attempt_at = now() + interval '1 minute', last_error = $2 where job_id = $1 and status = 'pending'",
        [job.job_id, errors.join("; ").slice(0, 1000)]);
      console.error(`Push reminder ${job.job_id} failed:`, errors[0]);
    }
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
      await rebuildDirtySchedules();
      await deliverDueJobs();
      await query("delete from push_reminder_job where status = 'sent' and sent_at < now() - interval '90 days'");
      await query("delete from push_reminder_job where status = 'pending' and due_at <= now()");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [SCHEDULER_LOCK]);
    }
  } catch (err) {
    console.error("Assignment reminder cycle failed:", err.message);
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
