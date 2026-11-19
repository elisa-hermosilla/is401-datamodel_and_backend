import { Router } from "express";
import { query } from "../db.js";
import { recordCheckIn } from "../middleware/checkin.js";

const router = Router();

const USER_COLUMNS = "user_id, username, email, first_name, last_name, no_past_due_best_streak, check_in_best_streak, is_admin";
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function bad(res, message) { return res.status(400).json({ error: message }); }

/* The signed-in user's row (the fields the client sees), or null if the
   account is gone. Used by GET /api/me and by the page routes. */
export async function findUser(userId) {
  const { rows } = await query(`select ${USER_COLUMNS} from app_user where user_id = $1`, [userId]);
  return rows[0] || null;
}

/* The account fields a request may set, checked the same way for sign-up
   and for the admin page. With partial=true (admin edit) only the fields
   present in the body are checked and returned; otherwise all five are
   required. Throws an error with status 400 and a user-facing message. */
export function validateUserFields(body, { partial = false } = {}) {
  const b = body || {};
  const has = k => Object.prototype.hasOwnProperty.call(b, k);
  const fail = message => { const err = new Error(message); err.status = 400; throw err; };
  const out = {};

  for (const [key, label] of [["first_name", "first"], ["last_name", "last"]]) {
    if (partial && !has(key)) continue;
    const name = String(b[key] ?? "").trim();
    if (!name) fail(`Enter a ${label} name`);
    if (name.length > 100) fail("Names must be 100 characters or fewer");
    out[key] = name;
  }
  if (!partial || has("username")) {
    const username = String(b.username ?? "").trim();
    if (!username) fail("Choose a username");
    if (!USERNAME_RE.test(username)) fail("Username must be 3-50 characters: letters, numbers, dots, dashes, or underscores");
    out.username = username;
  }
  if (!partial || has("email")) {
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!email) fail("Enter an email");
    if (email.length > 255 || !EMAIL_RE.test(email)) fail("Enter a valid email address");
    out.email = email;
  }
  if (!partial || has("password")) {
    const password = String(b.password ?? "");
    if (password.length < MIN_PASSWORD) fail(`Password must be at least ${MIN_PASSWORD} characters`);
    out.password = password;
  }
  return out;
}

/* The message for a unique-constraint failure on app_user, or null. */
export function duplicateUserMessage(err) {
  if (err?.code !== "23505") return null;
  return /email/i.test(err.constraint || "") ? "That email already has an account" : "That username is taken";
}

/* POST /api/register  { username, email, first_name, last_name, password }
   Creates the account, hashes the password with pgcrypto's bcrypt, and signs
   the new user in. */
router.post("/register", async (req, res, next) => {
  try {
    let f;
    try { f = validateUserFields(req.body); }
    catch (err) { if (err.status === 400) return bad(res, err.message); throw err; }

    let user;
    try {
      const { rows } = await query(
        `insert into app_user (username, email, password_hash, first_name, last_name, last_login_at)
         values ($1, $2, crypt($3, gen_salt('bf')), $4, $5, now())
         returning ${USER_COLUMNS}`,
        [f.username, f.email, f.password, f.first_name, f.last_name]
      );
      user = rows[0];
    } catch (err) {
      const dup = duplicateUserMessage(err);
      if (dup) return bad(res, dup);
      throw err;
    }

    req.session.regenerate(async err => {
      if (err) return next(err);
      req.session.userId = user.user_id;
      await recordCheckIn(user.user_id, req.session).catch(e => console.error("check-in failed:", e.message));
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

    req.session.regenerate(async err => {
      if (err) return next(err);
      req.session.userId = user.user_id;
      await recordCheckIn(user.user_id, req.session).catch(e => console.error("check-in failed:", e.message));
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
    const user = await findUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Not logged in" });
    }
    res.json(user);
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
