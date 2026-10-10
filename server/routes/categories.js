/* Per-class assignment categories and how the student maps them.

   A category is a Canvas assignment group, a Canvas planner bucket, or a
   Learning Suite keyword bucket. The student maps each one to a global
   assignment_type, can give it a default due time (used for all-day feed
   items), and can exclude it so its items never show. Sync creates
   categories but never overwrites a mapping. */

import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";
import * as canvas from "../canvas.js";
import * as ls from "../learningsuite.js";

const router = Router();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ownedCourse(courseId, userId) {
  const { rows } = await query(
    `select c.*, s.name as source from course c join lms_source s on s.lms_source_id = c.lms_source_id
      where c.course_id = $1 and c.user_id = $2`,
    [courseId, userId]);
  return rows[0] || null;
}

async function listCategories(courseId) {
  const { rows } = await query(
    `select cat.assignment_category_id, cat.name, cat.external_category_id, cat.assignment_type_id,
            to_char(cat.default_due_time, 'HH24:MI') as default_due_time, cat.is_included,
            (select count(*)::int from assignment a where a.assignment_category_id = cat.assignment_category_id) as assignment_count
       from assignment_category cat
      where cat.course_id = $1
      order by cat.name, cat.assignment_category_id`,
    [courseId]);
  return rows;
}

function userError(err, res, next) {
  if (err instanceof canvas.CanvasError || err instanceof ls.FeedError) return res.status(err.status === 401 ? 400 : err.status).json({ error: err.message });
  next(err);
}

/* GET /api/courses/:id/categories */
router.get("/courses/:id/categories", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const course = id && await ownedCourse(id, req.session.userId);
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.json(await listCategories(id));
  } catch (err) { next(err); }
});

/* POST /api/courses/:id/categories/discover — find the class's categories at
   the source (Canvas assignment groups, or feed keyword buckets), create any
   that are missing, and return them with item counts. */
router.post("/courses/:id/categories/discover", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const course = id && await ownedCourse(id, req.session.userId);
    if (!course) return res.status(404).json({ error: "Course not found" });
    const typeIds = await ls.assignmentTypeIds();

    let found;
    if (course.source === "Canvas") {
      if (!course.external_course_id) return res.status(400).json({ error: "Pick the Canvas class first" });
      const conn = await canvas.getConnection(req.session.userId);
      if (!conn) return res.status(400).json({ error: "Canvas is not connected. Add your access token in Settings." });
      found = await canvas.discoverCategories(course, conn, typeIds);
    } else if (course.source === "Learning Suite") {
      if (!course.ics_feed_url) return res.status(400).json({ error: "Add the iCalendar link first" });
      found = await ls.discoverCategories(course, typeIds);
    } else {
      return res.status(400).json({ error: "Manual classes do not have categories to map" });
    }

    /* Merge the live counts onto the full stored list (planner buckets etc. may exist from earlier syncs) */
    const counts = Object.fromEntries(found.map(c => [c.assignment_category_id, c.item_count]));
    const all = await listCategories(id);
    res.json(all.map(c => ({ ...c, item_count: counts[c.assignment_category_id] ?? null })));
  } catch (err) { userError(err, res, next); }
});

/* PUT /api/courses/:id/categories  { categories: [{assignment_category_id, assignment_type_id, default_due_time, is_included}] } */
router.put("/courses/:id/categories", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const course = id && await ownedCourse(id, req.session.userId);
    if (!course) return res.status(404).json({ error: "Course not found" });
    const list = Array.isArray(req.body?.categories) ? req.body.categories : null;
    if (!list) return res.status(400).json({ error: "categories must be a list" });

    const { rows: types } = await query("select assignment_type_id from assignment_type");
    const typeSet = new Set(types.map(t => t.assignment_type_id));
    const { rows: own } = await query("select assignment_category_id from assignment_category where course_id = $1", [id]);
    const ownSet = new Set(own.map(c => c.assignment_category_id));

    for (const c of list) {
      const catId = parseId(c.assignment_category_id);
      if (!catId || !ownSet.has(catId)) return res.status(400).json({ error: "That category does not belong to this class" });
      const typeId = c.assignment_type_id == null || c.assignment_type_id === "" ? null : Number(c.assignment_type_id);
      if (typeId !== null && !typeSet.has(typeId)) return res.status(400).json({ error: "Choose a valid assignment type" });
      const time = c.default_due_time == null || c.default_due_time === "" ? null : String(c.default_due_time);
      if (time !== null && !TIME_RE.test(time)) return res.status(400).json({ error: "Default due time must be HH:MM" });
      const included = c.is_included === undefined ? true : c.is_included;
      if (typeof included !== "boolean") return res.status(400).json({ error: "is_included must be true or false" });
      await query(
        `update assignment_category set assignment_type_id = $2, default_due_time = $3, is_included = $4 where assignment_category_id = $1`,
        [catId, typeId, time, included]);
    }
    res.json(await listCategories(id));
  } catch (err) { next(err); }
});

/* POST /api/courses/:id/sync — sync just this class from its source */
router.post("/courses/:id/sync", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const course = id && await ownedCourse(id, req.session.userId);
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.source === "Canvas") {
      if (!course.external_course_id) return res.status(400).json({ error: "Pick the Canvas class first" });
      return res.json(await canvas.syncUser(req.session.userId, id));
    }
    if (course.source === "Learning Suite") {
      if (!course.ics_feed_url) return res.status(400).json({ error: "Add the iCalendar link first" });
      const r = await ls.syncUser(req.session.userId, id);
      if (r.errors.length) return res.status(502).json({ error: r.errors[0].error });
      return res.json(r);
    }
    res.status(400).json({ error: "Manual classes are not synced" });
  } catch (err) { userError(err, res, next); }
});

export default router;
