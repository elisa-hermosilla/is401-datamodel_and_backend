/* ---------- Shared helpers, sidebar, and UI bits ---------- */

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  list:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  settings:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  logout:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  grip:      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  plus:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  left:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  right:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  alert:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  clock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  sun:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  week:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/></svg>',
  info:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  external:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  note:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  sync:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  x:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  pencil:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  flame:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.9 7-6.5 0-3-2-5-3.5-6.5-.5 2-1.5 3-2.5 3 .5-3-.5-6-3-8-.5 3.5-3 5-4.5 7.5C4 13.5 5 22 12 22z"/></svg>',
  calCheck:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>',
};

/* ---------- App state loaded from the API ----------
   USER:             the logged-in user from GET /api/me
   CLASSES:          the user's courses, plus a derived `source` name for the tags
   ASSIGNMENTS:      the user's assignments (joined with course code/color and type name)
   LMS_SOURCES:      [{lms_source_id, name}] for the class form
   ASSIGNMENT_TYPES: [{assignment_type_id, name}] for the assignment form */
let USER = null;
let CLASSES = [];
let ASSIGNMENTS = [];
let LMS_SOURCES = [];
let ASSIGNMENT_TYPES = [];
/* CANVAS: GET /api/canvas/status — whether a token is connected, when it last synced, the instance URL */
let CANVAS = { connected: false, base_url: "" };
/* SYNC: GET /api/sync/status — the sidebar summary across Canvas and Learning Suite */
let SYNC = { can_sync: false, last_synced_at: null };

/* The 12 colors a class can be. Default for a new class is the first one not
   already used by one of the user's classes. */
