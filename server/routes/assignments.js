import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";

const router = Router();

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/* Every assignment row the UI needs, joined to its course (for the code and
   color) and its category/type (for the "Quiz" / "Exam" tag). */
const SELECT = `
  select a.*,
         c.course_code, c.color_hex, c.lms_source_id,
         cat.name as category_name,
         t.assignment_type_id, t.name as type_name
    from assignment a
    join course c on c.course_id = a.course_id
    left join assignment_category cat on cat.assignment_category_id = a.assignment_category_id
    left join assignment_type t on t.assignment_type_id = cat.assignment_type_id`;

async function fetchOne(assignmentId, userId) {
  const { rows } = await query(`${SELECT} where a.assignment_id = $1 and c.user_id = $2`, [assignmentId, userId]);
  return rows[0] || null;
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* A manual assignment's "type" is a per-course category pointing at the global
   assignment_type row. Find the course's category for that type, or make one. */
async function categoryForType(courseId, assignmentTypeId) {
  if (assignmentTypeId == null) return null;
  const { rows: types } = await query("select name from assignment_type where assignment_type_id = $1", [assignmentTypeId]);
  if (types.length === 0) throw new ValidationError("That assignment type does not exist");
  const { rows: found } = await query(
    `select assignment_category_id from assignment_category
      where course_id = $1 and assignment_type_id = $2 and external_category_id is null
      order by assignment_category_id limit 1`,
    [courseId, assignmentTypeId]);
  if (found.length) return found[0].assignment_category_id;
  const name = types[0].name.charAt(0).toUpperCase() + types[0].name.slice(1);
  const { rows: made } = await query(
    "insert into assignment_category (course_id, assignment_type_id, name) values ($1, $2, $3) returning assignment_category_id",
    [courseId, assignmentTypeId, name]);
  return made[0].assignment_category_id;
}

/* Validate the writable fields. partial=true skips missing fields (PUT). */
async function validateAssignment(body, userId, { partial }) {
  const out = {};
  const has = k => body != null && Object.prototype.hasOwnProperty.call(body, k);

  if (has("course_id") || !partial) {
    const courseId = parseId(body?.course_id);
    if (!courseId) throw new ValidationError("Choose a class");
    const { rows } = await query("select 1 from course where course_id = $1 and user_id = $2", [courseId, userId]);
    if (rows.length === 0) throw new ValidationError("That class does not exist");
    out.course_id = courseId;
  }

  if (has("title") || !partial) {
    const title = String(body?.title ?? "").trim();
    if (!title) throw new ValidationError("Assignment name is required");
    if (title.length > 200) throw new ValidationError("Assignment name must be 200 characters or fewer");
    out.title = title;
  }

  if (has("due_at") || !partial) {
    const d = new Date(body?.due_at ?? "");
    if (!body?.due_at || Number.isNaN(d.getTime())) throw new ValidationError("Due date is required");
    out.due_at = d.toISOString();
  }

  if (has("due_time_known")) {
    if (typeof body.due_time_known !== "boolean") throw new ValidationError("due_time_known must be true or false");
    out.due_time_known = body.due_time_known;
  }

  if (has("assignment_type_id")) {
    const id = body.assignment_type_id == null || body.assignment_type_id === "" ? null : Number(body.assignment_type_id);
    if (id !== null && !Number.isInteger(id)) throw new ValidationError("Choose a valid assignment type");
    out.assignment_type_id = id;
  }

  if (has("submission_type")) {
    const s = body.submission_type == null ? null : String(body.submission_type).trim();
    if (s && s.length > 50) throw new ValidationError("Submission type must be 50 characters or fewer");
    out.submission_type = s || null;
  }

  if (has("notes")) {
    const n = body.notes == null ? null : String(body.notes).trim();
    out.notes = n || null;
  }

  if (has("estimated_minutes")) {
    const m = body.estimated_minutes == null || body.estimated_minutes === "" ? null : Number(body.estimated_minutes);
    if (m !== null && (!Number.isInteger(m) || m <= 0)) throw new ValidationError("Estimated minutes must be a whole number above 0");
    out.estimated_minutes = m;
  }

  if (has("completed")) {
    if (typeof body.completed !== "boolean") throw new ValidationError("completed must be true or false");
    out.completed = body.completed;
  }

  return out;
}

/* GET /api/assignment-types */
router.get("/assignment-types", requireLogin, async (req, res, next) => {
  try {
    const { rows } = await query("select assignment_type_id, name from assignment_type order by assignment_type_id");
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /api/assignments — every assignment in the current user's classes, soonest first.
   Assignments in a category the student excluded are left out. */
router.get("/assignments", requireLogin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `${SELECT} where c.user_id = $1 and coalesce(cat.is_included, true)
        order by a.due_at asc, a.assignment_id asc`,
      [req.session.userId]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /api/assignments */
router.post("/assignments", requireLogin, async (req, res, next) => {
  try {
    const f = await validateAssignment(req.body, req.session.userId, { partial: false });
    const categoryId = await categoryForType(f.course_id, f.assignment_type_id ?? null);
    const { rows } = await query(
      `insert into assignment (course_id, assignment_category_id, title, due_at, due_time_known,
                               submission_type, notes, estimated_minutes, completed_at, manually_completed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, case when $9 then now() end, $9)
       returning assignment_id`,
      [f.course_id, categoryId, f.title, f.due_at, f.due_time_known ?? true,
       f.submission_type ?? null, f.notes ?? null, f.estimated_minutes ?? null, f.completed ?? false]);
    res.status(201).json(await fetchOne(rows[0].assignment_id, req.session.userId));
  } catch (err) { next(err); }
});

/* PUT /api/assignments/:id — any subset of fields; `completed` toggles completed_at */
router.put("/assignments/:id", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const existing = id && await fetchOne(id, req.session.userId);
    if (!existing) return res.status(404).json({ error: "Assignment not found" });

    const f = await validateAssignment(req.body, req.session.userId, { partial: true });
    const sets = [];
    const params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    for (const col of ["course_id", "title", "due_at", "due_time_known", "submission_type", "notes", "estimated_minutes"]) {
      if (col in f) add(col, f[col]);
    }
    if ("assignment_type_id" in f || "course_id" in f) {
      const courseId = f.course_id ?? existing.course_id;
      const typeId = "assignment_type_id" in f ? f.assignment_type_id : existing.assignment_type_id;
      add("assignment_category_id", await categoryForType(courseId, typeId));
    }
    if ("completed" in f) {
      add("completed_at", f.completed ? new Date().toISOString() : null);
      add("manually_completed", f.completed);
    }
    if (sets.length === 0) throw new ValidationError("Nothing to update");
    sets.push("updated_at = now()");
    params.push(id);
    await query(`update assignment set ${sets.join(", ")} where assignment_id = $${params.length}`, params);
    res.json(await fetchOne(id, req.session.userId));
  } catch (err) { next(err); }
});

/* POST /api/assignments/reorder { assignment_ids: [...] } — persists the dashboard's drag order */
router.post("/assignments/reorder", requireLogin, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.assignment_ids) ? req.body.assignment_ids.map(Number) : null;
    if (!ids || ids.some(n => !Number.isInteger(n) || n <= 0)) throw new ValidationError("assignment_ids must be a list of ids");
    await query(
      `update assignment a set sort_order = x.ord, updated_at = now()
         from unnest($1::int[]) with ordinality as x(id, ord)
        where a.assignment_id = x.id
          and a.course_id in (select course_id from course where user_id = $2)`,
      [ids, req.session.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* DELETE /api/assignments/:id */
router.delete("/assignments/:id", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Assignment not found" });
    const { rowCount } = await query(
      `delete from assignment a using course c
        where a.course_id = c.course_id and a.assignment_id = $1 and c.user_id = $2`,
      [id, req.session.userId]);
    if (rowCount === 0) return res.status(404).json({ error: "Assignment not found" });
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
