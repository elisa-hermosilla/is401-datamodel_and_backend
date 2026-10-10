import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill in the Supabase connection string.");
  process.exit(1);
}

/* Supabase's pooler needs SSL but presents a certificate chain Node can't verify,
   so SSL is configured here with rejectUnauthorized:false. A `sslmode=` query
   parameter on the URL would override that and fail verification, so strip it
   and let the explicit ssl option win. Either form of the string works. */
function stripSslMode(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

const pool = new pg.Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

pool.on("error", err => {
  console.error("Unexpected error on idle Postgres client", err);
});

/** Run a parameterized query. Never interpolate user input into `text`. */
export function query(text, params = []) {
  return pool.query(text, params);
}

export default pool;
