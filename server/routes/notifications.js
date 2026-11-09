import { Router } from "express";
import { sendNotification } from "web-push";
import pool, { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";
import { decodePushDeviceToken, encodePushDeviceToken } from "../push-device-token.js";

const router = Router();
const MAX_REMINDER_MINUTES = 999 * 24 * 60;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SUMMARY_RANGES = new Set(["today", "today_tomorrow", "next_7_days"]);

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function parseSettings(body) {
  if (!Array.isArray(body?.reminder_minutes) || body.reminder_minutes.length > 20) {
    throw new ValidationError("Choose up to 20 reminder points");
  }
  const minutes = [...new Set(body.reminder_minutes.map(Number))].sort((a, b) => a - b);
  if (minutes.some(n => !Number.isInteger(n) || n < 1 || n > MAX_REMINDER_MINUTES)) {
    throw new ValidationError("Reminder points must be between 1 minute and 999 days");
  }
  if (typeof body.quiet_hours_enabled !== "boolean") throw new ValidationError("Choose whether quiet hours are enabled");
  for (const key of ["quiet_hours_start", "quiet_hours_end"]) {
    if (typeof body[key] !== "string" || !TIME_RE.test(body[key])) throw new ValidationError("Quiet hours must use valid times");
  }
  const timezone = String(body.timezone || "");
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
  catch { throw new ValidationError("Choose a valid time zone"); }
  if (typeof body.push_enabled !== "boolean") throw new ValidationError("Choose whether push notifications are enabled");
  return { ...body, reminder_minutes: minutes, timezone };
}

function parseSummarySettings(body) {
  if (typeof body?.enabled !== "boolean") throw new ValidationError("Choose whether summary notifications are enabled");
  if (typeof body?.send_time !== "string" || !TIME_RE.test(body.send_time)) {
    throw new ValidationError("Choose a valid summary time");
  }
  if (!SUMMARY_RANGES.has(body.summary_range)) throw new ValidationError("Choose a valid summary range");
  if (!Array.isArray(body.days) || body.days.length > 7) throw new ValidationError("Choose summary days");
  const days = [...new Set(body.days.map(Number))].sort((a, b) => a - b);
  if (days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ValidationError("Summary days must be between Sunday (0) and Saturday (6)");
  }
  if (body.enabled && days.length === 0) throw new ValidationError("Select at least one day for the summary");
  return { ...body, days };
}

async function summarySettingsFor(userId) {
  const [{ rows: settings }, { rows: days }] = await Promise.all([
    query(`select to_char(send_time, 'HH24:MI') as send_time, summary_range
             from summary_setting where user_id = $1`, [userId]),
    query("select day_of_week from summary_day where user_id = $1 order by day_of_week", [userId]),
  ]);
  const setting = settings[0];
  return {
    enabled: Boolean(setting),
    days: setting ? days.map(row => Number(row.day_of_week)) : [1, 2, 3, 4, 5],
    send_time: setting?.send_time || "07:30",
    summary_range: setting?.summary_range || "today_tomorrow",
  };
}

function parseSubscription(body) {
  const endpoint = String(body?.endpoint || "");
  const p256dh = String(body?.keys?.p256dh || "");
  const auth = String(body?.keys?.auth || "");
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new ValidationError("Invalid browser push subscription"); }
  const host = parsed.hostname.toLowerCase();
  const trustedPushHost = host === "fcm.googleapis.com" || host === "fcmregistrations.googleapis.com" ||
    host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" ||
    host === "push.services.opera.com" || host.endsWith(".notify.windows.com");
  const base64UrlKey = /^[A-Za-z0-9_-]+={0,2}$/;
  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password || !trustedPushHost ||
      endpoint.length > 2048 || !p256dh || !base64UrlKey.test(p256dh) || p256dh.length > 256 ||
      !auth || !base64UrlKey.test(auth) || auth.length > 256) {
    throw new ValidationError("Invalid browser push subscription");
  }
  return { endpoint, keys: { p256dh, auth } };
}

function requirePushConfig() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new ValidationError("Push notifications are not configured on the server yet");
  }
}

async function responseFor(userId) {
  const [{ rows: offsets }, { rows: quiet }, { rows: devices }] = await Promise.all([
    query("select minutes_before from reminder_offset where user_id = $1 order by minutes_before", [userId]),
    query(`select to_char(start_time, 'HH24:MI') as start_time,
                  to_char(end_time, 'HH24:MI') as end_time
             from quiet_hours where user_id = $1`, [userId]),
    query("select count(*)::int as count from push_device where user_id = $1", [userId]),
  ]);
  const quietHours = quiet[0];
  return {
    reminder_minutes: offsets.map(row => row.minutes_before),
    assignment_reminders_enabled: offsets.length > 0,
    quiet_hours_enabled: Boolean(quietHours),
    quiet_hours_start: quietHours?.start_time || "23:00",
    quiet_hours_end: quietHours?.end_time || "08:00",
    timezone: "America/Denver",
    push_enabled: devices[0].count > 0,
    push_subscription_count: devices[0].count,
    push_device_count: devices[0].count,
  };
}

router.get("/notifications/push-config", requireLogin, (req, res) => {
  res.json({
    enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    public_key: process.env.VAPID_PUBLIC_KEY || null,
  });
});

router.get("/notifications/preferences", requireLogin, async (req, res, next) => {
  try { res.json(await responseFor(req.session.userId)); }
  catch (err) { next(err); }
});

