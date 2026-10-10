/* Learning Suite integration. Learning Suite has no API, but each course
   exposes an iCalendar feed (Schedule tab -> iCal link). A course row with
   lms_source = Learning Suite and an ics_feed_url is "linked"; sync fetches
   the feed and upserts one assignment per calendar item, matched on the
   item's UID so re-syncs update instead of duplicate.

   Limits worth knowing: items usually arrive as all-day events, so the due
   time is unknown (we store 11:59 PM campus time and flag due_time_known =
   false); only what the professor put on the Schedule comes through; there is
   no submission status, so completion is entirely the student's checkbox. */

import { query } from "./db.js";
import { parseIcs } from "./ics.js";
import { guessType } from "./canvas.js";

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
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FeedError("That calendar is too large to import", 502);
  try {
    return parseIcs(text);
  } catch (err) {
    throw new FeedError(err.message, 400);
  }
}

/* What the class form's "Check link" button shows. */
export async function previewFeed(rawUrl) {
  const events = await fetchFeed(rawUrl);
  const now = Date.now();
  const upcoming = events.filter(e => e.due_at.getTime() >= now).sort((a, b) => a.due_at - b.due_at);
  return {
    total: events.length,
    upcoming: upcoming.length,
    all_day: events.filter(e => e.all_day).length,
    sample: upcoming.slice(0, 5).map(e => ({ title: e.title, due_at: e.due_at.toISOString(), all_day: e.all_day })),
  };
}

/* Import one linked course's feed. Returns the number of items stored. */
export async function syncCourse(course, typeIds) {
  const { rows: [log] } = await query("insert into sync_log (course_id) values ($1) returning sync_log_id", [course.course_id]);
  try {
    const events = await fetchFeed(course.ics_feed_url);
    const from = Date.now() - PAST_DAYS * 86400000;
    const to = Date.now() + FUTURE_DAYS * 86400000;

    /* One category per course for feed items, typed by a guess from each title */
    const catIds = {};
    async function categoryFor(typeName) {
      const key = typeName || "none";
      if (catIds[key]) return catIds[key];
      const name = typeName ? typeName.charAt(0).toUpperCase() + typeName.slice(1) : "Schedule";
      const { rows: [cat] } = await query(
        `insert into assignment_category (course_id, assignment_type_id, name, external_category_id)
         values ($1, $2, $3, $4)
         on conflict (course_id, external_category_id) do update set name = excluded.name
         returning assignment_category_id`,
        [course.course_id, typeName ? typeIds[typeName] : null, name, `ics:${key}`]);
      catIds[key] = cat.assignment_category_id;
      return cat.assignment_category_id;
    }

    let stored = 0;
    for (const e of events) {
      const t = e.due_at.getTime();
      if (t < from || t > to) continue;
      const typeName = guessType(e.categories) || guessType(e.title);
      const categoryId = await categoryFor(typeName);
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
        [course.course_id, categoryId, `ics:${e.uid}`, e.title, e.due_at.toISOString(), !e.all_day,
         "No submission", e.url]);
      stored++;
    }

    await query("update course set last_synced_at = now() where course_id = $1", [course.course_id]);
    await query(
      "update sync_log set finished_at = now(), status = 'success', courses_synced = 1, assignments_synced = $2 where sync_log_id = $1",
      [log.sync_log_id, stored]);
    return stored;
  } catch (err) {
    await query("update sync_log set finished_at = now(), status = 'failed', error_message = $2 where sync_log_id = $1",
      [log.sync_log_id, String(err.message).slice(0, 2000)]);
    throw err;
  }
}

/* Every linked Learning Suite course the user has. */
export async function linkedCourses(userId) {
  const { rows } = await query(
    `select c.course_id, c.course_code, c.ics_feed_url, c.last_synced_at
       from course c join lms_source s on s.lms_source_id = c.lms_source_id
      where c.user_id = $1 and s.name = 'Learning Suite' and c.ics_feed_url is not null and not c.is_archived
      order by c.course_code`,
    [userId]);
  return rows;
}

/* Sync all of them. One bad feed doesn't stop the others; its error is reported per course. */
export async function syncUser(userId) {
  const courses = await linkedCourses(userId);
  const { rows: typeRows } = await query("select assignment_type_id, name from assignment_type");
  const typeIds = Object.fromEntries(typeRows.map(t => [t.name, t.assignment_type_id]));

  let coursesSynced = 0, assignmentsSynced = 0;
  const errors = [];
  for (const course of courses) {
    try {
      assignmentsSynced += await syncCourse(course, typeIds);
      coursesSynced++;
    } catch (err) {
      errors.push({ course_id: course.course_id, course_code: course.course_code, error: err.message });
    }
  }
  return { courses_linked: courses.length, courses_synced: coursesSynced, assignments_synced: assignmentsSynced, errors, finished_at: new Date().toISOString() };
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
