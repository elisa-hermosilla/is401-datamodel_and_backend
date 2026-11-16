/* The four key results on the Admin page, computed from plain rows so they
   can be checked without a database (see the route in routes/admin.js for
   the queries that feed them).

   Days are campus-time "YYYY-MM-DD" strings; timestamps are ISO strings or
   Dates. Rows:
     users     { user_id, created_at, created_day, onboarding_completed_at }
     checkIns  { user_id, check_in_date }          (one row per visit day)
     firstSync Map user_id -> timestamp of the earliest sync_log row */

const DAY_MS = 86400000;

/* "YYYY-MM-DD" <-> a UTC-noon Date, so day arithmetic never crosses a DST edge */
function toDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
function toStamp(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { return toStamp(new Date(toDate(s).getTime() + n * DAY_MS)); }
function isWeekend(s) { const w = toDate(s).getUTCDay(); return w === 0 || w === 6; }
function minutesBetween(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 60000; }
function round1(n) { return Math.round(n * 10) / 10; }
function pct(part, whole) { return whole ? round1(part / whole * 100) : 0; }
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b), mid = s.length >> 1;
  return round1(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
/* Days from `from` to `to` inclusive */
export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function bucketize(minutes, edges, missingLabel, missingCount) {
  const buckets = edges.map(e => ({ key: e.key, label: e.label, count: 0 }));
  for (const m of minutes) buckets[edges.findIndex(e => m < e.max)].count++;
  buckets.push({ key: "missing", label: missingLabel, count: missingCount });
  return buckets;
}

/* KR 1: sign-up to finishing the navigation tutorial (the quick start stamps
   onboarding_completed_at when its tour ends). Accounts created before the
   quick start existed never saw it at sign-up, so they are left out. */
export function tutorialTimes(users, launchDay) {
  const cohort = users.filter(u => u.created_day >= launchDay);
  const minutes = cohort.filter(u => u.onboarding_completed_at).map(u => minutesBetween(u.created_at, u.onboarding_completed_at));
  const under = minutes.filter(m => m < 1440).length;
  return {
    total: cohort.length,
    finished: minutes.length,
    under_24h: under,
    under_24h_pct: pct(under, minutes.length),
    median_minutes: median(minutes),
    buckets: bucketize(minutes, [
      { key: "under_15", label: "Under 15 minutes", max: 15 },
      { key: "15_to_60", label: "15 minutes to 1 hour", max: 60 },
      { key: "1_to_24h", label: "1 to 24 hours", max: 1440 },
      { key: "over_24h", label: "Over 24 hours", max: Infinity },
    ], "Not finished yet", cohort.length - minutes.length),
  };
}

/* KR 2: sign-up to the first sync of any of the account's classes. A class
   that was deleted takes its sync log with it, so such an account reads as
   "no sync yet". */
export function firstSyncTimes(users, firstSync, launchDay) {
  const cohort = users.filter(u => u.created_day >= launchDay);
  const minutes = cohort.filter(u => firstSync.get(u.user_id)).map(u => Math.max(0, minutesBetween(u.created_at, firstSync.get(u.user_id))));
  const within = minutes.filter(m => m <= 15).length;
  return {
    total: cohort.length,
    synced: minutes.length,
    within_15: within,
    within_15_pct: pct(within, minutes.length),
    median_minutes: median(minutes),
    buckets: bucketize(minutes, [
      { key: "under_5", label: "Under 5 minutes", max: 5 },
      { key: "5_to_15", label: "5 to 15 minutes", max: 15.000001 },
      { key: "15_to_60", label: "15 minutes to 1 hour", max: 60 },
      { key: "over_1h", label: "Over 1 hour", max: Infinity },
    ], "No sync yet", cohort.length - minutes.length),
  };
}

function visitsByUser(checkIns) {
  const map = new Map();
  for (const c of checkIns) {
    if (!map.has(c.user_id)) map.set(c.user_id, new Set());
    map.get(c.user_id).add(c.check_in_date);
  }
  return map;
}

/* KR 3: first-month churn. An account churns when, inside its first 30 days
   (or the part of them that has happened), it goes GAP_DAYS consecutive
   days without a visit. The sign-up day counts as a visit. `sinceDay` keeps
   out accounts older than the check-in records. The series re-judges every
   account as of each day in `days`, so the line is "churn rate as of". */
export const GAP_DAYS = 7;
export function churn(users, checkIns, today, sinceDay, days = []) {
  const visits = visitsByUser(checkIns);
  const cohort = users.filter(u => u.created_day >= sinceDay && u.created_day <= today);
  const churnedAsOf = (u, asOf) => {
    const end = [addDays(u.created_day, 29), asOf].sort()[0];
    const set = visits.get(u.user_id) || new Set();
    let gap = 0;
    for (let d = u.created_day; d <= end; d = addDays(d, 1)) {
      gap = d === u.created_day || set.has(d) ? 0 : gap + 1;
      if (gap >= GAP_DAYS) return true;
    }
    return false;
  };
  const churned = cohort.filter(u => churnedAsOf(u, today)).length;
  const series = days.map(day => {
    const inCohort = cohort.filter(u => u.created_day <= day);
    const c = inCohort.filter(u => churnedAsOf(u, day)).length;
    return { day, cohort: inCohort.length, churned: c, churn_pct: pct(c, inCohort.length) };
  });
  return { cohort: cohort.length, churned, active: cohort.length - churned, churn_pct: pct(churned, cohort.length), series };
}

/* KR 4: 5-day check-in streaks, counted once per run that reaches five.
   Same leniency as the dashboard streak: a missed Saturday or Sunday
   neither extends nor breaks a run; a missed weekday ends it. Returns the
   dates the fifth day landed on, plus a running total per day in `days`. */
export const STREAK_DAYS = 5;
export function fiveDayStreaks(checkIns, today, days = []) {
  const visits = visitsByUser(checkIns);
  const events = [];
  let loginDays = 0;
  for (const [user_id, set] of visits) {
    const first = [...set].sort()[0];
    loginDays += set.size;
    let run = 0;
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (set.has(d)) { run++; if (run === STREAK_DAYS) events.push({ user_id, day: d }); }
      else if (!isWeekend(d)) run = 0;
    }
  }
  const usersWithOne = new Set(events.map(e => e.user_id)).size;
  return {
    count: events.length,
    users_with_one: usersWithOne,
    users_total: visits.size,
    avg_login_days: visits.size ? round1(loginDays / visits.size) : 0,
    series: days.map(day => ({ day, count: events.filter(e => e.day <= day).length })),
  };
}
