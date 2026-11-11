/* Learning Suite integration. Learning Suite has no API, but each course
   exposes an iCalendar feed (Schedule tab -> iCal link). A course row with
   lms_source = Learning Suite and an ics_feed_url is "linked"; sync fetches
   the feed and upserts one assignment per calendar item, matched on the
   item's UID so re-syncs update instead of duplicate.

   Limits worth knowing: items usually arrive as all-day events, so the due
   time is unknown (we store 11:59 PM campus time and flag due_time_known =
   false); only what the professor put on the Schedule comes through; there is
   no submission status, so completion is entirely the student's checkbox,
   and no submission type (stored as null: the pages show no tag). */

import { query } from "./db.js";
import { decodeFeed, parseIcs, sameDayAt } from "./ics.js";
import { guessType } from "./canvas.js";
import { organizeWithClaude, haystack } from "./categorize.js";
import { canSync, earliestNextSyncAt } from "./syncPolicy.js";

/* A feed has no category data. Items are routed in two steps: first by the
   keywords stored on the course's categories (filled in by "Categorize using
   AI", or typed by the student), then, for anything no keyword catches, into
   fixed buckets by a regex on the category or title, or "Unknown" when the
   regex has no guess either. Each bucket is an
   assignment_category row (external_category_id "ics:<bucket>"); AI groups are
   rows named "ai:<slug>". The student maps every row to a type, a default due
   time, and included/excluded. */
export const BUCKETS = {
  reading: "Readings", homework: "Homework", quiz: "Quizzes", exam: "Exams",
  paper: "Papers", project: "Projects", discussion: "Discussions", other: "Unknown",
};
/* The title usually says what kind of item it is; when it doesn't ("Class 14
   Preparation Report"), the first line of the instructions often does
   ("Report your pre-reading..."). */
export function bucketOf(e) {
  return guessType(e.categories) || guessType(e.title) || guessType(e.description_first) || "other";
}

/* Create the bucket's category row if missing (typed by the keyword guess the
   first time); afterwards the student's mapping on it is left alone. */
export async function upsertBucket(courseId, bucket, typeIds) {
  const { rows: [cat] } = await query(
    `insert into assignment_category (course_id, assignment_type_id, name, external_category_id)
     values ($1, $2, $3, $4)
     on conflict (course_id, external_category_id) do update set name = excluded.name
     returning *`,
    [courseId, bucket === "other" ? null : typeIds[bucket], BUCKETS[bucket], `ics:${bucket}`]);
  return cat;
}

/* The course's category rows, keywords included. */
export async function courseCategories(courseId) {
  const { rows } = await query("select * from assignment_category where course_id = $1 order by assignment_category_id", [courseId]);
  return rows;
}

/* Keyword routing. Among the categories that have keywords, the one whose
   keyword appears earliest in the item's text wins (same tie rule as
   guessType). Null when nothing matches. */
export function routeEvent(e, categories) {
  const hay = haystack(e);
  let best = null, at = Infinity;
  for (const c of categories) {
    for (const k of c.match_keywords || []) {
      const i = k ? hay.indexOf(k) : -1;
      if (i >= 0 && i < at) { best = c; at = i; }
    }
  }
  return best;
}

/* "HH:MM:SS" from Postgres -> "HH:MM" */
export function hhmm(t) { return t ? String(t).slice(0, 5) : null; }

/* Schedule rows that are lecture topics rather than things to do. Learning
   Suite puts one "Topic: ..." entry on every class day. */
export function isScheduleNoise(e) {
  return /^topic\s*:/i.test(e.title);
}

/* Long first lines (a lecture blurb, say) are cut at a word boundary for the
   title. The professor's description is not imported anywhere: notes belong
   to the student and are never autofilled. */
const TITLE_MAX = 120;
export function shortTitle(title) {
  const t = String(title || "").trim();
  if (t.length <= TITLE_MAX) return t;
  const cut = t.lastIndexOf(" ", TITLE_MAX - 1);
  return (cut > 40 ? t.slice(0, cut) : t.slice(0, TITLE_MAX - 1)).trim() + "…";
}

