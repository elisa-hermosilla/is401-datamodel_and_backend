/* Sync limits.

   A class can be synced once every SYNC_COOLDOWN_HOURS (default 3), counted
   from its own last counted sync (course.cooldown_synced_at). Setup syncs
   (the quick start, the class modal's Finish) don't set that stamp, so a
   newly added class, and one just configured, always sync right away.
   After SYNC_REMINDER_HOURS without a sync (default 48) the sidebar nudges
   the student. Both come from the environment: the deployed site runs with
   the defaults, while a local .env can set SYNC_COOLDOWN_HOURS=0 to sync
   freely during development. */

import { CAMPUS_TZ } from "./ics.js";

function hoursEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function cooldownHours() { return hoursEnv("SYNC_COOLDOWN_HOURS", 3); }
export function reminderHours() { return hoursEnv("SYNC_REMINDER_HOURS", 48); }

/* ISO time when a class whose counted sync was at `cooldownSyncedAt` may
   sync again, or null when it may sync now. */
export function nextSyncAt(cooldownSyncedAt, now = Date.now()) {
  const hours = cooldownHours();
  if (!hours || !cooldownSyncedAt) return null;
  const t = new Date(cooldownSyncedAt).getTime() + hours * 3600000;
  return t > now ? new Date(t).toISOString() : null;
}

export function canSync(course, now = Date.now()) {
  return !nextSyncAt(course.cooldown_synced_at, now);
}

/* For a set of linked classes: null when any of them may sync now, otherwise
   the earliest time one of them may. */
export function earliestNextSyncAt(courses, now = Date.now()) {
  let earliest = null;
  for (const c of courses) {
    const next = nextSyncAt(c.cooldown_synced_at, now);
    if (!next) return null;
    if (!earliest || next < earliest) earliest = next;
  }
  return earliest;
}

/* "2:15 PM" or "tomorrow at 8:00 AM", campus time */
export function fmtNext(iso) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CAMPUS_TZ }).format(d);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TZ });
  return day.format(d) === day.format(new Date()) ? time : `tomorrow at ${time}`;
}

export function syncTooSoonMessage(course, next) {
  const h = cooldownHours();
  return `${course.course_code} was synced less than ${h} hour${h === 1 ? "" : "s"} ago. You can sync it again at ${fmtNext(next)}.`;
}
