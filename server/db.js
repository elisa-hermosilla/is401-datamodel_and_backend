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

/* Supabase's direct host (db.<ref>.supabase.co) only has an IPv6 address, so it
   is unreachable from IPv4-only networks. The session pooler host works on both. */
function warnIfDirectHost(url) {
  try {
    const { hostname } = new URL(url);
    if (/^db\.[a-z0-9]+\.supabase\.co$/.test(hostname)) {
      console.warn(
        `DATABASE_URL points at ${hostname}, Supabase's direct host, which is IPv6-only. ` +
        "If the connection times out, use the Session pooler string instead " +
        "(Supabase dashboard -> Connect -> Session pooler, port 5432)."
      );
    }
  } catch {
    /* unparseable URL; pg will report the real error */
  }
}

warnIfDirectHost(process.env.DATABASE_URL);

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