const TIMEOUT_MS = 20000;
const MAX_BYTES = 5 * 1024 * 1024;
const PAST_DAYS = 60;
const FUTURE_DAYS = 365;

export class FeedError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function normalizeFeedUrl(raw) {
  let url = String(raw || "").trim();
  if (/^webcal:\/\//i.test(url)) url = "https://" + url.slice(9);
  if (!/^https?:\/\//i.test(url)) throw new FeedError("The iCalendar link must start with https://");
  return url;
}

/* The feed link carries the course's Learning Suite id
   (ical.php?courseID=O-QYBft90H64). The same id names the course's pages:
   https://learningsuite.byu.edu/cid-<id>/student/home. Stored as the
   course's external_course_id so the UI can link there. */
export function courseIdFromFeedUrl(raw) {
  try {
    const id = new URL(normalizeFeedUrl(raw)).searchParams.get("courseID");
    return id && id.trim() ? id.trim().slice(0, 100) : null;
  } catch {
    return null;
  }
}

/* Download and parse a feed. */
export async function fetchFeed(rawUrl) {
  const url = normalizeFeedUrl(rawUrl);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new FeedError(`Could not fetch the iCalendar link (${err.name === "TimeoutError" ? "timed out" : err.message})`, 502);
  }
  if (!res.ok) throw new FeedError(`The iCalendar link returned ${res.status}`, 502);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new FeedError("That calendar is too large to import", 502);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new FeedError("That calendar is too large to import", 502);
  try {
    return parseIcs(decodeFeed(bytes));
  } catch (err) {
    throw new FeedError(err.message, 400);
  }
}

/* What the class form's "Check link" button shows. Counts match what sync imports. */
export async function previewFeed(rawUrl) {
  const all = await fetchFeed(rawUrl);
  const events = all.filter(e => !isScheduleNoise(e));
  const now = Date.now();
  const upcoming = events.filter(e => e.due_at.getTime() >= now).sort((a, b) => a.due_at - b.due_at);
  return {
    total: events.length,
    upcoming: upcoming.length,
    all_day: events.filter(e => e.all_day).length,
    skipped_topics: all.length - events.length,
    sample: upcoming.slice(0, 5).map(e => ({ title: shortTitle(e.title), due_at: e.due_at.toISOString(), all_day: e.all_day })),
  };
}

/* The feed items sync would import: no lecture topics, inside the date window. */
async function windowedEvents(course) {
  const from = Date.now() - PAST_DAYS * 86400000;
  const to = Date.now() + FUTURE_DAYS * 86400000;
  return (await fetchFeed(course.ics_feed_url))
    .filter(e => !isScheduleNoise(e) && e.due_at.getTime() >= from && e.due_at.getTime() <= to);
}

/* What the model sees: one row per distinct title, with the first line of
   the instructions and the feed's category when they add something. */
export function feedItems(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const title = shortTitle(e.title);
    const key = title.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = { id: out.length + 1, title };
    if (e.description_first && e.description_first !== e.title) row.note = e.description_first.slice(0, 80);
    if (e.categories) row.category = e.categories;
    out.push(row);
  }
  return out;
}

/* Drop the course's AI groups (their items go back to the regex buckets on
   the next sync). */
async function dropAiGroups(courseId, keepIds = []) {
  await query(
    `update assignment set assignment_category_id = null
      where course_id = $1 and assignment_category_id in (
        select assignment_category_id from assignment_category
         where course_id = $1 and external_category_id like 'ai:%' and not (assignment_category_id = any($2::int[])))`,
    [courseId, keepIds]);
  await query(
    `delete from assignment_category
      where course_id = $1 and external_category_id like 'ai:%' and not (assignment_category_id = any($2::int[]))`,
    [courseId, keepIds]);
}

/* Fetch a linked course's feed and return its categories with how many feed
   items each would receive under the current rules, creating any bucket row
   an unmatched item needs. Used by the class form's mapping step.

   mode "keywords": forget the AI groups first, so only the buckets remain.
   mode "ai": ask Claude for groups (one request), store them as "ai:" rows
   with their keywords, and drop AI rows it no longer proposes. The model's
   own "Other" group is not stored: those items fall through to the buckets. */
