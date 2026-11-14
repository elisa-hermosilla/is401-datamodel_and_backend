import { query } from "../db.js";

/** Reject the request with 401 unless the session has a logged-in user. */
export function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

/** Reject with 403 unless the signed-in user is an admin. Reads the flag
    from the database on every request, so removing someone's admin takes
    effect immediately rather than at their next sign-in. Use after requireLogin. */
export async function requireAdmin(req, res, next) {
  try {
    const { rows: [u] } = await query("select is_admin from app_user where user_id = $1", [req.session.userId]);
    if (!u || !u.is_admin) return res.status(403).json({ error: "Admins only" });
    next();
  } catch (err) { next(err); }
}
