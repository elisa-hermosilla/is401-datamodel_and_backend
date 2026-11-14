import { Router } from "express";
import { query } from "../db.js";
import { requireLogin, requireAdmin } from "../middleware/auth.js";
import { todayStamp } from "../middleware/checkin.js";
import { CAMPUS_TZ } from "../ics.js";

/* Admin-only API: the user list with the admin flag, and the two OKRs.
   Everything here reads app_user and user_check_in; nothing is cached, so
   the numbers are live. */
const router = Router();
router.use("/admin", requireLogin, requireAdmin);

const USER_LIST = `user_id, username, email, first_name, last_name, created_at,
  last_login_at, onboarding_completed_at, is_admin`;

router.get("/admin/users", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select ${USER_LIST} from app_user order by lower(first_name), lower(last_name), lower(username)`);
    res.json(rows);
  } catch (err) { next(err); }
});

/* PUT /api/admin/users/:id/admin  { is_admin: true|false }
   You can't remove your own admin (so the page never locks you out mid-edit),
   and the last admin can't be removed by anyone. */
router.put("/admin/users/:id/admin", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const isAdmin = req.body?.is_admin;
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad user id" });
    if (typeof isAdmin !== "boolean") return res.status(400).json({ error: "is_admin must be true or false" });
    if (!isAdmin && id === req.session.userId) return res.status(400).json({ error: "You can't remove your own admin access" });
    if (!isAdmin) {
      const { rows: [{ n }] } = await query("select count(*)::int as n from app_user where is_admin and user_id <> $1", [id]);
      if (n === 0) return res.status(400).json({ error: "There has to be at least one admin" });
    }
    const { rows: [user] } = await query(
      `update app_user set is_admin = $2 where user_id = $1 returning ${USER_LIST}`, [id, isAdmin]);
    if (!user) return res.status(404).json({ error: "No such user" });
    res.json(user);
  } catch (err) { next(err); }
});

/* ---------- OKRs ----------

   Retention, for each of the last N campus days:
     total_users       accounts created on or before that day
     active_users      distinct users with a check-in in the 30 days ending that day
     avg_days_per_week mean over the active users of (check-in days in the
                       window / window length) * 7; the window is 30 days, or
                       the account's age when younger (never under 7), so a
                       day-old account with one visit doesn't score 7/7
   Setup: how many accounts have finished the quick start and how long it took
   them, measured from account creation to the Finish click. */

const RANGES = new Set([30, 90, 180]);

async function retentionSeries(days) {
  const today = todayStamp();
  const { rows } = await query(`
    with days as (
      select d::date as day
      from generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') d
    )
    select to_char(day, 'YYYY-MM-DD') as day,
      (select count(*) from app_user u where (u.created_at at time zone '${CAMPUS_TZ}')::date <= day)::int as total_users,
      a.active_users,
      round(a.avg_days_per_week::numeric, 2)::float as avg_days_per_week
    from days
    cross join lateral (
      select count(*)::int as active_users,
             coalesce(avg(per.days_in_window::float / per.window_days * 7), 0) as avg_days_per_week
      from (
        select c.user_id,
               count(distinct c.check_in_date) as days_in_window,
               least(30, greatest(7, day - (u.created_at at time zone '${CAMPUS_TZ}')::date + 1)) as window_days
        from user_check_in c
        join app_user u on u.user_id = c.user_id
        where c.check_in_date > day - 30 and c.check_in_date <= day
        group by c.user_id, u.created_at
      ) per
    ) a
    order by day`, [today, days]);
  for (const r of rows) r.active_pct = r.total_users ? Math.round(r.active_users / r.total_users * 1000) / 10 : 0;
  return rows;
}

const BUCKETS = [
  { key: "under_5", label: "Under 5 minutes", max: 5 },
  { key: "5_to_15", label: "5 to 15 minutes", max: 15 },
  { key: "15_to_60", label: "15 minutes to 1 hour", max: 60 },
  { key: "1_to_24h", label: "1 hour to 1 day", max: 1440 },
  { key: "over_1d", label: "More than a day", max: Infinity },
];

async function setupStats() {
  const { rows } = await query(`
    select extract(epoch from onboarding_completed_at - created_at) / 60 as minutes
    from app_user order by minutes nulls last`);
  const total = rows.length;
  const done = rows.filter(r => r.minutes !== null).map(r => Number(r.minutes));
  const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : null;
  const median = done.length
    ? (done.length % 2 ? done[(done.length - 1) / 2] : (done[done.length / 2 - 1] + done[done.length / 2]) / 2)
    : null;
  const buckets = BUCKETS.map(b => ({ key: b.key, label: b.label, count: 0 }));
  for (const m of done) buckets[BUCKETS.findIndex(b => m < b.max)].count++;
  return {
    total_users: total,
    completed_users: done.length,
    completion_pct: total ? Math.round(done.length / total * 1000) / 10 : 0,
    avg_minutes: avg === null ? null : Math.round(avg * 10) / 10,
    median_minutes: median === null ? null : Math.round(median * 10) / 10,
    buckets,
  };
}

router.get("/admin/okrs", async (req, res, next) => {
  try {
    const days = RANGES.has(Number(req.query.days)) ? Number(req.query.days) : 90;
    const [series, setup] = await Promise.all([retentionSeries(days), setupStats()]);
    const last = series[series.length - 1] || { total_users: 0, active_users: 0, active_pct: 0, avg_days_per_week: 0 };
    const { rows: [{ first }] } = await query("select min(check_in_date)::text as first from user_check_in");
    res.json({
      days,
      retention: {
        total_users: last.total_users,
        active_users: last.active_users,
        active_pct: last.active_pct,
        avg_days_per_week: last.avg_days_per_week,
        check_ins_since: first,
        series,
      },
      setup,
    });
  } catch (err) { next(err); }
});

export default router;