const CLASS_COLORS = [
  { hex: "#2563eb", name: "Blue" },
  { hex: "#16a34a", name: "Green" },
  { hex: "#d97706", name: "Amber" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#9333ea", name: "Purple" },
  { hex: "#0d9488", name: "Teal" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#db2777", name: "Pink" },
  { hex: "#4f46e5", name: "Indigo" },
  { hex: "#0891b2", name: "Cyan" },
  { hex: "#65a30d", name: "Lime" },
  { hex: "#6b7280", name: "Gray" },
];
function nextClassColor() {
  const used = new Set(CLASSES.map(c => c.color_hex.toLowerCase()));
  const free = CLASS_COLORS.find(c => !used.has(c.hex));
  return free ? free.hex : CLASS_COLORS[CLASSES.length % CLASS_COLORS.length].hex;
}

/* Call this first on every app page. Redirects to the sign-in page when the
   session is missing, then loads everything and draws the sidebar. */
async function initApp(activeNav) {
  try {
    USER = await API.me();
  } catch {
    window.location.replace("index.html");
    return new Promise(() => {}); // never resolves; the page is navigating away
  }
  const [sources, types, courses, assignments, canvas, sync] = await Promise.all([
    API.lmsSources(), API.assignmentTypes(), API.courses.list(), API.assignments.list(),
    API.canvas.status().catch(() => ({ connected: false, base_url: "" })),
    API.sync.status().catch(() => ({ can_sync: false, last_synced_at: null })),
  ]);
  LMS_SOURCES = sources;
  ASSIGNMENT_TYPES = types;
  setClasses(courses);
  ASSIGNMENTS = assignments;
  CANVAS = canvas;
  SYNC = sync;
  renderSidebar(activeNav);
}

function sourceName(lmsSourceId) {
  const s = LMS_SOURCES.find(x => x.lms_source_id === lmsSourceId);
  return s ? s.name : "Manual";
}

/* Replace the CLASSES list with fresh rows from the API. Field names stay
   exactly as the database returns them; only `source` is added. */
function setClasses(rows) {
  CLASSES = rows.map(c => ({ ...c, source: sourceName(c.lms_source_id) }));
}

/* Swap one assignment in ASSIGNMENTS for the fresh row the API returned. */
function replaceAssignment(row) {
  const i = ASSIGNMENTS.findIndex(a => a.assignment_id === row.assignment_id);
  if (i >= 0) ASSIGNMENTS[i] = row; else ASSIGNMENTS.push(row);
  ASSIGNMENTS.sort((a, b) => dueDate(a) - dueDate(b) || a.assignment_id - b.assignment_id);
}

/* ---------- Dates ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function today() { return startOfDay(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

function dueDate(a) { return new Date(a.due_at); }
function isDone(a) { return a.completed_at != null; }
function dayDiff(date) { return Math.round((startOfDay(date) - today()) / 86400000); }

function fmtTime(date) {
  let h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(date) { return `${DOW[date.getDay()]}, ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}`; }
function fmtLongDate(date) { return `${DOW[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`; }
function fmtDayLabel(date) {
  const diff = dayDiff(date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDate(date);
}
function fmtMinutes(min) {
  if (!min) return "";
  if (min % 60 === 0 && min >= 60) return `${min / 60} hr${min === 60 ? "" : "s"}`;
  if (min > 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min} min`;
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
/* "just now", "4 min ago", "2 hrs ago", "3 days ago", or "never" */
function relTime(iso) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
/* "YYYY-MM-DD" and "HH:MM" in local time, for date/time inputs */
function toDateInput(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function toTimeInput(d) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

/* ---------- Data helpers ---------- */
function getClass(code) { return CLASSES.find(c => c.course_code === code); }
function getClassById(id) { return CLASSES.find(c => c.course_id === id); }
function getAssignment(id) { return ASSIGNMENTS.find(a => a.assignment_id === id); }
/* The assignment's display type ("Quiz"), or "" when it has none */
function typeLabel(a) { return a.type_name ? cap(a.type_name) : (a.category_name || ""); }

/* Source tag styled as a link. With a real URL (a synced Canvas assignment's
   html_url, or a linked Canvas course) it opens Canvas in a new tab; otherwise
   it just shows a toast, like the mockup did. */
function sourceTag(cls, label, href) {
  if (cls.source === "Manual") return `<span class="tag type">Manual</span>`;
  const isCanvas = cls.source === "Canvas";
  const link = href || (isCanvas && cls.external_course_id && CANVAS.base_url
    ? `${CANVAS.base_url}/courses/${encodeURIComponent(cls.external_course_id)}` : null);
  if (link) {
    return `<a href="${esc(link)}" class="tag link ${isCanvas ? "canvas" : "ls"}" target="_blank" rel="noopener" title="Open in ${cls.source}">${label || cls.source} ${ICONS.external}</a>`;
  }
  return `<a href="#" class="tag link ${isCanvas ? "canvas" : "ls"}" data-source="${cls.source}" title="Open in ${cls.source}">${label || cls.source} ${ICONS.external}</a>`;
}
function dueClass(a) {
  if (isDone(a)) return "";
  const diff = dayDiff(dueDate(a));
  if (diff < 0 || (diff === 0 && dueDate(a) < new Date())) return "overdue";
  if (diff === 0) return "today";
  return "";
}

/* ---------- Assignment row ---------- */
function assignmentRow(a, opts = {}) {
  const cls = getClassById(a.course_id);
  const d = dueDate(a);
  const handle = opts.handle ? `<div class="handle" title="Drag to reorder">${ICONS.grip}</div>` : "";
  const hasNote = a.notes && a.notes.trim();
  const type = typeLabel(a);
  return `
    <div class="a-row ${opts.handle ? "" : "compact"} ${isDone(a) ? "done" : ""}" data-id="${a.assignment_id}" ${opts.handle ? 'draggable="true"' : ""}>
      ${handle}
      <div class="bar" style="background:${cls.color_hex}"></div>
      <div class="body" data-open="${a.assignment_id}" title="Edit assignment">
        <div class="title">${esc(a.title)}</div>
        <div class="meta">
          <button type="button" class="tag clickable" data-filter-class="${esc(cls.course_code)}" style="background:${cls.color_hex}1a;color:${cls.color_hex}" title="Filter by ${esc(cls.course_code)}">${esc(cls.course_code)}</button>
          ${type ? `<button type="button" class="tag type clickable" data-filter-type="${esc(type)}" title="Filter by ${esc(type)}">${esc(type)}</button>` : ""}
          ${a.estimated_minutes ? `<span class="tag type" title="Estimated effort">${fmtMinutes(a.estimated_minutes)}</span>` : ""}
          <span class="sep">•</span>
          <span class="submission">${esc(a.submission_type || "No submission")}</span>
          <span class="sep">•</span>
          ${sourceTag(cls, null, a.external_url)}
        </div>
        <div class="notes ${hasNote ? "" : "empty-note"}" data-notes="${a.assignment_id}">
          <span class="notes-text">${hasNote ? esc(a.notes) : "Add a note"}</span>
          <button type="button" class="pencil" data-edit-note="${a.assignment_id}" title="Edit note">${ICONS.pencil}</button>
        </div>
      </div>
      <div class="due ${dueClass(a)}">
        <div class="d">${fmtDayLabel(d)}</div>
        <div class="t">${a.due_time_known === false ? "All day" : fmtTime(d)}</div>
      </div>
      <div class="check ${isDone(a) ? "on" : ""}" title="${isDone(a) ? "Mark incomplete" : "Mark complete"}" data-check="${a.assignment_id}">${isDone(a) ? ICONS.check : ""}</div>
    </div>`;
}

/* Save a partial update for one assignment, swap in the fresh row, re-render. */
async function saveAssignment(id, fields, onChange, successMsg) {
  try {
    const row = await API.assignments.update(id, fields);
    replaceAssignment(row);
    if (successMsg) toast(successMsg);
    if (onChange) onChange();
  } catch (err) {
    toast(err.message);
    if (onChange) onChange();
  }
}

/* Wire up row interactions in a container.
   onChange() re-renders after a data change.
   opts.onFilterClass / opts.onFilterType receive the clicked tag value (dashboard);
   elsewhere a tag click jumps to the dashboard pre-filtered. */
let _lastOnChange = null;
function bindChecks(container, onChange, opts = {}) {
  _lastOnChange = onChange;
  container.querySelectorAll("[data-check]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const a = getAssignment(Number(el.dataset.check));
      const done = !isDone(a);
      saveAssignment(a.assignment_id, { completed: done }, onChange, done ? "Marked complete" : "Marked incomplete");
    });
  });
  container.querySelectorAll("[data-source]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      toast(el.dataset.source === "Canvas" ? "Connect Canvas in Settings to open assignments there" : `${el.dataset.source} sync is not built yet`);
    });
  });
  /* Real external links open Canvas without also opening the edit modal */
  container.querySelectorAll("a.tag.link[target=_blank]").forEach(el => el.addEventListener("click", e => e.stopPropagation()));
  container.querySelectorAll("[data-filter-class]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      if (opts.onFilterClass) opts.onFilterClass(el.dataset.filterClass);
      else window.location.href = `dashboard.html?class=${encodeURIComponent(el.dataset.filterClass)}`;
    });
  });
  container.querySelectorAll("[data-filter-type]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      if (opts.onFilterType) opts.onFilterType(el.dataset.filterType);
      else window.location.href = `dashboard.html?type=${encodeURIComponent(el.dataset.filterType)}`;
    });
  });
  container.querySelectorAll("[data-open]").forEach(el => {
    el.addEventListener("click", () => openAssignmentModal({ assignment: getAssignment(Number(el.dataset.open)) }, onChange));
  });
  /* Notes: clicks inside the notes block never open the edit modal */
  container.querySelectorAll("[data-notes]").forEach(el => {
    el.addEventListener("click", e => e.stopPropagation());
    el.addEventListener("dragstart", e => e.stopPropagation());
  });
  container.querySelectorAll("[data-edit-note]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      inlineNoteEditor(container.querySelector(`[data-notes="${btn.dataset.editNote}"]`), Number(btn.dataset.editNote), onChange);
    });
  });
}

