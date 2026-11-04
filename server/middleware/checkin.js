/* Daily check-ins. The first time a signed-in user does anything on a given
   campus-time day (sign in, open a page, save an assignment...), a row lands
   in user_check_in. Nothing is shown to the user; the dashboard reads the
   rows back as a streak. */

import { query } from "../db.js";
import { CAMPUS_TZ } from "../ics.js";

/* Insert today's check-in for the user (no-op if it exists). The session
   remembers the day so later requests the same day skip the write. */
export async function recordCheckIn(userId, session) {
  const day = todayStamp();
  await query(
    "insert into user_check_in (user_id, check_in_date) values ($1, $2::date) on conflict do nothing",
    [userId, day]);
  if (session) session.checkedInOn = day;
  return day;
}

/* Express middleware for /api: record a check-in on the first request of the
   day. A failure here must never fail the request, so errors are only logged. */
export function checkInOnActivity(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId || req.session.checkedInOn === todayStamp()) return next();
  recordCheckIn(userId, req.session)
    .catch(err => console.error("check-in failed:", err.message))
    .finally(next);
}

/* Today's date in campus time, as YYYY-MM-DD (same shape Postgres returns). */
export function todayStamp() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
