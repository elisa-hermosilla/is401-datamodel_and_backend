import { Router } from "express";
import { query } from "../db.js";

const router = Router();

const USER_COLUMNS = "user_id, username, email, first_name, last_name";
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function bad(res, message) { return res.status(400).json({ error: message }); }

/* POST /api/register  { username, email, first_name, last_name, password }
   Creates the account, hashes the password with pgcrypto's bcrypt, and signs
   the new user in. */
router.post("/register", async (req, res, next) => {
  try {
    const b = req.body || {};
    const username = String(b.username ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const first = String(b.first_name ?? "").trim();
    const last = String(b.last_name ?? "").trim();
    const password = String(b.password ?? "");

    if (!first || !last) return bad(res, "Enter your first and last name");
    if (first.length > 100 || last.length > 100) return bad(res, "Names must be 100 characters or fewer");
    if (!username) return bad(res, "Choose a username");
    if (!USERNAME_RE.test(username)) return bad(res, "Username must be 3-50 characters: letters, numbers, dots, dashes, or underscores");
    if (!email) return bad(res, "Enter your email");
    if (email.length > 255 || !EMAIL_RE.test(email)) return bad(res, "Enter a valid email address");
    if (password.length < MIN_PASSWORD) return bad(res, `Password must be at least ${MIN_PASSWORD} characters`);

    let user;
    try {
      const { rows } = await query(
        `insert into app_user (username, email, password_hash, first_name, last_name, last_login_at)
         values ($1, $2, crypt($3, gen_salt('bf')), $4, $5, now())
         returning ${USER_COLUMNS}`,
        [username, email, password, first, last]
      );
      user = rows[0];
    } catch (err) {
      if (err.code === "23505") {
        const which = /email/i.test(err.constraint || "") ? "That email already has an account" : "That username is taken";
        return bad(res, which);
      }
      throw err;
    }

    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.userId = user.user_id;
      res.status(201).json(user);
    });
  } catch (err) {
    next(err);
  }
});

/* POST /api/change-password  { current_password, new_password } */
router.post("/change-password", async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const current = String(req.body?.current_password ?? "");
    const next_ = String(req.body?.new_password ?? "");

    if (!current) return bad(res, "Enter your current password");
    if (next_.length < MIN_PASSWORD) return bad(res, `New password must be at least ${MIN_PASSWORD} characters`);
    if (next_ === current) return bad(res, "New password must be different from the current one");

    const { rowCount } = await query(
      `update app_user
          set password_hash = crypt($2, gen_salt('bf'))
        where user_id = $1
          and password_hash = crypt($3, password_hash)`,
      [req.session.userId, next_, current]
    );
    if (rowCount === 0) return bad(res, "Current password is incorrect");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

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