router.get("/notifications/summary", requireLogin, async (req, res, next) => {
  try { res.json(await summarySettingsFor(req.session.userId)); }
  catch (err) { next(err); }
});

router.put("/notifications/summary", requireLogin, async (req, res, next) => {
  let client;
  try {
    const f = parseSummarySettings(req.body || {});
    client = await pool.connect();
    await client.query("begin");
    if (f.enabled) {
      await client.query(
        `insert into summary_setting (user_id, send_time, summary_range)
         values ($1, $2::time, $3)
         on conflict (user_id) do update set send_time = excluded.send_time,
           summary_range = excluded.summary_range`,
        [req.session.userId, f.send_time, f.summary_range]);
      await client.query("delete from summary_day where user_id = $1", [req.session.userId]);
      await client.query(
        `insert into summary_day (user_id, day_of_week)
         select $1, selected.day_of_week from unnest($2::smallint[]) as selected(day_of_week)`,
        [req.session.userId, f.days]);
    } else {
      await client.query("delete from summary_setting where user_id = $1", [req.session.userId]);
      await client.query(
        `update notification set status = 'cancelled'
          where user_id = $1 and assignment_id is null and reminder_offset_id is null
            and status = 'pending'`,
        [req.session.userId]);
    }
    await client.query("commit");
    res.json(await summarySettingsFor(req.session.userId));
  } catch (err) {
    if (client) await client.query("rollback").catch(() => {});
    next(err);
  } finally {
    client?.release();
  }
});

router.put("/notifications/preferences", requireLogin, async (req, res, next) => {
  try {
    const f = parseSettings(req.body || {});
    if (f.push_enabled) {
      requirePushConfig();
      const { rows } = await query("select 1 from push_device where user_id = $1 limit 1", [req.session.userId]);
      if (!rows.length) throw new ValidationError("Connect this browser to push notifications before enabling delivery");
    }

    await query("delete from reminder_offset where user_id = $1 and not (minutes_before = any($2::int[]))",
      [req.session.userId, f.reminder_minutes]);
    if (f.reminder_minutes.length) {
      await query(
        `insert into reminder_offset (user_id, minutes_before)
         select $1, selected.minutes_before from unnest($2::int[]) as selected(minutes_before)
         on conflict (user_id, minutes_before) do nothing`,
        [req.session.userId, f.reminder_minutes]);
    }

    if (f.quiet_hours_enabled) {
      await query(
        `insert into quiet_hours (user_id, start_time, end_time)
         values ($1, $2::time, $3::time)
         on conflict (user_id) do update set start_time = excluded.start_time,
           end_time = excluded.end_time`,
        [req.session.userId, f.quiet_hours_start, f.quiet_hours_end]);
    } else {
      await query("delete from quiet_hours where user_id = $1", [req.session.userId]);
    }

    if (!f.push_enabled) await query("delete from push_device where user_id = $1", [req.session.userId]);
    res.json(await responseFor(req.session.userId));
  } catch (err) { next(err); }
});

router.post("/notifications/subscription", requireLogin, async (req, res, next) => {
  try {
    requirePushConfig();
    const subscription = parseSubscription(req.body);
    const deviceToken = encodePushDeviceToken(subscription);
    const { rows: devices } = await query(
      `select push_device_id, device_token from push_device
        where device_token = $1 or position($2 in device_token) > 0`,
      [deviceToken, subscription.endpoint]);
    let existing = null;
    for (const device of devices) {
      try {
        if (decodePushDeviceToken(device.device_token).endpoint === subscription.endpoint) existing = device;
      } catch { /* A non-browser token cannot match this Web Push endpoint. */ }
    }
    try {
      if (existing) {
        await query("update push_device set user_id = $1, device_token = $2, registered_at = now() where push_device_id = $3",
          [req.session.userId, deviceToken, existing.push_device_id]);
      } else {
        await query("insert into push_device (user_id, device_token, registered_at) values ($1, $2, now())",
          [req.session.userId, deviceToken]);
      }
    } catch (err) {
      if (err.code === "22001") {
        throw new ValidationError("The Supabase device_token column is still too short. Widen it to varchar(2600), then try again.");
      }
      throw err;
    }
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/notifications/subscriptions", requireLogin, async (req, res, next) => {
  try {
    await query("delete from push_device where user_id = $1", [req.session.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post("/notifications/test", requireLogin, async (req, res, next) => {
  try {
    requirePushConfig();
    const { rows: devices } = await query(
      "select push_device_id, device_token from push_device where user_id = $1",
      [req.session.userId]);
    if (!devices.length) throw new ValidationError("Connect this browser to push notifications first");

    const payload = JSON.stringify({
      title: "Push test",
      body: "Your browser push notifications are working.",
      url: "/assignments",
    });
    let delivered = 0;
    const errors = [];
    for (const device of devices) {
      try {
        await sendNotification(decodePushDeviceToken(device.device_token), payload, { TTL: 60 });
        delivered += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query("delete from push_device where push_device_id = $1", [device.push_device_id]);
        } else errors.push(String(err.message || "Push delivery failed").slice(0, 200));
      }
    }
    if (!delivered) throw new ValidationError(errors[0] || "No active browser push subscription was found");
    res.json({ ok: true, delivered });
  } catch (err) { next(err); }
});

export default router;
