import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";
import { CanvasError, canvasBaseUrl, getConnection, listCourses, syncUser, verifyToken } from "../canvas.js";

const router = Router();

/* What the UI needs to draw the Canvas card and the sidebar sync note. */
async function status(userId) {
  const conn = await getConnection(userId);
  const base_url = await canvasBaseUrl();
  if (!conn) return { connected: false, base_url };
  const { rows: [last] } = await query(
    `select status, started_at, finished_at, courses_synced, assignments_synced, error_message
       from sync_log where connected_account_id = $1 order by started_at desc limit 1`,
    [conn.connected_account_id]);
  const { rows: [{ n }] } = await query(
    `select count(*)::int as n from course where user_id = $1 and lms_source_id = $2 and external_course_id is not null`,
    [userId, conn.lms_source_id]);
  return {
    connected: true,
    base_url,
    status: conn.status,
    external_user_id: conn.external_user_id,
    connected_at: conn.connected_at,
    last_synced_at: conn.last_synced_at,
    linked_courses: n,
    last_sync: last || null,
  };
}

/* Canvas errors carry a message meant for the user; keep their status code. */
function pass(err, res, next) {
  if (err instanceof CanvasError) return res.status(err.status === 401 ? 400 : err.status).json({ error: err.message });
  next(err);
}

/* GET /api/canvas/status */
router.get("/canvas/status", requireLogin, async (req, res, next) => {
  try { res.json(await status(req.session.userId)); } catch (err) { pass(err, res, next); }
});

/* POST /api/canvas/connect { access_token } — verify with Canvas, store, run a first sync */
router.post("/canvas/connect", requireLogin, async (req, res, next) => {
  try {
    const token = String(req.body?.access_token ?? "").trim();
    if (!token) return res.status(400).json({ error: "Paste your Canvas access token" });
    if (token.length > 500) return res.status(400).json({ error: "That does not look like a Canvas access token" });

    const me = await verifyToken(token);
    const { rows: [src] } = await query("select lms_source_id from lms_source where name = 'Canvas'");
    const { rows: [conn] } = await query(
      `insert into connected_account (lms_source_id, user_id, external_user_id, access_token, status, connected_at)
       values ($1, $2, $3, $4, 'active', now())
       on conflict (user_id, lms_source_id) do update set
         external_user_id = excluded.external_user_id, access_token = excluded.access_token,
         status = 'active', connected_at = now()
       returning connected_account_id`,
      [src.lms_source_id, req.session.userId, me.id, token]);
    /* Point any already-linked Canvas classes at this connection */
    await query(
      `update course set connected_account_id = $1
        where user_id = $2 and lms_source_id = $3 and external_course_id is not null`,
      [conn.connected_account_id, req.session.userId, src.lms_source_id]);

    let sync = null, sync_error = null;
    try { sync = await syncUser(req.session.userId); }
    catch (err) { sync_error = err.message; }

    res.json({ ...(await status(req.session.userId)), canvas_name: me.name, sync, sync_error });
  } catch (err) { pass(err, res, next); }
});

/* DELETE /api/canvas/connect — forget the token. Linked classes and their assignments stay. */
router.delete("/canvas/connect", requireLogin, async (req, res, next) => {
  try {
    await query(
      `delete from connected_account ca using lms_source s
        where ca.lms_source_id = s.lms_source_id and s.name = 'Canvas' and ca.user_id = $1`,
      [req.session.userId]);
    res.status(204).end();
  } catch (err) { pass(err, res, next); }
});

/* GET /api/canvas/courses — live list of the student's Canvas courses for the add-class picker */
router.get("/canvas/courses", requireLogin, async (req, res, next) => {
  try {
    const conn = await getConnection(req.session.userId);
    if (!conn) return res.status(400).json({ error: "Canvas is not connected. Add your access token in Settings." });
    const courses = await listCourses(conn);
    const { rows: linked } = await query(
      "select external_course_id from course where user_id = $1 and lms_source_id = $2 and external_course_id is not null",
      [req.session.userId, conn.lms_source_id]);
    const have = new Set(linked.map(r => r.external_course_id));
    res.json(courses.map(c => ({ ...c, already_added: have.has(c.external_course_id) })));
  } catch (err) { pass(err, res, next); }
});

/* POST /api/canvas/sync */
router.post("/canvas/sync", requireLogin, async (req, res, next) => {
  try { res.json(await syncUser(req.session.userId)); } catch (err) { pass(err, res, next); }
});

export default router;
