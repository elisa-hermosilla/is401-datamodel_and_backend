import { Router } from "express";
import { query } from "../db.js";
import { requireLogin, requireAdmin } from "../middleware/auth.js";
import { todayStamp } from "../middleware/checkin.js";
import { CAMPUS_TZ } from "../ics.js";
import { tutorialTimes, firstSyncTimes, churn, fiveDayStreaks, dayRange } from "../okrs.js";
import { validateUserFields, duplicateUserMessage } from "./auth.js";
import { isBuiltInType, cleanTypeName } from "../assignmentTypes.js";

/* Admin-only API: maintain the users table and the assignment types, plus
   the two OKRs. Nothing is cached, so everything is live. Validation
   helpers throw errors with status 400; the app's error handler turns those
   into { error } replies, so the routes just pass them to next(). */
const router = Router();
router.use("/admin", requireLogin, requireAdmin);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/* ---------- Users ---------- */

const USER_LIST = `user_id, username, email, first_name, last_name, created_at, last_login_at, is_admin`;

/* A unique-constraint failure becomes a 400 with the sign-up wording */
function userError(err) {
  const dup = duplicateUserMessage(err);
  return dup ? bad(dup) : err;
}

async function otherAdminExists(userId) {
  const { rows: [{ n }] } = await query("select count(*)::int as n from app_user where is_admin and user_id <> $1", [userId]);
  return n > 0;
}

/* GET /api/admin/users — every account, by name */
router.get("/admin/users", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select ${USER_LIST} from app_user order by lower(first_name), lower(last_name), lower(username)`);
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /api/admin/users  { username, email, first_name, last_name, password, is_admin? }
   Same checks as sign-up; the password is hashed with pgcrypto's bcrypt. */
router.post("/admin/users", async (req, res, next) => {
  try {
    const f = validateUserFields(req.body);
    const isAdmin = req.body?.is_admin === true;
    const { rows: [user] } = await query(
      `insert into app_user (username, email, password_hash, first_name, last_name, is_admin)
       values ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6)
       returning ${USER_LIST}`,
      [f.username, f.email, f.password, f.first_name, f.last_name, isAdmin]);
    res.status(201).json(user);
  } catch (err) { next(userError(err)); }
});

/* PUT /api/admin/users/:id — any subset of the account fields, a new
   password (blank means keep the current one), and is_admin. You can't
   remove your own admin access, and the last admin can't be demoted. */
router.put("/admin/users/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "No such user" });
    const b = { ...(req.body || {}) };
    const has = k => Object.prototype.hasOwnProperty.call(b, k);
    if (has("password") && !b.password) delete b.password;

    const f = validateUserFields(b, { partial: true });
    const sets = [], params = [];
    for (const [k, v] of Object.entries(f)) {
      params.push(v);
      sets.push(k === "password" ? `password_hash = crypt($${params.length}, gen_salt('bf'))` : `${k} = $${params.length}`);
    }
    if (has("is_admin")) {
      if (typeof b.is_admin !== "boolean") throw bad("is_admin must be true or false");
      if (!b.is_admin && id === req.session.userId) throw bad("You can't remove your own admin access");
      if (!b.is_admin && !(await otherAdminExists(id))) throw bad("There has to be at least one admin");
      params.push(b.is_admin);
      sets.push(`is_admin = $${params.length}`);
    }
    if (!sets.length) throw bad("Nothing to update");

    params.push(id);
    const { rows: [user] } = await query(
      `update app_user set ${sets.join(", ")} where user_id = $${params.length} returning ${USER_LIST}`, params);
    if (!user) return res.status(404).json({ error: "No such user" });
    res.json(user);
  } catch (err) { next(userError(err)); }
});

/* DELETE /api/admin/users/:id — the account and, through the database's
   cascades, its classes, assignments, connected accounts, check-ins and
   notification settings. Not yourself, and not the last admin. */
router.delete("/admin/users/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "No such user" });
    if (id === req.session.userId) throw bad("You can't delete your own account from here");
    const { rows: [target] } = await query("select is_admin from app_user where user_id = $1", [id]);
    if (!target) return res.status(404).json({ error: "No such user" });
    if (target.is_admin && !(await otherAdminExists(id))) throw bad("There has to be at least one admin");
    await query("delete from app_user where user_id = $1", [id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------- Assignment types ----------
   The seed types are the syncs' lookup keys (see ../assignmentTypes.js), so
   they can be listed but not renamed or deleted. Deleting another type
   leaves its categories with no type: the foreign key is ON DELETE SET NULL. */

const TYPE_LIST = `
  select t.assignment_type_id, t.name,
         (select count(*)::int from assignment_category c
           where c.assignment_type_id = t.assignment_type_id) as categories,
         (select count(distinct co.user_id)::int
            from assignment_category c
            join course co on co.course_id = c.course_id
            join app_user u on u.user_id = co.user_id
           where c.assignment_type_id = t.assignment_type_id
             and not co.is_archived
             and u.last_login_at >= now() - interval '30 days') as active_users
    from assignment_type t`;

function typeRow(r) {
  return { ...r, built_in: isBuiltInType(r.name) };
}

async function typeById(id) {
  const { rows: [row] } = await query(`${TYPE_LIST} where t.assignment_type_id = $1`, [id]);
  return row ? typeRow(row) : null;
}

/* Another type already has this name (case-insensitively)? */
async function nameTaken(name, exceptId = 0) {
  const { rows } = await query(
    "select 1 from assignment_type where lower(name) = $1 and assignment_type_id <> $2", [name, exceptId]);
  return rows.length > 0;
}

/* GET /api/admin/assignment-types — every type with how much it is used:
   categories mapped to it, and the distinct users who signed in within the
   last 30 days and have such a category on a class that is not archived. */
router.get("/admin/assignment-types", async (req, res, next) => {
  try {
    const { rows } = await query(`${TYPE_LIST} order by t.assignment_type_id`);
    res.json(rows.map(typeRow));
  } catch (err) { next(err); }
});

/* POST /api/admin/assignment-types  { name } */
router.post("/admin/assignment-types", async (req, res, next) => {
  try {
    const name = cleanTypeName(req.body?.name);
    if (await nameTaken(name)) throw bad("That type already exists");
    const { rows: [row] } = await query(
      "insert into assignment_type (name) values ($1) returning assignment_type_id, name", [name]);
    res.status(201).json(typeRow({ ...row, categories: 0, active_users: 0 }));
  } catch (err) { next(err.code === "23505" ? bad("That type already exists") : err); }
});

/* PUT /api/admin/assignment-types/:id  { name } */
router.put("/admin/assignment-types/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = id && await typeById(id);
    if (!current) return res.status(404).json({ error: "No such type" });
    if (current.built_in) throw bad("Built-in types can't be renamed");
    const name = cleanTypeName(req.body?.name);
    if (name === current.name) return res.json(current);
    if (isBuiltInType(name) || await nameTaken(name, id)) throw bad("That type already exists");
    await query("update assignment_type set name = $2 where assignment_type_id = $1", [id, name]);
    res.json(await typeById(id));
  } catch (err) { next(err.code === "23505" ? bad("That type already exists") : err); }
});

/* DELETE /api/admin/assignment-types/:id */
router.delete("/admin/assignment-types/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = id && await typeById(id);
    if (!current) return res.status(404).json({ error: "No such type" });
    if (current.built_in) throw bad("Built-in types can't be deleted");
    await query("delete from assignment_type where assignment_type_id = $1", [id]);
    res.status(204).end();
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
