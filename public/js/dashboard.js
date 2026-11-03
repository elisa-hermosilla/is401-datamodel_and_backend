/* Dashboard. Classes and assignments come from the API. */

initApp("dashboard").then(main);

function main() {
  /* Greeting */
  (function () {
    const h = new Date().getHours();
    const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("greeting").textContent = `${g}, ${USER.first_name}`;
    document.getElementById("today-line").textContent = fmtLongDate(new Date());
  })();

  /* ---------- Buckets ---------- */
  function openItems() { return ASSIGNMENTS.filter(a => !isDone(a)); }
  function bucket() {
    const now = new Date();
    const list = openItems();
    return {
      past:     list.filter(a => dueDate(a) < now),
      today:    list.filter(a => dayDiff(dueDate(a)) === 0 && dueDate(a) >= now),
      tomorrow: list.filter(a => dayDiff(dueDate(a)) === 1),
      week:     list.filter(a => { const d = dayDiff(dueDate(a)); return d >= 0 && d <= 7 && dueDate(a) >= now; }),
    };
  }

  function renderStats() {
    const b = bucket();
    const byDue = l => [...l].sort((x, y) => dueDate(x) - dueDate(y));
    const weekClasses = [...new Set(b.week.map(a => a.course_id))].length;
    const stats = [
      { cls: "danger", icon: ICONS.alert, label: "Past due",     value: b.past.length,     foot: b.past.length ? `Oldest: ${fmtDayLabel(dueDate(byDue(b.past)[0]))}` : "None past due" },
      { cls: "warn",   icon: ICONS.clock, label: "Due today",    value: b.today.length,    foot: b.today.length ? `Next: ${fmtTime(dueDate(byDue(b.today)[0]))}` : "Nothing left today" },
      { cls: "info",   icon: ICONS.sun,   label: "Due tomorrow", value: b.tomorrow.length, foot: b.tomorrow.length ? `${esc(byDue(b.tomorrow)[0].course_code)} first` : "Nothing due tomorrow" },
      { cls: "ok",     icon: ICONS.week,  label: "Next 7 days",  value: b.week.length,     foot: `${weekClasses} class${weekClasses === 1 ? "" : "es"}` },
    ];
    document.getElementById("stat-grid").innerHTML = stats.map(s => `
      <a class="card stat ${s.cls}" href="calendar.html" title="Open in calendar">
        <div class="label"><span class="ico">${s.icon}</span>${s.label}</div>
        <div class="value">${s.value}</div>
        <div class="foot">${s.foot}</div>
      </a>`).join("");
  }

  /* ---------- Work on this next + progress (structure from Danny's mockup) ---------- */
  function renderNext() {
    const open = openItems().sort((a, b) => dueDate(a) - dueDate(b));
    const next = open[0];
    const done = ASSIGNMENTS.filter(isDone).length;
    const pct = ASSIGNMENTS.length ? Math.round((done / ASSIGNMENTS.length) * 100) : 0;

    const el = document.getElementById("next-grid");
    const type = next ? typeLabel(next) : "";
    el.innerHTML = `
      <div class="card next-card">
        <div class="eyebrow">Work on this next</div>
        ${next ? `
          <h3>${esc(next.title)}</h3>
          <div class="meta">
            <span class="tag">${esc(next.course_code)}</span>
            ${type ? `<span class="tag">${esc(type)}</span>` : ""}
            ${next.estimated_minutes ? `<span class="tag">${fmtMinutes(next.estimated_minutes)} estimated</span>` : ""}
            <span>Due ${fmtDayLabel(dueDate(next))} · ${fmtTime(dueDate(next))}</span>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-light" data-open-next="${next.assignment_id}">View details</button>
            <button type="button" class="btn btn-outline" data-done-next="${next.assignment_id}">Mark complete</button>
          </div>` : `
          <h3>Nothing open</h3>
          <p class="empty-next">${CLASSES.length ? "No open assignments." : "Add a class on the Assignments page to get started."}</p>`}
      </div>
      <div class="card progress-card">
        <div class="label" style="font-size:13px;font-weight:600;color:var(--muted)">Completed</div>
        <div class="num">${done}<small>of ${ASSIGNMENTS.length}</small></div>
        <div class="progress-track"><div style="width:${pct}%"></div></div>
        <div class="foot">${pct}% of this semester's assignments</div>
      </div>`;

    const openBtn = el.querySelector("[data-open-next]");
    if (openBtn) openBtn.addEventListener("click", () => openAssignmentModal({ assignment: getAssignment(Number(openBtn.dataset.openNext)) }, renderAll));
    const doneBtn = el.querySelector("[data-done-next]");
    if (doneBtn) doneBtn.addEventListener("click", () => saveAssignment(Number(doneBtn.dataset.doneNext), { completed: true }, renderAll, "Marked complete"));
  }

  /* ---------- Streaks ---------- */
  function renderStreaks() {
    const b = bucket();
    const pastDueStreak = b.past.length ? 0 : 12;
    const dots = n => Array.from({ length: 7 }, (_, i) => `<span class="${i < Math.min(n, 7) ? "on" : ""}"></span>`).join("");
    document.getElementById("streak-grid").innerHTML = `
      <div class="card streak">
        <div class="flame ${pastDueStreak ? "" : "off"}">${ICONS.flame}</div>
        <div>
          <div class="num">${pastDueStreak}<small>days</small></div>
          <div class="title">No past-due assignments</div>
          <div class="meta">${pastDueStreak ? `Best streak: ${USER.no_past_due_best_streak} days` : `${b.past.length} past due · Best: ${USER.no_past_due_best_streak} days`}</div>
          <div class="streak-dots">${dots(pastDueStreak)}</div>
        </div>
      </div>
      <div class="card streak blue">
        <div class="flame">${ICONS.calCheck}</div>
        <div>
          <div class="num">${STREAKS.checkInCurrent}<small>days</small></div>
          <div class="title">Daily check-in streak</div>
          <div class="meta">Opened every day since ${fmtDate(addDays(today(), -STREAKS.checkInCurrent + 1))} · Best: ${USER.check_in_best_streak}</div>
          <div class="streak-dots">${dots(7)}</div>
        </div>
      </div>`;
  }

  /* ---------- Filters ---------- */
  const filters = { classes: new Set(), types: new Set() };
  (function readUrlFilters() {
    const p = new URLSearchParams(location.search);
    if (p.get("class") && getClass(p.get("class"))) filters.classes.add(p.get("class"));
    if (p.get("type")) filters.types.add(p.get("type"));
  })();

  const fClass = document.getElementById("f-class");
  const fType = document.getElementById("f-type");
  const typeNames = () => ASSIGNMENT_TYPES.map(t => cap(t.name));

  function renderFilterControls() {
    fClass.innerHTML = `<option value="">+ Class</option>` +
      CLASSES.filter(c => !filters.classes.has(c.course_code)).map(c => `<option value="${esc(c.course_code)}">${esc(c.course_code)}</option>`).join("");
    fType.innerHTML = `<option value="">+ Type</option>` +
      typeNames().filter(t => !filters.types.has(t)).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");

    const chips = [
      ...[...filters.classes].map(code => `<span class="filter-chip" style="background:${getClass(code).color_hex}">${esc(code)}<button type="button" data-rm-class="${esc(code)}" title="Remove filter">${ICONS.x}</button></span>`),
      ...[...filters.types].map(t => `<span class="filter-chip type">${esc(t)}<button type="button" data-rm-type="${esc(t)}" title="Remove filter">${ICONS.x}</button></span>`),
    ];
    const el = document.getElementById("active-filters");
    el.innerHTML = chips.length
      ? chips.join("") + `<button type="button" class="btn btn-ghost btn-sm" id="clear-filters">Clear all</button>`
      : `<span style="font-size:13px;color:var(--muted)">No filters</span>`;

    el.querySelectorAll("[data-rm-class]").forEach(b => b.addEventListener("click", () => { filters.classes.delete(b.dataset.rmClass); refresh(); }));
    el.querySelectorAll("[data-rm-type]").forEach(b => b.addEventListener("click", () => { filters.types.delete(b.dataset.rmType); refresh(); }));
    const clear = document.getElementById("clear-filters");
    if (clear) clear.addEventListener("click", () => { filters.classes.clear(); filters.types.clear(); refresh(); });
  }
  fClass.addEventListener("change", () => { if (fClass.value) { filters.classes.add(fClass.value); refresh(); } });
  fType.addEventListener("change", () => { if (fType.value) { filters.types.add(fType.value); refresh(); } });

  function addClassFilter(code) { filters.classes.add(code); refresh(); toast(`Filtering by ${code}`); }
  function addTypeFilter(t) { filters.types.add(t); refresh(); toast(`Filtering by ${t}`); }

  /* ---------- Search ---------- */
  /* Every word typed must appear somewhere in the row's name, class code or
     name, submission type, or assignment type (case- and accent-insensitive).
     Class codes are also matched without their spaces, so "is401" finds
     "IS 401". Typing is debounced; Esc clears; "/" focuses the box. */
  const searchEl = document.getElementById("search");
  const searchClear = document.getElementById("search-clear");
  document.getElementById("search-icon").innerHTML = ICONS.search;
  searchClear.innerHTML = ICONS.x;
  let searchTokens = [];
  const tokensOf = q => normText(q).split(/\s+/).filter(Boolean);
  function matchesSearch(a) {
    if (!searchTokens.length) return true;
    const cls = getClassById(a.course_id);
    const hay = normText([
      a.title, a.course_code, String(a.course_code || "").replace(/\s+/g, ""),
      cls && cls.course_name, a.submission_type, typeLabel(a),
    ].filter(Boolean).join(" | "));
    return searchTokens.every(t => hay.includes(t));
  }
  function updateSearch() {
    searchTokens = tokensOf(searchEl.value);
    searchClear.style.display = searchEl.value ? "" : "none";
    renderList();
  }
  let searchTimer = null;
  searchEl.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(updateSearch, 120); });
  searchEl.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (searchEl.value) { searchEl.value = ""; updateSearch(); } else searchEl.blur();
  });
  searchClear.addEventListener("click", () => { searchEl.value = ""; updateSearch(); searchEl.focus(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  });
  /* ?q=... in the URL pre-fills the search (the first render below applies it) */
  const q0 = new URLSearchParams(location.search).get("q");
  if (q0) { searchEl.value = q0; searchTokens = tokensOf(q0); searchClear.style.display = ""; }

  function applyFilters(list) {
    return list.filter(a =>
      (filters.classes.size === 0 || filters.classes.has(a.course_code)) &&
      (filters.types.size === 0 || filters.types.has(typeLabel(a))) &&
      matchesSearch(a));
  }

  function refresh() { renderFilterControls(); renderList(); }
  function renderAll() { renderStats(); renderNext(); renderStreaks(); renderList(); }

  /* ---------- Sortable list ---------- */
  const sortSel = document.getElementById("sort");
  const showDone = document.getElementById("show-done");
  const resetBtn = document.getElementById("reset-order");

  /* The chosen sort survives leaving the page: it's a preference, so it lives
     in localStorage (per browser, keyed by user so shared machines don't mix).
     With no saved choice, start in Custom if the student has ever dragged. */
  const SORT_KEY = `duelist.sort.${USER.user_id}`;
  const SORT_MODES = ["due", "class", "type", "custom"];
  let savedSort = null;
  try { savedSort = localStorage.getItem(SORT_KEY); } catch { /* storage blocked; fall through */ }
  if (SORT_MODES.includes(savedSort)) sortSel.value = savedSort;
  else if (ASSIGNMENTS.some(a => a.sort_order != null)) sortSel.value = "custom";
  function rememberSort() {
    try { localStorage.setItem(SORT_KEY, sortSel.value); } catch { /* storage blocked; nothing to do */ }
  }

  /* The custom order. Rows the student has dragged carry a sort_order; rows
     that arrived since (a newly synced assignment, a new manual one) have none.
     Instead of dumping those at the bottom, slot each one where it disturbs
     due-date order the least: the position with the most rows above it due at
     or before it, plus rows below it due at or after it. On a list that's
     already in due order that is simply "before the first row due at or after
     it"; a single row the student pinned out of order can't pull new rows
     along with it. Ties go to the earlier spot, so a new row sits ahead of rows
     due at the same time. The next drag saves these positions for real. */
  function customOrder(list) {
    const byDueThenId = (a, b) => dueDate(a) - dueDate(b) || a.assignment_id - b.assignment_id;
    const result = list.filter(a => a.sort_order != null)
      .sort((a, b) => a.sort_order - b.sort_order || byDueThenId(a, b));
    /* Latest-due first, so two new rows due the same day end up in id order */
    const pending = list.filter(a => a.sort_order == null).sort((a, b) => byDueThenId(b, a));
    for (const p of pending) {
      const due = dueDate(p).getTime();
      /* before[i] = rows among result[0..i) due at or before p; after[i] = rows
         among result[i..] due at or after p; earlier[i] = rows among result[0..i)
         due strictly before p. Ties on the main score are broken by `earlier`
         (so a pinned out-of-order row at the top doesn't win), then by the
         earlier index (so a new row sits ahead of rows due at the same time). */
      const n = result.length;
      const before = new Array(n + 1).fill(0);
      const earlier = new Array(n + 1).fill(0);
      const after = new Array(n + 1).fill(0);
      for (let i = 0; i < n; i++) {
        const d = dueDate(result[i]).getTime();
        before[i + 1] = before[i] + (d <= due ? 1 : 0);
        earlier[i + 1] = earlier[i] + (d < due ? 1 : 0);
      }
      for (let i = n - 1; i >= 0; i--) after[i] = after[i + 1] + (dueDate(result[i]).getTime() >= due ? 1 : 0);
      let best = 0, bestScore = -1, bestEarlier = -1;
      for (let i = 0; i <= n; i++) {
        const score = before[i] + after[i];
        if (score > bestScore || (score === bestScore && earlier[i] > bestEarlier)) { best = i; bestScore = score; bestEarlier = earlier[i]; }
      }
      result.splice(best, 0, p);
    }
    return result;
  }

  function sorted() {
    let list = applyFilters(showDone.checked ? [...ASSIGNMENTS] : openItems());
    const mode = sortSel.value;
    if (mode === "custom") {
      list = customOrder(list);
    } else if (mode === "class") {
      list.sort((a, b) => a.course_code.localeCompare(b.course_code) || dueDate(a) - dueDate(b));
    } else if (mode === "type") {
      list.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)) || dueDate(a) - dueDate(b));
    } else {
      list.sort((a, b) => dueDate(a) - dueDate(b));
    }
    return list;
  }

  function renderList() {
    const el = document.getElementById("assignment-list");
    const list = sorted();
    const hasFilters = filters.classes.size || filters.types.size || searchTokens.length;
    /* Drag handles and the Reset button only make sense in Custom mode */
    const custom = sortSel.value === "custom";
    /* Reset is offered only in Custom mode, and only when the custom order
       actually differs from plain due-date order (otherwise there's nothing
       to reset). style.display, not the hidden attribute: the .btn display
       rule would override `hidden`. */
    const showReset = custom && customDiffersFromDue();
    resetBtn.style.display = showReset ? "" : "none";
    if (!showReset) disarmReset();
    el.innerHTML = list.length
      ? list.map(a => assignmentRow(a, { handle: custom, gutter: true, highlight: searchTokens })).join("")
      : `<div class="empty">${searchTokens.length
          ? `No assignments match “${esc(searchEl.value.trim())}”${filters.classes.size || filters.types.size ? " with these filters" : ""}.`
          : hasFilters ? "No assignments match these filters." : "Nothing due."}</div>`;
    document.getElementById("filter-count").textContent = `${list.length} assignment${list.length === 1 ? "" : "s"}`;
    bindChecks(el, renderAll, { onFilterClass: addClassFilter, onFilterType: addTypeFilter });
    if (custom) bindDrag(el);
  }

  /* Does the student's custom order (over every assignment) differ from due-date order? */
  function customDiffersFromDue() {
    const byDue = [...ASSIGNMENTS].sort((a, b) => dueDate(a) - dueDate(b) || a.assignment_id - b.assignment_id);
    const custom = customOrder(ASSIGNMENTS);
    return custom.some((a, i) => a.assignment_id !== byDue[i].assignment_id);
  }

  /* Reset order: first click arms the button, a second click within 4s clears
     the custom order everywhere. The view stays in Custom mode, which with no
     saved positions is plain due-date order. */
  let resetArmed = null;
  function disarmReset() {
    clearTimeout(resetArmed); resetArmed = null;
    resetBtn.textContent = "Reset order";
    resetBtn.classList.add("btn-ghost"); resetBtn.classList.remove("btn-danger");
  }
  resetBtn.addEventListener("click", async () => {
    if (!resetArmed) {
      resetBtn.textContent = "Confirm reset";
      resetBtn.classList.add("btn-danger"); resetBtn.classList.remove("btn-ghost");
      resetArmed = setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    resetBtn.disabled = true;
    try {
      await API.assignments.resetOrder();
      ASSIGNMENTS.forEach(a => { a.sort_order = null; });
      renderList();
      toast("Custom order cleared");
    } catch (err) {
      toast(err.message);
    } finally {
      resetBtn.disabled = false;
    }
  });

  /* While dragging, a blue line shows the gap the row will land in: above the
     row under the pointer when the pointer is in its top half, below it
     otherwise. The drop uses the same rule. */
  function bindDrag(el) {
    let dragId = null;
    const clearMarkers = () => el.querySelectorAll(".drop-before, .drop-after").forEach(r => r.classList.remove("drop-before", "drop-after"));
    const dropAfter = (row, e) => { const r = row.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    el.querySelectorAll(".a-row").forEach(row => {
      row.addEventListener("dragstart", () => { dragId = Number(row.dataset.id); row.classList.add("dragging"); });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); clearMarkers(); });
      row.addEventListener("dragover", e => {
        e.preventDefault();
        if (Number(row.dataset.id) === dragId) return;
        const after = dropAfter(row, e);
        row.classList.toggle("drop-after", after);
        row.classList.toggle("drop-before", !after);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
      row.addEventListener("drop", async e => {
        e.preventDefault();
        const targetId = Number(row.dataset.id);
        const after = dropAfter(row, e);
        clearMarkers();
        if (dragId === null || dragId === targetId) return;
        const visible = sorted().map(a => a.assignment_id);
        visible.splice(visible.indexOf(dragId), 1);
        visible.splice(visible.indexOf(targetId) + (after ? 1 : 0), 0, dragId);
        /* Save every assignment, not just the visible ones: rows hidden by a
           filter or the Show-completed toggle keep their places relative to
           the visible rows, instead of being renumbered over. */
        const visibleSet = new Set(visible);
        let v = 0;
        const order = customOrder(ASSIGNMENTS).map(a => (visibleSet.has(a.assignment_id) ? visible[v++] : a.assignment_id));
        order.forEach((id, i) => { getAssignment(id).sort_order = i + 1; });
        sortSel.value = "custom";
        rememberSort();
        renderList();
        try { await API.assignments.reorder(order); toast("Order saved"); }
        catch (err) { toast(err.message); }
      });
    });
  }

  sortSel.addEventListener("change", () => { rememberSort(); renderList(); });
  showDone.addEventListener("change", renderList);

  renderStats();
  renderNext();
  renderStreaks();
  refresh();

  /* Everything is rendered: show the page, sections fading in top to bottom */
  const mainEl = document.querySelector("main.main");
  mainEl.classList.remove("is-loading");
  mainEl.classList.add("reveal");
}
