/* Streaks shown on the dashboard.

   Check-in streak: consecutive days the student used DueList, counted back
   from today. Weekend days count when the student checked in, but a missed
   Saturday or Sunday doesn't break the run; a missed weekday does. Today is
   always a check-in day when this runs, since opening the dashboard records
   one first.

   No-late-turn-in streak: days since an assignment was last completed on a
   day after its due date (campus time). A student who has never been late
   counts from the day the account was created. */

import { query } from "./db.js";
import { CAMPUS_TZ } from "./ics.js";

const DAY_MS = 86400000;

/* "YYYY-MM-DD" <-> a UTC-noon Date, so day arithmetic never crosses a DST edge */
function toDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
function toStamp(d) { return d.toISOString().slice(0, 10); }
function isWeekend(d) { const w = d.getUTCDay(); return w === 0 || w === 6; }

/* dates: iterable of "YYYY-MM-DD"; today: "YYYY-MM-DD". Returns the current run. */
export function checkInStreak(dates, today) {
  const set = dates instanceof Set ? dates : new Set(dates);
  let run = 0;
  for (let d = toDate(today), guard = 0; guard < 4000; guard++, d = new Date(d.getTime() - DAY_MS)) {
    const s = toStamp(d);
    if (set.has(s)) run++;
    else if (!isWeekend(d)) break;
  }
  return run;
}

/* Whole days from `from` to `today` (both "YYYY-MM-DD"); never negative. */
export function daysSince(from, today) {
  return Math.max(0, Math.round((toDate(today) - toDate(from)) / DAY_MS));
}

export async function getStreaks(userId) {
  const { rows: [me] } = await query(
    `select to_char(now() at time zone $2, 'YYYY-MM-DD') as today,
            to_char(created_at at time zone $2, 'YYYY-MM-DD') as created
       from app_user where user_id = $1`,
    [userId, CAMPUS_TZ]);
  if (!me) return null;

  const { rows: days } = await query(
    `select to_char(check_in_date, 'YYYY-MM-DD') as day
       from user_check_in
      where user_id = $1 and check_in_date >= ($2::date - 400)`,
    [userId, me.today]);
  const checkIn = checkInStreak(days.map(r => r.day), me.today);

  const { rows: [late] } = await query(
    `select to_char(max((a.completed_at at time zone $2)::date), 'YYYY-MM-DD') as last_late
       from assignment a join course c on c.course_id = a.course_id
      where c.user_id = $1 and a.completed_at is not null
        and (a.completed_at at time zone $2)::date > (a.due_at at time zone $2)::date`,
    [userId, CAMPUS_TZ]);
  const noLate = daysSince(late.last_late || me.created, me.today);

  const { rows: [best] } = await query(
    `update app_user
        set check_in_best_streak = greatest(check_in_best_streak, $2),
            no_past_due_best_streak = greatest(no_past_due_best_streak, $3)
      where user_id = $1
      returning check_in_best_streak, no_past_due_best_streak`,
    [userId, checkIn, noLate]);

  return {
    check_in: { current: checkIn, best: best.check_in_best_streak },
    no_past_due: { current: noLate, best: best.no_past_due_best_streak, last_late: late.last_late || null },
  };
}
