import { Router } from "express";
import { requireLogin } from "../middleware/auth.js";
import { getStreaks } from "../streaks.js";

const router = Router();

/* GET /api/streaks — the signed-in user's check-in and no-late-turn-in
   streaks, with their best values (which this call also keeps up to date). */
router.get("/streaks", requireLogin, async (req, res, next) => {
  try {
    const s = await getStreaks(req.session.userId);
    if (!s) return res.status(401).json({ error: "Not logged in" });
    res.json(s);
  } catch (err) {
    next(err);
  }
});

export default router;