export async function discoverCategories(course, typeIds, mode = null, userId = null) {
  const events = await windowedEvents(course);

  if (mode === "keywords") {
    await dropAiGroups(course.course_id);
  } else if (mode === "ai") {
    const groups = await organizeWithClaude(feedItems(events), Object.keys(typeIds), userId);
    /* The model's rules replace any keywords typed on the buckets, which would
       otherwise compete with the new groups for the same items. */
    await clearBucketKeywords(course.course_id);
    const keep = [];
    for (const g of groups) {
      if (g.slug === "other") continue;
      const { rows: [cat] } = await query(
        `insert into assignment_category (course_id, assignment_type_id, name, external_category_id, match_keywords)
         values ($1, $2, $3, $4, $5::text[])
         on conflict (course_id, external_category_id) do update
           set name = excluded.name, assignment_type_id = excluded.assignment_type_id, match_keywords = excluded.match_keywords
         returning assignment_category_id`,
        [course.course_id, g.type === "other" ? null : typeIds[g.type], g.name, `ai:${g.slug}`, g.keywords]);
      keep.push(cat.assignment_category_id);
    }
    await dropAiGroups(course.course_id, keep);
  }

  const rules = await courseCategories(course.course_id);
  const buckets = {};
  const counts = {};
  for (const e of events) {
    let cat = routeEvent(e, rules);
    if (!cat) {
      const b = bucketOf(e);
      if (!buckets[b]) buckets[b] = await upsertBucket(course.course_id, b, typeIds);
      cat = buckets[b];
    }
    counts[cat.assignment_category_id] = (counts[cat.assignment_category_id] || 0) + 1;
  }
  await dropEmptyBuckets(course.course_id, Object.keys(counts).map(Number));
  const all = await courseCategories(course.course_id);
  return all.map(c => ({ ...c, default_due_time: hhmm(c.default_due_time), item_count: counts[c.assignment_category_id] || 0 }));
}

export async function clearBucketKeywords(courseId) {
  await query("update assignment_category set match_keywords = '{}' where course_id = $1 and external_category_id like 'ics:%'", [courseId]);
}

/* Bucket rows that would receive nothing from the feed and hold no
   assignments are clutter in the mapping table (they appear after the AI
   groups take their items). They come back on demand through upsertBucket. */
export async function dropEmptyBuckets(courseId, liveIds) {
  await query(
    `delete from assignment_category c
      where c.course_id = $1 and c.external_category_id like 'ics:%'
        and not (c.assignment_category_id = any($2::int[]))
        and not exists (select 1 from assignment a where a.assignment_category_id = c.assignment_category_id)`,
    [courseId, liveIds]);
}

/* Import one linked course's feed. Returns { stored, removed }: removed counts
   feed rows (ics:<uid>) that are no longer in the feed, i.e. items the
   professor took off the schedule. */
