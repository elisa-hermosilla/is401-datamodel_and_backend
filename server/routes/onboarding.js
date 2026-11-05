import { Router } from "express";
import { query } from "../db.js";
import { requireLogin } from "../middleware/auth.js";

const router = Router();
let schemaReady;

/* The project has no migration runner yet. Add the nullable field on demand;
   IF NOT EXISTS makes this safe on later requests and app restarts. */
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = query("alter table app_user add column if not exists onboarding_completed_at timestamptz")
      .catch(err => { schemaReady = null; throw err; });
  }
  await schemaReady;
}

router.get("/onboarding/status", requireLogin, async (req, res, next) => {
  try {
    await ensureSchema();
    const { rows: [user] } = await query(
      "select onboarding_completed_at from app_user where user_id = $1",
      [req.session.userId]
    );
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json({ completed_at: user.onboarding_completed_at });
  } catch (err) { next(err); }
});

router.post("/onboarding/complete", requireLogin, async (req, res, next) => {
  try {
    await ensureSchema();
    const { rows: [user] } = await query(
      `update app_user set onboarding_completed_at = coalesce(onboarding_completed_at, now())
        where user_id = $1 returning onboarding_completed_at`,
      [req.session.userId]
    );
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json({ completed_at: user.onboarding_completed_at });
  } catch (err) { next(err); }
});

export default router;