/* Swap a row's notes line for an inline textarea with Save / Cancel */
function inlineNoteEditor(notesEl, id, onChange) {
  const a = getAssignment(id);
  const original = notesEl.innerHTML;
  notesEl.classList.add("editing");
  notesEl.classList.remove("empty-note");
  notesEl.innerHTML = `
    <textarea class="input notes-input" rows="2" placeholder="Rubric details, group members, where to submit">${esc(a.notes || "")}</textarea>
    <div class="notes-actions">
      <button type="button" class="btn btn-primary btn-sm" data-save>Save</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
      ${a.notes && a.notes.trim() ? `<button type="button" class="btn btn-ghost btn-sm" data-clear style="margin-left:auto;color:var(--danger)">Delete note</button>` : ""}
    </div>`;
  const ta = notesEl.querySelector("textarea");
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);

  notesEl.querySelector("[data-save]").addEventListener("click", () => saveAssignment(id, { notes: ta.value.trim() }, onChange, "Note saved"));
  notesEl.querySelector("[data-cancel]").addEventListener("click", () => { notesEl.classList.remove("editing"); if (!a.notes) notesEl.classList.add("empty-note"); notesEl.innerHTML = original; });
  const clear = notesEl.querySelector("[data-clear]");
  if (clear) clear.addEventListener("click", () => saveAssignment(id, { notes: null }, onChange, "Note deleted"));
  ta.addEventListener("keydown", e => {
    if (e.key === "Escape") notesEl.querySelector("[data-cancel]").click();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) notesEl.querySelector("[data-save]").click();
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Assignment modal: add, edit, delete (shared across pages) ---------- */
function ensureAssignmentModal() {
  if (document.getElementById("assignment-modal")) return;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "assignment-modal";
  wrap.innerHTML = `
    <div class="modal">
      <h3 id="a-modal-title">Add an assignment</h3>
      <form id="assignment-form" novalidate>
        <input type="hidden" id="a-id">
        <div class="form-error" id="assignment-error" role="alert"></div>
        <div class="field">
          <label for="a-class">Class</label>
          <select class="select" id="a-class"></select>
        </div>
        <div class="field">
          <label for="a-title">Assignment name</label>
          <input class="input" id="a-title" placeholder="e.g. Chapter 8 Homework" maxlength="200">
          <span class="error" id="a-title-error"></span>
        </div>
        <div class="row">
          <div class="field">
            <label for="a-type">Assignment type</label>
            <select class="select" id="a-type"></select>
          </div>
          <div class="field">
            <label for="a-submission">Submission type</label>
            <select class="select" id="a-submission"></select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="a-date">Due date</label>
            <input class="input" id="a-date" type="date">
            <span class="error" id="a-date-error"></span>
          </div>
          <div class="field">
            <label for="a-time">Due time</label>
            <input class="input" id="a-time" type="time" value="23:59">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="a-minutes">Estimated minutes <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
            <input class="input" id="a-minutes" type="number" min="1" placeholder="e.g. 60">
            <span class="error" id="a-minutes-error"></span>
          </div>
        </div>
        <div class="field">
          <label for="a-notes">Notes <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <textarea class="input" id="a-notes" rows="3" placeholder="Rubric details, group members, where to submit"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="a-delete" style="margin-right:auto;color:var(--danger)">${ICONS.trash} Delete</button>
          <button type="button" class="btn btn-secondary" data-close="assignment-modal">Cancel</button>
          <button type="submit" class="btn btn-primary" id="a-submit">Add assignment</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  const form = document.getElementById("assignment-form");
  const errorBox = document.getElementById("assignment-error");
  const submit = document.getElementById("a-submit");
  const del = document.getElementById("a-delete");
  const setErr = (id, msg) => {
    const field = document.getElementById(id).closest(".field");
    const span = document.getElementById(`${id}-error`);
    field.classList.toggle("invalid", !!msg);
    if (span) span.textContent = msg || "";
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorBox.classList.remove("show");
    const id = document.getElementById("a-id").value;
    const title = document.getElementById("a-title").value.trim();
    const date = document.getElementById("a-date").value;
    const time = document.getElementById("a-time").value || "23:59";
    const minutesRaw = document.getElementById("a-minutes").value;
    const minutes = minutesRaw === "" ? null : Number(minutesRaw);

    let ok = true;
    if (!title) { setErr("a-title", "Assignment name is required."); ok = false; } else setErr("a-title", "");
    if (!date) { setErr("a-date", "Due date is required."); ok = false; } else setErr("a-date", "");
    if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) { setErr("a-minutes", "Whole number above 0."); ok = false; } else setErr("a-minutes", "");
    if (!ok) return;

    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const fields = {
      course_id: Number(document.getElementById("a-class").value),
      title,
      due_at: new Date(y, m - 1, d, hh, mm).toISOString(),
      due_time_known: true,
      assignment_type_id: document.getElementById("a-type").value ? Number(document.getElementById("a-type").value) : null,
      submission_type: document.getElementById("a-submission").value || null,
      estimated_minutes: minutes,
      notes: document.getElementById("a-notes").value.trim() || null,
    };

    submit.disabled = true;
    try {
      const row = id ? await API.assignments.update(Number(id), fields) : await API.assignments.create(fields);
      replaceAssignment(row);
      closeModal("assignment-modal");
      toast(id ? "Assignment saved" : "Assignment added");
      if (wrap._onChange) wrap._onChange();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
    } finally {
      submit.disabled = false;
    }
  });

  /* Delete is two clicks: the first arms the button, the second deletes. */
  let armed = null;
  del.addEventListener("click", async () => {
    const id = Number(document.getElementById("a-id").value);
    if (!id) return;
    if (!armed) {
      del.innerHTML = `${ICONS.trash} Confirm delete`;
      del.classList.add("btn-danger"); del.classList.remove("btn-ghost"); del.style.color = "";
      armed = setTimeout(() => disarm(), 4000);
      return;
    }
    disarm();
    del.disabled = true;
    try {
      await API.assignments.remove(id);
      ASSIGNMENTS = ASSIGNMENTS.filter(a => a.assignment_id !== id);
      closeModal("assignment-modal");
      toast("Assignment deleted");
      if (wrap._onChange) wrap._onChange();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
    } finally {
      del.disabled = false;
    }
  });
  function disarm() {
    clearTimeout(armed); armed = null;
    del.innerHTML = `${ICONS.trash} Delete`;
    del.classList.remove("btn-danger"); del.classList.add("btn-ghost"); del.style.color = "var(--danger)";
  }
  wrap._disarm = disarm;
}

/* opts.assignment = edit that row; opts.course_id = add, preselecting that class.
   onChange() runs after a successful save or delete. */
function openAssignmentModal(opts = {}, onChange) {
  ensureAssignmentModal();
  const wrap = document.getElementById("assignment-modal");
  wrap._onChange = onChange || _lastOnChange;
  wrap._disarm();
  const a = opts.assignment || null;
  const errorBox = document.getElementById("assignment-error");
  errorBox.classList.remove("show");
  ["a-title", "a-date", "a-minutes"].forEach(id => document.getElementById(id).closest(".field").classList.remove("invalid"));

  const preselect = a ? a.course_id : opts.course_id;
  document.getElementById("a-class").innerHTML = CLASSES.map(c =>
    `<option value="${c.course_id}" ${c.course_id === preselect ? "selected" : ""}>${esc(c.course_code)}${c.course_name ? ` · ${esc(c.course_name)}` : ""}</option>`).join("");
  document.getElementById("a-type").innerHTML = `<option value="">None</option>` +
    ASSIGNMENT_TYPES.map(t => `<option value="${t.assignment_type_id}" ${a && a.assignment_type_id === t.assignment_type_id ? "selected" : ""}>${esc(cap(t.name))}</option>`).join("");
  const subs = [...SUBMISSION_TYPES];
  if (a && a.submission_type && !subs.includes(a.submission_type)) subs.push(a.submission_type);
  document.getElementById("a-submission").innerHTML = subs.map(s => `<option ${a && a.submission_type === s ? "selected" : ""}>${esc(s)}</option>`).join("");

  const due = a ? dueDate(a) : addDays(today(), 3);
  document.getElementById("a-id").value = a ? a.assignment_id : "";
  document.getElementById("a-title").value = a ? a.title : "";
  document.getElementById("a-date").value = toDateInput(due);
  document.getElementById("a-time").value = a ? toTimeInput(due) : "23:59";
  document.getElementById("a-minutes").value = a && a.estimated_minutes ? a.estimated_minutes : "";
  document.getElementById("a-notes").value = a ? (a.notes || "") : "";

  document.getElementById("a-modal-title").textContent = a ? "Edit assignment" : "Add an assignment";
  document.getElementById("a-submit").textContent = a ? "Save" : "Add assignment";
  document.getElementById("a-delete").style.display = a ? "" : "none";
  openModal("assignment-modal");
  setTimeout(() => document.getElementById("a-title").focus(), 50);
}

/* Kept for pages that still call it: opens the edit modal for that assignment. */
function openDetail(id) { openAssignmentModal({ assignment: getAssignment(id) }); }

/* ---------- Sidebar ---------- */
function userInitials(u) {
  return ((u.first_name || "")[0] || "") + ((u.last_name || "")[0] || "");
}

function renderSidebar(active) {
  const items = [
    { key: "dashboard",   label: "Dashboard",   href: "dashboard.html",   icon: ICONS.dashboard },
    { key: "calendar",    label: "Calendar",    href: "calendar.html",    icon: ICONS.calendar },
    { key: "assignments", label: "Assignments", href: "assignments.html", icon: ICONS.list },
    { key: "settings",    label: "Settings",    href: "settings.html",    icon: ICONS.settings },
  ];
  const el = document.getElementById("sidebar");
  el.className = "sidebar";
  el.innerHTML = `
    <a class="brand" href="dashboard.html"><span class="brand-mark">D</span><span>DueList</span></a>
    <nav class="nav">
      ${items.map(i => `<a href="${i.href}" class="${i.key === active ? "active" : ""}">${i.icon}<span>${i.label}</span></a>`).join("")}
    </nav>
    <div class="sidebar-bottom">
      <button type="button" class="btn btn-secondary btn-block btn-sm" id="sync-btn">${ICONS.sync} Sync now</button>
      <div class="sync-note">${SYNC.can_sync
        ? `<span class="dot ${SYNC.canvas_status === "error" ? "bad" : ""}"></span> ${[SYNC.canvas_connected ? "Canvas" : null, SYNC.learning_suite_courses ? "Learning Suite" : null].filter(Boolean).join(" &amp; ")} · synced <span id="sync-time">${relTime(SYNC.last_synced_at)}</span>`
        : `<span class="dot off"></span> Nothing linked yet · <a href="settings.html">Connect</a>`}</div>
      <div class="user-chip">
        <div class="avatar">${esc(userInitials(USER))}</div>
        <div style="flex:1;min-width:0">
          <div class="name">${esc(USER.first_name)} ${esc(USER.last_name)}</div>
          <div class="email">${esc(USER.email || USER.username)}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" id="logout-btn" title="Sign out">${ICONS.logout}</button>
      </div>
    </div>`;

  /* Sync pulls Canvas (if connected) and every Learning Suite feed, then reloads the page data. */
  const btn = document.getElementById("sync-btn");
  btn.addEventListener("click", async () => {
    if (!SYNC.can_sync) { toast("Connect Canvas in Settings or add a Learning Suite class with an iCal link"); return; }
    btn.disabled = true;
    btn.classList.add("syncing");
    btn.innerHTML = `${ICONS.sync} Syncing`;
    const reset = () => { btn.disabled = false; btn.classList.remove("syncing"); btn.innerHTML = `${ICONS.sync} Sync now`; };
    try {
      const r = await API.sync.run();
      const problems = [
        r.canvas_error ? `Canvas: ${r.canvas_error}` : null,
        ...(r.learning_suite?.errors || []).map(e => `${e.course_code}: ${e.error}`),
      ];
      if (r.nothing_linked) { toast("No Canvas or Learning Suite classes linked yet"); reset(); return; }
      const timeEl = document.getElementById("sync-time");
      if (timeEl) timeEl.textContent = "just now";
      toast(problems.length
        ? problems[0]
        : `Synced ${r.assignments_synced} assignment${r.assignments_synced === 1 ? "" : "s"} from ${r.courses_synced} class${r.courses_synced === 1 ? "" : "es"}`);
      if (r.courses_synced) setTimeout(() => window.location.reload(), problems.length ? 2200 : 900);
      else reset();
    } catch (err) {
      toast(err.message);
      reset();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try { await API.logout(); } catch { /* session is gone either way */ }
    window.location.href = "index.html";
  });
}

/* ---------- Modal / toast ---------- */
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
document.addEventListener("click", e => {
  if (e.target.classList.contains("modal-backdrop")) e.target.classList.remove("open");
  const close = e.target.closest("[data-close]");
  if (close) closeModal(close.dataset.close);
});

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
