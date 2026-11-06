import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";

const router = Router();
const MAX_REMINDER_MINUTES = 999 * 24 * 60;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function parseSettings(body) {
  if (typeof body?.assignment_reminders_enabled !== "boolean") throw new ValidationError("Choose whether assignment reminders are enabled");
  if (!Array.isArray(body.reminder_minutes) || body.reminder_minutes.length > 20) throw new ValidationError("Choose up to 20 reminder points");
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

async function ensurePreferences(userId) {
  await query("insert into notification_preferences (user_id) values ($1) on conflict (user_id) do nothing", [userId]);
  const { rows } = await query(
    `select user_id, assignment_reminders_enabled, reminder_minutes,
            quiet_hours_enabled, to_char(quiet_hours_start, 'HH24:MI') as quiet_hours_start,
            to_char(quiet_hours_end, 'HH24:MI') as quiet_hours_end,
            timezone, push_enabled, updated_at
       from notification_preferences where user_id = $1`,
    [userId]);
  return rows[0];
}

async function responseFor(userId) {
  const prefs = await ensurePreferences(userId);
  const { rows } = await query("select count(*)::int as count from web_push_subscription where user_id = $1", [userId]);
  return { ...prefs, push_subscription_count: rows[0].count };
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

router.put("/notifications/preferences", requireLogin, async (req, res, next) => {
  try {
    const f = parseSettings(req.body || {});
    if (f.push_enabled) {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        throw new ValidationError("Push notifications are not configured on the server yet");
      }
      const { rows } = await query("select 1 from web_push_subscription where user_id = $1 limit 1", [req.session.userId]);
      if (!rows.length) throw new ValidationError("Connect this browser to push notifications before enabling delivery");
    }
    await query(
      `insert into notification_preferences
         (user_id, assignment_reminders_enabled, reminder_minutes, quiet_hours_enabled,
          quiet_hours_start, quiet_hours_end, timezone, push_enabled, updated_at)
       values ($1, $2, $3::int[], $4, $5::time, $6::time, $7, $8, now())
       on conflict (user_id) do update set
         assignment_reminders_enabled = excluded.assignment_reminders_enabled,
         reminder_minutes = excluded.reminder_minutes,
         quiet_hours_enabled = excluded.quiet_hours_enabled,
         quiet_hours_start = excluded.quiet_hours_start,
         quiet_hours_end = excluded.quiet_hours_end,
         timezone = excluded.timezone,
         push_enabled = excluded.push_enabled,
         updated_at = now()`,
      [req.session.userId, f.assignment_reminders_enabled, f.reminder_minutes,
       f.quiet_hours_enabled, f.quiet_hours_start, f.quiet_hours_end, f.timezone, f.push_enabled]);
    res.json(await responseFor(req.session.userId));
  } catch (err) { next(err); }
});

router.post("/notifications/subscription", requireLogin, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    const p256dh = String(req.body?.keys?.p256dh || "");
    const auth = String(req.body?.keys?.auth || "");
    let parsedEndpoint;
    try { parsedEndpoint = new URL(endpoint); } catch { throw new ValidationError("Invalid browser push subscription"); }
    const host = parsedEndpoint.hostname.toLowerCase();
    const trustedPushHost = host === "fcm.googleapis.com" || host === "fcmregistrations.googleapis.com" ||
      host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" ||
      host === "push.services.opera.com" || host.endsWith(".notify.windows.com");
    const base64UrlKey = /^[A-Za-z0-9_-]+={0,2}$/;
    if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.port || parsedEndpoint.username || parsedEndpoint.password ||
        !trustedPushHost || endpoint.length > 2048 ||
        !base64UrlKey.test(p256dh) || p256dh.length > 256 || !base64UrlKey.test(auth) || auth.length > 256) {
      throw new ValidationError("Invalid browser push subscription");
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      throw new ValidationError("Push notifications are not configured on the server yet");
    }
    await query(
      `insert into web_push_subscription (user_id, endpoint, p256dh, auth, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (endpoint) do update set user_id = excluded.user_id,
         p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()`,
      [req.session.userId, endpoint, p256dh, auth]);
    await query(
      "update push_reminder_job set next_attempt_at = now() where user_id = $1 and status = 'pending'",
      [req.session.userId]);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/notifications/subscription", requireLogin, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    if (!endpoint || endpoint.length > 2048) throw new ValidationError("Invalid browser push subscription");
    await query("delete from web_push_subscription where user_id = $1 and endpoint = $2", [req.session.userId, endpoint]);
    res.status(204).end();
  } catch (err) { next(err); }
});

router.delete("/notifications/subscriptions", requireLogin, async (req, res, next) => {
  try {
    await query("delete from web_push_subscription where user_id = $1", [req.session.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
