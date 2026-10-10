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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.use(express.json());
app.use(session({
  name: "duelist.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", authRoutes);
app.use("/api", courseRoutes);

/* JSON 404 for anything under /api that didn't match */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* JSON error handler. Validation errors carry their message; everything else is generic. */
app.use((err, req, res, next) => {
  if (err.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ error: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`DueList running at http://localhost:${PORT}`);
});