export async function syncCourse(course, typeIds) {
  const { rows: [log] } = await query("insert into sync_log (course_id) values ($1) returning sync_log_id", [course.course_id]);
  try {
    const events = await fetchFeed(course.ics_feed_url);
    /* Every UID in the feed, before the window/bucket filters below: an item
       we choose not to store still exists and must not be pruned. */
    const liveUids = events.map(e => `ics:${e.uid}`);
    const from = Date.now() - PAST_DAYS * 86400000;
    const to = Date.now() + FUTURE_DAYS * 86400000;

    /* Keyword rules first, then the regex buckets for whatever they miss */
    const rules = await courseCategories(course.course_id);
    const buckets = {};
    let stored = 0, excluded = 0;
    for (const e of events) {
      if (isScheduleNoise(e)) continue;
      const t = e.due_at.getTime();
      if (t < from || t > to) continue;
      let cat = routeEvent(e, rules);
      if (!cat) {
        const bucket = bucketOf(e);
        if (!buckets[bucket]) buckets[bucket] = await upsertBucket(course.course_id, bucket, typeIds);
        cat = buckets[bucket];
      }
      if (!cat.is_included) { excluded++; continue; }

      /* An all-day item takes the category's default due time when one is set */
      let dueAt = e.due_at, timeKnown = !e.all_day;
      if (e.all_day && cat.default_due_time) { dueAt = sameDayAt(e.due_at, hhmm(cat.default_due_time)); timeKnown = true; }

      const title = shortTitle(e.title);
      await query(
        `insert into assignment (course_id, assignment_category_id, external_assignment_id, title, due_at, due_time_known,
                                 submission_type, external_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (course_id, external_assignment_id) do update set
           assignment_category_id = excluded.assignment_category_id,
           title = excluded.title,
           due_at = excluded.due_at,
           due_time_known = excluded.due_time_known,
           external_url = coalesce(excluded.external_url, assignment.external_url),
           updated_at = now()`,
        [course.course_id, cat.assignment_category_id, `ics:${e.uid}`, title, dueAt.toISOString(), timeKnown,
         null, e.url]);
      stored++;
    }

    /* Feed rows that are gone from the feed were removed from the schedule.
       An empty feed is treated as a bad fetch rather than "everything was
       deleted". Manual rows (null external id) never match. */
    let removed = 0;
    if (events.length > 0) {
      const { rowCount } = await query(
        `delete from assignment
          where course_id = $1 and external_assignment_id like 'ics:%'
            and not (external_assignment_id = any($2::text[]))`,
        [course.course_id, liveUids]);
      removed = rowCount;
    }

    await query("update course set last_synced_at = now() where course_id = $1", [course.course_id]);
    await query(
      "update sync_log set finished_at = now(), status = 'success', courses_synced = 1, assignments_synced = $2 where sync_log_id = $1",
      [log.sync_log_id, stored]);
    return { stored, removed };
  } catch (err) {
    await query("update sync_log set finished_at = now(), status = 'failed', error_message = $2 where sync_log_id = $1",
      [log.sync_log_id, String(err.message).slice(0, 2000)]);
    throw err;
  }
}

/* Every linked Learning Suite course the user has (or just one of them). */
export async function linkedCourses(userId, courseId = null) {
  const { rows } = await query(
    `select c.course_id, c.course_code, c.ics_feed_url, c.last_synced_at
       from course c join lms_source s on s.lms_source_id = c.lms_source_id
      where c.user_id = $1 and s.name = 'Learning Suite' and c.ics_feed_url is not null and not c.is_archived
        and ($2::int is null or c.course_id = $2)
      order by c.course_code`,
    [userId, courseId]);
  return rows;
}

export async function assignmentTypeIds() {
  const { rows } = await query("select assignment_type_id, name from assignment_type");
  return Object.fromEntries(rows.map(t => [t.name, t.assignment_type_id]));
}

/* Sync all of them (or one). One bad feed doesn't stop the others; its error
   is reported per course. Syncing everything skips classes still inside the
   cooldown; a single class was already checked by its route. */
export async function syncUser(userId, courseId = null) {
  const linked = await linkedCourses(userId, courseId);
  const courses = courseId ? linked : linked.filter(c => canSync(c));
  const typeIds = await assignmentTypeIds();

  let coursesSynced = 0, assignmentsSynced = 0, removed = 0;
  const errors = [];
  for (const course of courses) {
    try {
      const r = await syncCourse(course, typeIds);
      assignmentsSynced += r.stored;
      removed += r.removed;
      coursesSynced++;
    } catch (err) {
      errors.push({ course_id: course.course_id, course_code: course.course_code, error: err.message });
    }
  }
  return { courses_linked: linked.length, courses_synced: coursesSynced, courses_skipped: linked.length - courses.length, next_sync_at: earliestNextSyncAt(linked), assignments_synced: assignmentsSynced, assignments_removed: removed, errors, finished_at: new Date().toISOString() };
}

/* Per-course status for the Settings card. */
export async function status(userId) {
  const courses = await linkedCourses(userId);
  const out = [];
  for (const c of courses) {
    const { rows: [last] } = await query(
      "select status, finished_at, assignments_synced, error_message from sync_log where course_id = $1 order by started_at desc limit 1",
      [c.course_id]);
    out.push({ ...c, last_sync: last || null });
  }
  return {
    courses: out,
    last_synced_at: out.reduce((m, c) => (c.last_synced_at && (!m || c.last_synced_at > m) ? c.last_synced_at : m), null),
  };
}
