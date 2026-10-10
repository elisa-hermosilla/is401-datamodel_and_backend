import { Router } from "express";
import { requireLogin } from "../middleware/auth.js";
import * as canvas from "../canvas.js";
import * as ls from "../learningsuite.js";

const router = Router();

function userMessage(err) {
  if (err instanceof canvas.CanvasError || err instanceof ls.FeedError) return err.message;
  console.error("sync failed:", err);
  return "Something went wrong";
}

/* POST /api/learning-suite/preview { ics_feed_url } — what the class form's "Check link" shows */
router.post("/learning-suite/preview", requireLogin, async (req, res, next) => {
  try {
    const url = String(req.body?.ics_feed_url ?? "").trim();
    if (!url) return res.status(400).json({ error: "Paste the iCalendar link first" });
    res.json(await ls.previewFeed(url));
  } catch (err) {
    if (err instanceof ls.FeedError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/* POST /api/learning-suite/sync */
router.post("/learning-suite/sync", requireLogin, async (req, res, next) => {
  try { res.json(await ls.syncUser(req.session.userId)); } catch (err) { next(err); }
});

/* GET /api/learning-suite/status */
router.get("/learning-suite/status", requireLogin, async (req, res, next) => {
  try { res.json(await ls.status(req.session.userId)); } catch (err) { next(err); }
});

/* GET /api/sync/status — one summary for the sidebar */
router.get("/sync/status", requireLogin, async (req, res, next) => {
  try {
    const conn = await canvas.getConnection(req.session.userId);
    const lsStatus = await ls.status(req.session.userId);
    const canvasLast = conn?.last_synced_at ? new Date(conn.last_synced_at).toISOString() : null;
    const lsLast = lsStatus.last_synced_at ? new Date(lsStatus.last_synced_at).toISOString() : null;
    res.json({
      canvas_connected: !!conn,
      canvas_status: conn?.status || null,
      canvas_last_synced_at: canvasLast,
      learning_suite_courses: lsStatus.courses.length,
      learning_suite_last_synced_at: lsLast,
      last_synced_at: [canvasLast, lsLast].filter(Boolean).sort().pop() || null,
      can_sync: !!conn || lsStatus.courses.length > 0,
    });
  } catch (err) { next(err); }
});

/* POST /api/sync — Canvas (if connected) and every linked Learning Suite feed */
router.post("/sync", requireLogin, async (req, res, next) => {
  try {
    const out = { canvas: null, canvas_error: null, learning_suite: null };
    if (await canvas.getConnection(req.session.userId)) {
      try { out.canvas = await canvas.syncUser(req.session.userId); }
      catch (err) { out.canvas_error = userMessage(err); }
    }
    const lsResult = await ls.syncUser(req.session.userId);
    if (lsResult.courses_linked > 0) out.learning_suite = lsResult;
    out.assignments_synced = (out.canvas?.assignments_synced || 0) + (out.learning_suite?.assignments_synced || 0);
    out.courses_synced = (out.canvas?.courses_synced || 0) + (out.learning_suite?.courses_synced || 0);
    out.nothing_linked = !out.canvas && !out.canvas_error && !out.learning_suite;
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
