import { Router } from "express";
import { findUser } from "./auth.js";

/* The HTML pages. Each one is an EJS view under views/; the API stays under
   /api. App pages need a signed-in user (the sidebar shows their name), the
   sign-in style pages send signed-in users straight to the dashboard. */
const router = Router();

/* Redirect to the sign-in page unless the session belongs to a real user;
   otherwise put the user row on res.locals for the sidebar partial. */
async function requirePage(req, res, next) {
  try {
    if (!req.session.userId) return res.redirect("/login");
    const user = await findUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => res.redirect("/login"));
      return;
    }
    res.locals.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/* Sign-in style pages have nothing to show a signed-in user */
function guestOnly(req, res, next) {
  if (req.session.userId) return res.redirect("/dashboard");
  next();
}

router.get("/", (req, res) => res.redirect(req.session.userId ? "/dashboard" : "/login"));

router.get("/login", guestOnly, (req, res) => res.render("login"));
router.get("/create-account", guestOnly, (req, res) => res.render("create-account"));
router.get("/forgot-password", guestOnly, (req, res) => res.render("forgot-password"));

for (const page of ["dashboard", "calendar", "assignments", "settings"]) {
  router.get(`/${page}`, requirePage, (req, res) => res.render(page));
}

/* Admins only. Everyone else gets the same 404 as an unknown address, so the
   page doesn't advertise itself. */
router.get("/admin", requirePage, (req, res) => {
  if (!res.locals.user.is_admin) {
    return res.status(404).render("error", { code: 404, message: "There's nothing at this address.", signedIn: true });
  }
  res.render("admin");
});

/* The pages used to be static files; old bookmarks and links keep working.
   The query string comes along (?class=, ?type=, ?date=, ?q=). */
const LEGACY = {
  "/index.html": "/login",
  "/create-account.html": "/create-account",
  "/forgot-password.html": "/forgot-password",
  "/dashboard.html": "/dashboard",
  "/calendar.html": "/calendar",
  "/assignments.html": "/assignments",
  "/settings.html": "/settings",
};
for (const [from, to] of Object.entries(LEGACY)) {
  router.get(from, (req, res) => {
    const i = req.originalUrl.indexOf("?");
    res.redirect(301, to + (i >= 0 ? req.originalUrl.slice(i) : ""));
  });
}

export default router;
