import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";
import { courseIdFromFeedUrl } from "../learningsuite.js";

const router = Router();

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ICS_URL_RE = /^(https?|webcal):\/\/\S+$/i;

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

  /* Learning Suite: the course's iCalendar feed URL. Optional; null clears it. */
  if (has("ics_feed_url")) {
    const url = body.ics_feed_url == null ? null : String(body.ics_feed_url).trim();
    if (url) {
      if (url.length > 500) throw new ValidationError("iCalendar link must be 500 characters or fewer");
      if (!ICS_URL_RE.test(url)) throw new ValidationError("iCalendar link must start with https://, http://, or webcal://");
    }
    out.ics_feed_url = url || null;
  }

  /* The course's id in its LMS. Canvas sends it from the class picker;
     Learning Suite's is taken from the feed link below. Optional; null clears it. */
  if (has("external_course_id")) {
    const id = body.external_course_id == null ? null : String(body.external_course_id).trim();
    if (id && id.length > 100) throw new ValidationError("Course id must be 100 characters or fewer");
    out.external_course_id = id || null;
  }
  /* A feed link names the Learning Suite course (courseID=...), which is what
     the "Open in Learning Suite" links need. It always wins over a client value;
     clearing the link clears the id unless the client set one explicitly. */
  if (out.ics_feed_url) out.external_course_id = courseIdFromFeedUrl(out.ics_feed_url);
  else if (has("ics_feed_url") && !has("external_course_id")) out.external_course_id = null;

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
    const { rows } = await query("select lms_source_id, name, base_url from lms_source order by lms_source_id");
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
    /* A Canvas class with an external id is tied to the user's Canvas connection (if any) so sync can find it */
    const { rows } = await query(
      `insert into course (user_id, lms_source_id, course_code, course_name, color_hex, ics_feed_url, external_course_id, connected_account_id)
       values ($1, $2, $3, $4, $5, $6, $7,
               case when $7::varchar is not null
                    then (select connected_account_id from connected_account where user_id = $1 and lms_source_id = $2)
               end)
       returning *`,
      [req.session.userId, f.lms_source_id, f.course_code, f.course_name ?? null, f.color_hex,
       f.ics_feed_url ?? null, f.external_course_id ?? null]
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

    const setList = keys.map((k, i) => `${k} = $${i + 1}`);
    const params = [...keys.map(k => f[k])];
    /* Re-point the Canvas connection whenever the source or external id changes */
    if ("external_course_id" in f || "lms_source_id" in f) {
      setList.push(`connected_account_id = case
        when coalesce($${params.length + 1}::varchar, external_course_id) is not null
         and coalesce($${params.length + 2}::int, lms_source_id) = (select lms_source_id from lms_source where name = 'Canvas')
        then (select connected_account_id from connected_account
               where user_id = $${params.length + 3} and lms_source_id = coalesce($${params.length + 2}::int, course.lms_source_id))
        end`);
      params.push(f.external_course_id ?? null, f.lms_source_id ?? null, req.session.userId);
    }
    params.push(id, req.session.userId);
    const { rows } = await query(
      `update course set ${setList.join(", ")}
        where course_id = $${params.length - 1} and user_id = $${params.length}
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
