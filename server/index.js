import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill in the Supabase connection string.");
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is not set. Add any long random string to .env.");
  process.exit(1);
}

const { default: authRoutes } = await import("./routes/auth.js");
const { default: courseRoutes } = await import("./routes/courses.js");
const { default: assignmentRoutes } = await import("./routes/assignments.js");
const { default: canvasRoutes } = await import("./routes/canvas.js");
const { default: syncRoutes } = await import("./routes/sync.js");
const { default: categoryRoutes } = await import("./routes/categories.js");
const { default: streakRoutes } = await import("./routes/streaks.js");
const { default: onboardingRoutes } = await import("./routes/onboarding.js");
const { default: notificationRoutes } = await import("./routes/notifications.js");
const { default: pageRoutes } = await import("./routes/pages.js");
const { checkInOnActivity } = await import("./middleware/checkin.js");
const { startReminderScheduler } = await import("./reminders.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();

/* Behind the Elastic Beanstalk HTTPS load balancer, NODE_ENV=production marks
   the session cookie Secure and tells Express to trust the proxy's HTTPS headers. */
const isProd = process.env.NODE_ENV === "production";
if (isProd) app.set("trust proxy", 1);

app.use(express.json());
app.use(session({
  name: "duelist.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

/* Pages are EJS views in views/; css, js and the favicon are still static files */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(pageRoutes);

/* First API request of the day from a signed-in user records a check-in */
app.use("/api", checkInOnActivity);

app.use("/api", authRoutes);
app.use("/api", courseRoutes);
app.use("/api", assignmentRoutes);
app.use("/api", canvasRoutes);
app.use("/api", syncRoutes);
app.use("/api", categoryRoutes);
app.use("/api", streakRoutes);
app.use("/api", onboardingRoutes);
app.use("/api", notificationRoutes);

/* JSON 404 for anything under /api that didn't match; a page for everything else */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use((req, res) => {
  res.status(404).render("error", { code: 404, message: "There's nothing at this address.", signedIn: !!req.session?.userId });
});

/* Error handler: JSON under /api (validation errors carry their message,
   everything else is generic), an error page for the HTML routes. */
app.use((err, req, res, next) => {
  const api = req.path.startsWith("/api");
  if (api && err.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (api && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  if (api) return res.status(500).json({ error: "Something went wrong" });
  res.status(500).render("error", { code: 500, message: "Something went wrong. Try again in a moment.", signedIn: !!req.session?.userId });
});

app.listen(PORT, () => {
  console.log(`DueList running at http://localhost:${PORT}`);
  startReminderScheduler();
});
