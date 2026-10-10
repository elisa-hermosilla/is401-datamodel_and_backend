/* Canvas LMS integration: a small REST client plus the sync that pulls a
   user's linked Canvas courses' assignments into our tables.

   How it works
   - The student creates a personal access token in Canvas (Account -> Settings
     -> Approved Integrations -> "+ New Access Token") and pastes it into
     Settings here. We verify it with GET /api/v1/users/self and store it on
     connected_account.
   - A course row is "linked" when its lms_source is Canvas and
     external_course_id holds the Canvas course id. Sync only touches linked
     courses, so the student decides which classes DueList tracks.
   - Per linked course, sync upserts assignment_category rows from Canvas
     assignment groups and assignment rows from Canvas assignments, matching
     on the external ids so re-syncs update instead of duplicate.
   - Completion comes from the student's own submission. A row the student
     checked off by hand (manually_completed) is left alone. */

import { query } from "./db.js";

const DEFAULT_BASE_URL = "https://byu.instructure.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const TIMEOUT_MS = 20000;

export class CanvasError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/* Where the Canvas instance lives: env override, else the lms_source row, else BYU's. */
export async function canvasBaseUrl() {
  if (process.env.CANVAS_BASE_URL) return process.env.CANVAS_BASE_URL.replace(/\/+$/, "");
  const { rows } = await query("select base_url from lms_source where name = 'Canvas'");
  return (rows[0]?.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/* "Link" header -> URL of the next page, or null */
function nextLink(header) {
  if (!header) return null;
  const part = header.split(",").map(s => s.trim()).find(s => /rel="next"/.test(s));
  return part ? part.slice(part.indexOf("<") + 1, part.indexOf(">")) : null;
}

/* GET one Canvas API path. Array responses are paginated and concatenated. */
export async function canvasGet(baseUrl, token, path, params = {}) {
  const url = new URL(`${baseUrl}/api/v1${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  if (!url.searchParams.has("per_page")) url.searchParams.set("per_page", String(PAGE_SIZE));

  const items = [];
  let next = url.toString();
  for (let page = 0; next && page < MAX_PAGES; page++) {
    let res;
    try {
      res = await fetch(next, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new CanvasError(`Could not reach Canvas at ${baseUrl} (${err.name === "TimeoutError" ? "timed out" : err.message})`, 502);
    }
    if (res.status === 401) throw new CanvasError("Canvas rejected the access token. Generate a new one and reconnect.", 401);
    if (res.status === 403) throw new CanvasError("Canvas refused the request (403). The token may not have permission for this.", 403);
    if (!res.ok) throw new CanvasError(`Canvas returned ${res.status} for ${path}`, 502);
    const data = await res.json();
    if (!Array.isArray(data)) return data;
    items.push(...data);
    next = nextLink(res.headers.get("link"));
  }
  return items;
}

/* The user's Canvas connection row (joined with the Canvas lms_source), or null. */
export async function getConnection(userId) {
  const { rows } = await query(
    `select ca.*, s.base_url, s.lms_source_id
       from connected_account ca
       join lms_source s on s.lms_source_id = ca.lms_source_id
      where ca.user_id = $1 and s.name = 'Canvas'`,
    [userId]);
  return rows[0] || null;
}

/* Verify a token by asking Canvas who it belongs to. */
export async function verifyToken(token) {
  const baseUrl = await canvasBaseUrl();
  const me = await canvasGet(baseUrl, token, "/users/self");
  if (!me || !me.id) throw new CanvasError("Canvas did not return a user for that token", 502);
  return { baseUrl, id: String(me.id), name: me.name || me.short_name || "" };
}

/* The student's active Canvas courses, shaped for the add-class picker. */
export async function listCourses(conn) {
  const baseUrl = await canvasBaseUrl();
  const courses = await canvasGet(baseUrl, conn.access_token, "/courses", {
    "enrollment_state": "active",
    "enrollment_type": "student",
    "include[]": ["term"],
  });
  return courses
    .filter(c => c.workflow_state === "available" && !c.access_restricted_by_date)
    .map(c => ({
      external_course_id: String(c.id),
      course_code: (c.course_code || c.name || "").trim().slice(0, 30),
      course_name: (c.name || "").trim().slice(0, 150),
      term: c.term?.name || null,
    }))
    .sort((a, b) => a.course_code.localeCompare(b.course_code));
}

/* Canvas submission_types -> the free-text labels the UI uses */
const SUBMISSION_LABELS = {
  online_upload: "Online upload", online_quiz: "Online quiz", online_text_entry: "Text entry",
  discussion_topic: "Discussion board", external_tool: "External tool", on_paper: "In class",
  none: "No submission", media_recording: "Media recording", online_url: "Website URL",
  student_annotation: "Annotation", wiki_page: "Wiki page", attendance: "Attendance", not_graded: "Not graded",
};
function submissionLabel(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return types.map(t => SUBMISSION_LABELS[t] || t).join(", ").slice(0, 50);
}

/* Guess our global assignment_type from a name (a Canvas assignment group, a
   feed item's category, or its title). When several keywords appear, the one
   that comes first in the text wins, so "pre-reading ... Project" is reading. */
const TYPE_PATTERNS = [
  ["quiz", /quiz/],
  ["exam", /exam|\btest\b|midterm|final/],
  ["paper", /paper|essay|writing/],
  ["project", /project/],
  ["reading", /reading|\bread\b/],
  ["discussion", /discussion/],
  ["homework", /homework|\bhw\b|assignment|problem|\blab\b|practice/],
];
export function guessType(name) {
  const n = String(name || "").toLowerCase();
  let best = null, at = Infinity;
  for (const [type, re] of TYPE_PATTERNS) {
    const m = re.exec(n);
    if (m && m.index < at) { best = type; at = m.index; }
  }
  return best;
}

/* Did the student submit this? Canvas marks the submission with submitted_at
   once anything is turned in; "complete" is the pass/fail equivalent. */
function isSubmitted(sub) {
  if (!sub) return false;
  if (sub.submitted_at) return true;
  return sub.workflow_state === "complete";
}

/* Planner items that are not assignments but still have a date the student
   should see: pages with a to-do date (readings), ungraded discussions,
   practice quizzes. Keyed by plannable_type. Calendar events are left out on
   purpose: Canvas puts every scheduled class period in the calendar and the
   feed gives no way to tell those from real events. */
const PLANNER_KINDS = {
  wiki_page:        { prefix: "page",       category: "Readings",         type: "reading",    submission: "No submission", date: p => p.todo_date },
  discussion_topic: { prefix: "discussion", category: "Discussions",      type: "discussion", submission: "Discussion board", date: p => p.todo_date || p.due_at },
  quiz:             { prefix: "quiz",       category: "Practice quizzes", type: "quiz",       submission: "Online quiz",   date: p => p.due_at },
};
/* How far around today the planner is asked for */
const PLANNER_PAST_DAYS = 60;
const PLANNER_FUTURE_DAYS = 200;

/* Pull the planner feed for one course and upsert the non-assignment items.
   `seen` holds "title|due_at" keys of the assignments already synced for the
   course so the same item is never stored twice. Returns the count stored. */
async function syncPlannerItems(baseUrl, token, course, typeIds, seen) {
  const start = new Date(Date.now() - PLANNER_PAST_DAYS * 86400000).toISOString();
  const end = new Date(Date.now() + PLANNER_FUTURE_DAYS * 86400000).toISOString();
  const items = await canvasGet(baseUrl, token, "/planner/items", {
    "context_codes[]": [`course_${course.external_course_id}`],
    "start_date": start,
    "end_date": end,
  });

  const categoryCache = {};
  let stored = 0;
  for (const item of items) {
    const kind = PLANNER_KINDS[item.plannable_type];
    if (!kind) continue;                                        // assignment (already synced), planner_note, etc.
    const p = item.plannable || {};
    if (p.assignment_id) continue;                              // graded quiz/discussion: synced as an assignment
    const dueAt = kind.date(p);
    if (!dueAt) continue;
    const title = String(p.title || item.plannable_type).slice(0, 200);
    const key = `${title}|${new Date(dueAt).toISOString()}`;
    if (seen.has(key)) continue;                                // same thing came through the assignments feed
    seen.add(key);

    if (!categoryCache[kind.category]) {
      const { rows: [cat] } = await query(
        `insert into assignment_category (course_id, assignment_type_id, name, external_category_id)
         values ($1, $2, $3, $4)
         on conflict (course_id, external_category_id) do update set name = excluded.name
         returning assignment_category_id`,
        [course.course_id, kind.type ? typeIds[kind.type] : null, kind.category, `planner:${item.plannable_type}`]);
      categoryCache[kind.category] = cat.assignment_category_id;
    }

    const done = !!(item.planner_override && item.planner_override.marked_complete) || !!(item.submissions && item.submissions.submitted);
    const url = item.html_url ? (item.html_url.startsWith("/") ? baseUrl + item.html_url : item.html_url) : null;
    await query(
      `insert into assignment (course_id, assignment_category_id, external_assignment_id, title, due_at, due_time_known,
                               submission_type, external_url, completed_at, manually_completed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
       on conflict (course_id, external_assignment_id) do update set
         assignment_category_id = excluded.assignment_category_id,
         title = excluded.title,
         due_at = excluded.due_at,
         due_time_known = excluded.due_time_known,
         submission_type = excluded.submission_type,
         external_url = excluded.external_url,
         completed_at = case when assignment.manually_completed then assignment.completed_at else excluded.completed_at end,
         updated_at = now()`,
      [course.course_id, categoryCache[kind.category], `${kind.prefix}:${p.id ?? item.plannable_id}`, title, dueAt,
       true, kind.submission, url ? String(url).slice(0, 500) : null,
       done ? new Date().toISOString() : null]);
    stored++;
  }
  return stored;
}

/* Pull every linked Canvas course for this user. Returns counts. */
export async function syncUser(userId) {
  const conn = await getConnection(userId);
  if (!conn) throw new CanvasError("Canvas is not connected. Add your access token in Settings.", 400);
  const baseUrl = await canvasBaseUrl();

  const { rows: [log] } = await query(
    "insert into sync_log (connected_account_id) values ($1) returning sync_log_id", [conn.connected_account_id]);

  try {
    const { rows: typeRows } = await query("select assignment_type_id, name from assignment_type");
    const typeIds = Object.fromEntries(typeRows.map(t => [t.name, t.assignment_type_id]));

    const { rows: courses } = await query(
      `select course_id, external_course_id, course_code from course
        where user_id = $1 and lms_source_id = $2 and external_course_id is not null and not is_archived
        order by course_code`,
      [userId, conn.lms_source_id]);

    let coursesSynced = 0, assignmentsSynced = 0, skippedUndated = 0, plannerSynced = 0;
    for (const course of courses) {
      const seen = new Set(); // "title|due_at" of everything stored for this course this run
      /* Assignment groups -> assignment_category */
      const groups = await canvasGet(baseUrl, conn.access_token, `/courses/${course.external_course_id}/assignment_groups`);
      const categoryByGroup = {};
      for (const g of groups) {
        const guessed = guessType(g.name);
        const { rows: [cat] } = await query(
          `insert into assignment_category (course_id, assignment_type_id, name, external_category_id)
           values ($1, $2, $3, $4)
           on conflict (course_id, external_category_id) do update set name = excluded.name
           returning assignment_category_id`,
          [course.course_id, guessed ? typeIds[guessed] : null, String(g.name || "Assignments").slice(0, 100), String(g.id)]);
        categoryByGroup[String(g.id)] = cat.assignment_category_id;
      }

      /* Assignments (with the student's own submission) -> assignment */
      const assignments = await canvasGet(baseUrl, conn.access_token, `/courses/${course.external_course_id}/assignments`, {
        "include[]": ["submission"],
        "order_by": "due_at",
      });
      for (const a of assignments) {
        if (a.published === false) continue;
        if (!a.due_at) { skippedUndated++; continue; } // due_at is NOT NULL in our schema
        const submitted = isSubmitted(a.submission);
        const completedAt = submitted ? (a.submission.submitted_at || new Date().toISOString()) : null;
        await query(
          `insert into assignment (course_id, assignment_category_id, external_assignment_id, title, due_at, due_time_known,
                                   submission_type, external_url, completed_at, manually_completed)
           values ($1, $2, $3, $4, $5, true, $6, $7, $8, false)
           on conflict (course_id, external_assignment_id) do update set
             assignment_category_id = excluded.assignment_category_id,
             title = excluded.title,
             due_at = excluded.due_at,
             submission_type = excluded.submission_type,
             external_url = excluded.external_url,
             completed_at = case when assignment.manually_completed then assignment.completed_at else excluded.completed_at end,
             updated_at = now()`,
          [course.course_id, categoryByGroup[String(a.assignment_group_id)] ?? null, String(a.id),
           String(a.name || "Untitled").slice(0, 200), a.due_at, submissionLabel(a.submission_types),
           a.html_url ? String(a.html_url).slice(0, 500) : null, completedAt]);
        seen.add(`${String(a.name || "Untitled").slice(0, 200)}|${new Date(a.due_at).toISOString()}`);
        assignmentsSynced++;
      }

      /* Readings, events, ungraded discussions, practice quizzes */
      const extra = await syncPlannerItems(baseUrl, conn.access_token, course, typeIds, seen);
      plannerSynced += extra;
      assignmentsSynced += extra;

      await query("update course set last_synced_at = now(), connected_account_id = $2 where course_id = $1", [course.course_id, conn.connected_account_id]);
      coursesSynced++;
    }

    await query("update connected_account set last_synced_at = now(), status = 'active' where connected_account_id = $1", [conn.connected_account_id]);
    await query(
      `update sync_log set finished_at = now(), status = 'success', courses_synced = $2, assignments_synced = $3 where sync_log_id = $1`,
      [log.sync_log_id, coursesSynced, assignmentsSynced]);
    return { courses_synced: coursesSynced, assignments_synced: assignmentsSynced, planner_items: plannerSynced, skipped_undated: skippedUndated, finished_at: new Date().toISOString() };
  } catch (err) {
    await query("update sync_log set finished_at = now(), status = 'failed', error_message = $2 where sync_log_id = $1",
      [log.sync_log_id, String(err.message).slice(0, 2000)]);
    if (err.status === 401) await query("update connected_account set status = 'error' where connected_account_id = $1", [conn.connected_account_id]);
    throw err;
  }
}
