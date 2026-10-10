import { Router } from "express";
import { query } from "../db.js";

const router = Router();

const USER_COLUMNS = "user_id, username, email, first_name, last_name";

/* POST /api/login  { identifier, password }
   identifier is a username or an email. pgcrypto's crypt() with the stored
   hash as the salt performs the bcrypt comparison inside Postgres. */
router.post("/login", async (req, res, next) => {
  try {
    const identifier = String(req.body?.identifier ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!identifier || !password) {
      return res.status(400).json({ error: "Enter your username or email and your password" });
    }

    const { rows } = await query(
      `select ${USER_COLUMNS}
         from app_user
        where (username = $1 or email = $1)
          and password_hash = crypt($2, password_hash)`,
      [identifier, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Wrong username or password" });
    }

    const user = rows[0];
    await query("update app_user set last_login_at = now() where user_id = $1", [user.user_id]);

    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.userId = user.user_id;
      res.json(user);
    });
  } catch (err) {
    next(err);
  }
});

/* GET /api/me — the current user, or 401 */
router.get("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const { rows } = await query(`select ${USER_COLUMNS} from app_user where user_id = $1`, [req.session.userId]);
    if (rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Not logged in" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/* POST /api/logout */
router.post("/logout", (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("duelist.sid");
    res.status(204).end();
  });
});

export default router;
