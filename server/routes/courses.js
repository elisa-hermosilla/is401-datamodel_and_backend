import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";

const router = Router();

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/* Validate the writable course fields. With partial=true, missing fields are
   skipped (PUT); otherwise course_code and lms_source_id are required (POST).
   Returns an object containing only the fields that were supplied. */
async function validateCourse(body, { partial }) {
  const out = {};
  const has = k => body != null && Object.prototype.hasOwnProperty.call(body, k);

  if (has("course_code") || !partial) {
    const code = String(body?.course_code ?? "").trim();
    if (!code) throw new ValidationError("Course code is required");
    if (code.length > 30) throw new ValidationError("Course code must be 30 characters or fewer");
    out.course_code = code;
  }

  if (has("course_name")) {
    const name = body.course_name == null ? null : String(body.course_name).trim();
    if (name && name.length > 150) throw new ValidationError("Course name must be 150 characters or fewer");
    out.course_name = name || null;
  }

  if (has("color_hex") || !partial) {
    const color = String(body?.color_hex ?? "").trim();
    if (!COLOR_RE.test(color)) throw new ValidationError("Color must be a hex value like #2563eb");
    out.color_hex = color;
  }

  if (has("lms_source_id") || !partial) {
    const id = Number(body?.lms_source_id);
    if (!Number.isInteger(id)) throw new ValidationError("Choose a source");
    const { rows } = await query("select 1 from lms_source where lms_source_id = $1", [id]);
    if (rows.length === 0) throw new ValidationError("That source does not exist");
    out.lms_source_id = id;
  }

  if (has("is_archived")) {
    if (typeof body.is_archived !== "boolean") throw new ValidationError("is_archived must be true or false");
    out.is_archived = body.is_archived;
  }

  return out;
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* GET /api/lms-sources */
router.get("/lms-sources", requireLogin, async (req, res, next) => {
  try {
    const { rows } = await query("select lms_source_id, name from lms_source order by lms_source_id");
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /api/courses — current user's courses, non-archived first, then by code */
router.get("/courses", requireLogin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select * from course
        where user_id = $1
        order by is_archived asc, course_code asc, course_id asc`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /api/courses */
router.post("/courses", requireLogin, async (req, res, next) => {
  try {
    const f = await validateCourse(req.body, { partial: false });
    const { rows } = await query(
      `insert into course (user_id, lms_source_id, course_code, course_name, color_hex)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [req.session.userId, f.lms_source_id, f.course_code, f.course_name ?? null, f.color_hex]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /api/courses/:id — any subset of the writable fields */
router.put("/courses/:id", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Course not found" });

    const f = await validateCourse(req.body, { partial: true });
    const keys = Object.keys(f);
    if (keys.length === 0) throw new ValidationError("Nothing to update");

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const params = [...keys.map(k => f[k]), id, req.session.userId];
    const { rows } = await query(
      `update course set ${sets}
        where course_id = $${keys.length + 1} and user_id = $${keys.length + 2}
        returning *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: "Course not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /api/courses/:id — cascades to the course's assignments in the DB */
router.delete("/courses/:id", requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "Course not found" });
    const { rowCount } = await query(
      "delete from course where course_id = $1 and user_id = $2",
      [id, req.session.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Course not found" });
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
