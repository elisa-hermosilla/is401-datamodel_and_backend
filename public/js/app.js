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
   USER:        the logged-in user from GET /api/me
   CLASSES:     the user's courses from GET /api/courses, with a derived
                `source` name (Canvas / Learning Suite / Manual) for the tags
   LMS_SOURCES: [{lms_source_id, name}] for the class form's dropdown */
let USER = null;
let CLASSES = [];
let LMS_SOURCES = [];

/* Call this first on every app page. Redirects to the sign-in page when the
   session is missing, then loads sources + classes and draws the sidebar. */
async function initApp(activeNav) {
  try {
    USER = await API.me();
  } catch {
    window.location.replace("index.html");
    return new Promise(() => {}); // never resolves; the page is navigating away
  }
  const [sources, courses] = await Promise.all([API.lmsSources(), API.courses.list()]);
  LMS_SOURCES = sources;
  setClasses(courses);
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

/* ---------- Dates ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function today() { return startOfDay(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

function dueDate(a) {
  if (a.dueISO) return new Date(a.dueISO);
  const d = addDays(today(), a.offset);
  const [h, m] = a.time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
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

/* ---------- Data helpers ---------- */
function getClass(code) { return CLASSES.find(c => c.course_code === code); }

/* Sample assignments whose class exists in the logged-in user's class list. */
function visibleAssignments() { return ASSIGNMENTS.filter(a => getClass(a.course_code)); }

/* Source tag styled as a link: simulates jumping straight to Canvas / Learning Suite */
function sourceTag(cls, label) {
  const isCanvas = cls.source === "Canvas";
  if (cls.source === "Manual") return `<span class="tag type">Manual</span>`;
  return `<a href="#" class="tag link ${isCanvas ? "canvas" : "ls"}" data-source="${cls.source}" title="Open in ${cls.source}">${label || cls.source} ${ICONS.external}</a>`;
}
function dueClass(a) {
  if (a.done) return "";
  const diff = dayDiff(dueDate(a));
  if (diff < 0 || (diff === 0 && dueDate(a) < new Date())) return "overdue";
  if (diff === 0) return "today";
  return "";
}

/* ---------- Assignment row ---------- */
function assignmentRow(a, opts = {}) {
  const cls = getClass(a.course_code);
  const d = dueDate(a);
  const handle = opts.handle ? `<div class="handle" title="Drag to reorder">${ICONS.grip}</div>` : "";
  const hasNote = a.notes && a.notes.trim();
  return `
    <div class="a-row ${opts.handle ? "" : "compact"} ${a.done ? "done" : ""}" data-id="${a.id}" ${opts.handle ? 'draggable="true"' : ""}>
      ${handle}
      <div class="bar" style="background:${cls.color_hex}"></div>
      <div class="body" data-open="${a.id}" title="View details">
        <div class="title">${esc(a.title)}</div>
        <div class="meta">
          <button type="button" class="tag clickable" data-filter-class="${esc(cls.course_code)}" style="background:${cls.color_hex}1a;color:${cls.color_hex}" title="Filter by ${esc(cls.course_code)}">${esc(cls.course_code)}</button>
          <button type="button" class="tag type clickable" data-filter-type="${a.type}" title="Filter by ${a.type}">${a.type}</button>
          ${a.minutes ? `<span class="tag type" title="Estimated effort">${fmtMinutes(a.minutes)}</span>` : ""}
          <span class="sep">•</span>
          <span class="submission">${a.submission || "No submission"}</span>
          <span class="sep">•</span>
          ${sourceTag(cls)}
        </div>
        <div class="notes ${hasNote ? "" : "empty-note"}" data-notes="${a.id}">
          <span class="notes-text">${hasNote ? esc(a.notes) : "Add a note"}</span>
          <button type="button" class="pencil" data-edit-note="${a.id}" title="Edit note">${ICONS.pencil}</button>
        </div>
      </div>
      <div class="due ${dueClass(a)}">
        <div class="d">${fmtDayLabel(d)}</div>
        <div class="t">${fmtTime(d)}</div>
      </div>
      <div class="check ${a.done ? "on" : ""}" title="Mark complete" data-check="${a.id}">${a.done ? ICONS.check : ""}</div>
    </div>`;
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
      const a = ASSIGNMENTS.find(x => x.id === Number(el.dataset.check));
      a.done = !a.done;
      toast(a.done ? "Marked complete" : "Marked incomplete");
      if (onChange) onChange();
    });
  });
  container.querySelectorAll("[data-source]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      toast(`Opening assignment in ${el.dataset.source}`);
    });
  });
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
    el.addEventListener("click", () => openDetail(Number(el.dataset.open)));
  });
  /* Notes: clicks inside the notes block never open the detail modal */
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
  const a = ASSIGNMENTS.find(x => x.id === id);
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

  const finish = () => { if (onChange) onChange(); else { notesEl.classList.remove("editing"); notesEl.innerHTML = original; } };
  notesEl.querySelector("[data-save]").addEventListener("click", () => { a.notes = ta.value.trim(); toast("Note saved"); finish(); });
  notesEl.querySelector("[data-cancel]").addEventListener("click", () => { notesEl.classList.remove("editing"); if (!a.notes) notesEl.classList.add("empty-note"); notesEl.innerHTML = original; });
  const clear = notesEl.querySelector("[data-clear]");
  if (clear) clear.addEventListener("click", () => { a.notes = ""; toast("Note deleted"); finish(); });
  ta.addEventListener("keydown", e => {
    if (e.key === "Escape") notesEl.querySelector("[data-cancel]").click();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) notesEl.querySelector("[data-save]").click();
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Assignment detail modal (shared across pages) ---------- */
function ensureDetailModal() {
  if (document.getElementById("detail-modal")) return;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "detail-modal";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="between" style="align-items:flex-start;margin-bottom:14px">
        <div>
          <div class="meta" id="dm-class" style="margin-bottom:6px"></div>
          <h3 id="dm-title" style="margin:0"></h3>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" data-close="detail-modal" title="Close">${ICONS.x}</button>
      </div>
      <div class="detail-grid">
        <div><div class="k">Due</div><div class="v" id="dm-due"></div></div>
        <div><div class="k">Assignment type</div><div class="v" id="dm-type"></div></div>
        <div><div class="k">Submission type</div><div class="v" id="dm-sub"></div></div>
        <div><div class="k">Source</div><div class="v" id="dm-source"></div></div>
        <div><div class="k">Estimated effort</div><div class="v" id="dm-minutes"></div></div>
      </div>
      <div class="field" style="margin-top:18px">
        <label for="dm-notes">Notes</label>
        <textarea class="input" id="dm-notes" rows="4" placeholder="Rubric details, group members, where to submit"></textarea>
        <span class="hint">Notes are private to you and show wherever this assignment is listed.</span>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-close="detail-modal">Cancel</button>
        <button type="button" class="btn btn-primary" id="dm-save">Save notes</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById("dm-save").addEventListener("click", () => {
    const a = ASSIGNMENTS.find(x => x.id === Number(wrap.dataset.id));
    a.notes = document.getElementById("dm-notes").value;
    closeModal("detail-modal");
    toast("Notes saved");
    if (_lastOnChange) _lastOnChange();
  });
}

function openDetail(id) {
  ensureDetailModal();
  const a = ASSIGNMENTS.find(x => x.id === id);
  const cls = getClass(a.course_code);
  const d = dueDate(a);
  const wrap = document.getElementById("detail-modal");
  wrap.dataset.id = id;
  document.getElementById("dm-class").innerHTML = `<span class="tag" style="background:${cls.color_hex}1a;color:${cls.color_hex}">${esc(cls.course_code)}</span> <span style="color:var(--muted);font-size:13px">${esc(cls.course_name || "")}</span>`;
  document.getElementById("dm-title").textContent = a.title;
  document.getElementById("dm-due").textContent = `${fmtLongDate(d)} · ${fmtTime(d)}`;
  document.getElementById("dm-type").textContent = a.type;
  document.getElementById("dm-sub").textContent = a.submission || "No submission";
  document.getElementById("dm-minutes").textContent = a.minutes ? fmtMinutes(a.minutes) : "Not set";
  const src = document.getElementById("dm-source");
  src.innerHTML = sourceTag(cls, `Open in ${cls.source}`);
  src.querySelectorAll("[data-source]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault(); toast(`Opening assignment in ${el.dataset.source}`);
  }));
  document.getElementById("dm-notes").value = a.notes || "";
  openModal("detail-modal");
}

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
      <div class="sync-note"><span class="dot"></span> Canvas &amp; Learning Suite · synced <span id="sync-time">4 min ago</span></div>
      <div class="user-chip">
        <div class="avatar">${esc(userInitials(USER))}</div>
        <div style="flex:1;min-width:0">
          <div class="name">${esc(USER.first_name)} ${esc(USER.last_name)}</div>
          <div class="email">${esc(USER.email || USER.username)}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" id="logout-btn" title="Sign out">${ICONS.logout}</button>
      </div>
    </div>`;

  /* Sync is still a mock for this milestone: it just shows its toast. */
  const btn = document.getElementById("sync-btn");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.classList.add("syncing");
    btn.innerHTML = `${ICONS.sync} Syncing`;
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove("syncing");
      btn.innerHTML = `${ICONS.sync} Sync now`;
      document.getElementById("sync-time").textContent = "just now";
      toast("Synced Canvas & Learning Suite");
    }, 1400);
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
