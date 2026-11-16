import { Router } from "express";
import { query } from "../db.js";
import { requireLogin, requireAdmin } from "../middleware/auth.js";
import { todayStamp } from "../middleware/checkin.js";
import { CAMPUS_TZ } from "../ics.js";
import { tutorialTimes, firstSyncTimes, churn, fiveDayStreaks, dayRange } from "../okrs.js";

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
   Two objectives, two key results each; the maths lives in ../okrs.js. */
const RANGES = new Set([30, 90, 180]);

/* The quick start shipped on this campus day. Accounts created earlier never
   saw it at sign-up, so they are left out of the activation key results. */
const QUICK_START_LAUNCHED = "2026-11-05";
/* Check-ins have been recorded since this day; the retention key results
   only judge accounts created from then on. */
const CHECK_INS_SINCE = "2026-11-03";

function addDaysStamp(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

router.get("/admin/okrs", async (req, res, next) => {
  try {
    const days = RANGES.has(Number(req.query.days)) ? Number(req.query.days) : 90;
    const today = todayStamp();
    const range = dayRange(addDaysStamp(today, -(days - 1)), today);
    const [users, checkIns, syncs] = await Promise.all([
      query(`select user_id, created_at, to_char(created_at at time zone '${CAMPUS_TZ}', 'YYYY-MM-DD') as created_day,
                    onboarding_completed_at
               from app_user`),
      query("select user_id, to_char(check_in_date, 'YYYY-MM-DD') as check_in_date from user_check_in"),
      query(`select c.user_id, min(s.started_at) as first_sync
               from sync_log s join course c on c.course_id = s.course_id
              group by c.user_id`),
    ]);
    const firstSync = new Map(syncs.rows.map(r => [r.user_id, r.first_sync]));
    res.json({
      days,
      activation: {
        tutorial: tutorialTimes(users.rows, QUICK_START_LAUNCHED),
        first_sync: firstSyncTimes(users.rows, firstSync, QUICK_START_LAUNCHED),
      },
      retention: {
        churn: churn(users.rows, checkIns.rows, today, CHECK_INS_SINCE, range),
        streaks: fiveDayStreaks(checkIns.rows, today, range),
      },
    });
  } catch (err) { next(err); }
});

export default router;
