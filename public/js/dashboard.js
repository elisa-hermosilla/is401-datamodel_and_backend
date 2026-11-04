/* Dashboard: deadlines, a paged assignment queue, and a seven-day workload. */
initApp("dashboard").then(main);

function main() {
  const $ = id => document.getElementById(id);
  const rowsPerPage = () => window.innerHeight >= 1000 ? 6 : window.innerHeight >= 850 ? 5 : 3;
  let pageSize = rowsPerPage();
  let page = 0;
  let scope = "all";
  let selectedDate = null;
  const filters = { classes: new Set(), types: new Set() };
  const params = new URLSearchParams(location.search);
  if (params.get("class") && getClass(params.get("class"))) filters.classes.add(params.get("class"));
  if (params.get("type")) filters.types.add(params.get("type"));
  const h = new Date().getHours();
  $("greeting").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${USER.first_name}`;
  $("today-line").textContent = fmtLongDate(new Date());
  if (ASSIGNMENTS.some(a => a.sort_order != null)) $("sort").value = "custom";

  const openItems = () => ASSIGNMENTS.filter(a => !isDone(a));
  // Seven calendar days, including today. Completed items use their due date too.
  const inWeek = a => dayDiff(dueDate(a)) >= 0 && dayDiff(dueDate(a)) < 7;
  function inScope(a) {
    const d = dueDate(a);
    if (scope === "past") return d < new Date();
    if (scope === "today") return sameDay(d, today()) && d >= new Date();
    if (scope === "tomorrow") return dayDiff(d) === 1;
    if (scope === "week") return inWeek(a) && d >= new Date();
    if (scope === "date") return sameDay(d, selectedDate);
    return true;
  }
  const scopeName = () => ({ all: $("show-done").checked ? "All assignments" : "All open assignments", past: "Past due", today: "Still due today", tomorrow: "Due tomorrow", week: "Due in the next 7 days", date: selectedDate ? `Due ${fmtDayLabel(selectedDate).toLowerCase()}` : "" })[scope];
  function setScope(value, date = null) {
    scope = value; selectedDate = date; page = 0;
    renderStats(); renderWeek(); renderList();
  }

  function renderStats() {
    const open = openItems();
    const now = new Date();
    const stats = [
      { key: "past", label: "Past due", cls: "danger", icon: ICONS.alert, items: open.filter(a => dueDate(a) < now), foot: "Needs attention" },
      { key: "today", label: "Due today", cls: "warn", icon: ICONS.clock, items: open.filter(a => sameDay(dueDate(a), today()) && dueDate(a) >= now), foot: "Before tonight" },
      { key: "tomorrow", label: "Due tomorrow", cls: "info", icon: ICONS.sun, items: open.filter(a => dayDiff(dueDate(a)) === 1), foot: fmtDate(addDays(today(), 1)) },
      { key: "week", label: "Next 7 days", cls: "ok", icon: ICONS.week, items: open.filter(a => inWeek(a) && dueDate(a) >= now), foot: "Including today" },
    ];
    $("stat-grid").innerHTML = stats.map(s => `<button type="button" class="card stat ${s.cls} ${scope === s.key ? "is-selected" : ""}" data-scope="${s.key}" aria-pressed="${scope === s.key}"><span class="stat-copy"><span class="stat-icon" aria-hidden="true">${s.icon}</span><span class="label">${s.label}</span><span class="foot">${s.items.length ? s.foot : "Nothing due"}</span></span><span class="value">${s.items.length}</span></button>`).join("");
    $("stat-grid").querySelectorAll("[data-scope]").forEach(btn => btn.addEventListener("click", () => setScope(scope === btn.dataset.scope ? "all" : btn.dataset.scope)));
  }

  function renderNext() {
    const next = openItems().sort((a, b) => dueDate(a) - dueDate(b))[0];
    const el = $("next-grid");
    if (!next) {
      el.innerHTML = `<div class="eyebrow">Your next step</div><h2>${CLASSES.length ? "You're all caught up" : "Start with a class"}</h2><p class="focus-meta">${CLASSES.length ? "No open assignments. New deadlines will appear here." : "Connect your courses or add a class to see your deadlines."}</p><a class="subtle-link" href="assignments.html">${CLASSES.length ? "View classes" : "Add a class"} ↗</a>`;
      return;
    }
    const due = dueDate(next);
    const past = due < new Date();
    el.innerHTML = `<div class="focus-top"><span class="eyebrow">Next deadline</span>${past ? '<span class="status-past">Past due</span>' : ""}</div>
      <h2><button class="focus-title" type="button" data-open="${next.assignment_id}">${esc(next.title)}</button></h2>
      <p class="focus-meta">${esc(next.course_code)}${next.estimated_minutes ? ` · ${fmtMinutes(next.estimated_minutes)} estimated` : ""}</p>
      <p class="focus-due">${fmtDayLabel(due)} · ${next.due_time_known === false ? "All day" : fmtTime(due)}</p>
      <div class="focus-actions"><button type="button" class="btn btn-primary btn-sm" data-check="${next.assignment_id}">${ICONS.check} Complete</button><button type="button" class="btn btn-secondary btn-sm" data-open="${next.assignment_id}">Details</button></div>`;
    bindChecks(el, renderAll);
  }

  function renderWeek() {
    const open = openItems();
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today(), i);
      return { date, items: open.filter(a => sameDay(dueDate(a), date)) };
    });
    $("week-strip").innerHTML = days.map(({ date, items }, i) => `<button type="button" class="week-day ${i === 0 ? "is-today" : ""}" data-day="${i}" aria-pressed="${scope === "date" && sameDay(date, selectedDate)}" aria-label="${fmtLongDate(date)}: ${items.length} open assignments"><span>${DOW[date.getDay()]}</span><strong>${date.getDate()}</strong><span class="week-count ${items.length ? "has-work" : ""}">${items.length || "–"}</span></button>`).join("");
    $("week-strip").querySelectorAll("[data-day]").forEach(btn => btn.addEventListener("click", () => setScope("date", addDays(today(), Number(btn.dataset.day)))));
    const work = open.filter(inWeek);
    const estimated = work.filter(a => Number(a.estimated_minutes) > 0);
    const minutes = estimated.reduce((sum, a) => sum + Number(a.estimated_minutes), 0);
    $("week-summary").textContent = minutes ? `${fmtMinutes(minutes)} estimated · ${estimated.length} of ${work.length} open assignments` : `${work.length} open assignment${work.length === 1 ? "" : "s"} · No time estimates`;
    const week = ASSIGNMENTS.filter(inWeek);
    const done = week.filter(isDone).length;
    const pct = week.length ? Math.round(done / week.length * 100) : 0;
    $("week-progress").innerHTML = `<div class="between"><span>Completed for these 7 days</span><strong>${done} / ${week.length}</strong></div><div class="progress-track" role="progressbar" aria-label="Assignments completed for the next seven days" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>`;
  }

  function renderFilterControls() {
    $("f-class").innerHTML = '<option value="">Class</option>' + CLASSES.filter(c => !filters.classes.has(c.course_code)).map(c => `<option value="${esc(c.course_code)}">${esc(c.course_code)}</option>`).join("");
    const types = [...new Set(ASSIGNMENTS.map(typeLabel).filter(Boolean))].sort();
    $("f-type").innerHTML = '<option value="">Type</option>' + types.filter(t => !filters.types.has(t)).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    $("active-filters").innerHTML = [
      ...[...filters.classes].map(c => `<button type="button" class="removable-filter" data-rm-class="${esc(c)}" aria-label="Remove ${esc(c)} filter">${esc(c)} ${ICONS.x}</button>`),
      ...[...filters.types].map(t => `<button type="button" class="removable-filter" data-rm-type="${esc(t)}" aria-label="Remove ${esc(t)} filter">${esc(t)} ${ICONS.x}</button>`),
    ].join("");
    $("active-filters").querySelectorAll("[data-rm-class]").forEach(btn => btn.addEventListener("click", () => { filters.classes.delete(btn.dataset.rmClass); refresh(); }));
    $("active-filters").querySelectorAll("[data-rm-type]").forEach(btn => btn.addEventListener("click", () => { filters.types.delete(btn.dataset.rmType); refresh(); }));
  }

  function sorted() {
    const query = $("assignment-search").value.trim().toLowerCase();
    const list = ASSIGNMENTS.filter(a => ($("show-done").checked || !isDone(a)) && inScope(a)
      && (!filters.classes.size || filters.classes.has(a.course_code))
      && (!filters.types.size || filters.types.has(typeLabel(a)))
      && (!query || `${a.title} ${a.course_code} ${typeLabel(a)}`.toLowerCase().includes(query)));
    const mode = $("sort").value;
    return list.sort((a, b) => {
      if (mode === "custom") return ((a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)) || dueDate(a) - dueDate(b);
      if (mode === "class") return a.course_code.localeCompare(b.course_code) || dueDate(a) - dueDate(b);
      if (mode === "type") return typeLabel(a).localeCompare(typeLabel(b)) || dueDate(a) - dueDate(b);
      return dueDate(a) - dueDate(b);
    });
  }

  function renderList() {
    const list = sorted();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, pages - 1);
    const start = page * pageSize;
    const el = $("assignment-list");
    el.innerHTML = list.length ? list.slice(start, start + pageSize).map(a => compactAssignmentRow(a, { handle: true })).join("") : `<div class="empty queue-empty"><span class="empty-icon" aria-hidden="true">${ICONS.list}</span><strong>${ASSIGNMENTS.length ? "No assignments to show" : "Your assignments will appear here"}</strong><p>${ASSIGNMENTS.length ? "Try another date range or adjust your filters." : 'Add a class to start planning your week.'}</p>${ASSIGNMENTS.length ? '<button type="button" class="btn btn-secondary btn-sm" id="reset-queue">Reset filters</button>' : '<a class="btn btn-secondary btn-sm" href="assignments.html">Add a class</a>'}</div>`;
    $("filter-count").textContent = list.length ? `${start + 1}–${Math.min(start + pageSize, list.length)} of ${list.length}` : "0 assignments";
    $("queue-page").textContent = `${page + 1} / ${pages}`;
    $("queue-prev").disabled = page === 0;
    $("queue-next").disabled = page >= pages - 1;
    $("queue-scope").textContent = scopeName();
    $("all-open").setAttribute("aria-pressed", scope === "all");
    $("sort").title = $("sort").value === "custom" ? "Drag rows to reorder this page. Order is saved automatically." : "Sort assignments or drag rows to set a custom order.";
    bindChecks(el, renderAll);
    bindDrag(el);
    $("reset-queue")?.addEventListener("click", resetQueue);
  }

  function resetQueue() {
    filters.classes.clear(); filters.types.clear(); scope = "all"; selectedDate = null;
    $("assignment-search").value = ""; $("show-done").checked = false;
    page = 0; renderAll();
  }
  function bindDrag(el) {
    let dragId = null;
    el.querySelectorAll(".compact-assignment").forEach(row => {
      row.addEventListener("dragstart", e => {
        dragId = Number(row.dataset.id); row.classList.add("dragging");
        e.dataTransfer.setData("text/plain", String(dragId)); e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => { dragId = null; el.querySelectorAll(".dragging, .drag-over").forEach(r => r.classList.remove("dragging", "drag-over")); });
      row.addEventListener("dragover", e => { e.preventDefault(); row.classList.add("drag-over"); });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", async e => {
        e.preventDefault();
        const targetId = Number(row.dataset.id);
        if (dragId === null || dragId === targetId) return;
        // Preserve the order of assignments outside the filtered or paged view.
        const visibleOrder = sorted().map(a => a.assignment_id);
        visibleOrder.splice(visibleOrder.indexOf(dragId), 1);
        visibleOrder.splice(visibleOrder.indexOf(targetId), 0, dragId);
        const visibleIds = new Set(visibleOrder);
        const base = [...ASSIGNMENTS].sort((a, b) => ((a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)) || dueDate(a) - dueDate(b));
        let i = 0;
        const order = base.map(a => visibleIds.has(a.assignment_id) ? visibleOrder[i++] : a.assignment_id);
        const previous = ASSIGNMENTS.map(a => [a.assignment_id, a.sort_order]);
        const previousSort = $("sort").value;
        order.forEach((id, index) => { getAssignment(id).sort_order = index; });
        $("sort").value = "custom"; renderList();
        try { await API.assignments.reorder(order); toast("Order saved", "success"); }
        catch (err) { previous.forEach(([id, sort]) => { getAssignment(id).sort_order = sort; }); $("sort").value = previousSort; renderList(); toast(err.message, "error"); }
      });
    });
  }

  function refresh() { page = 0; renderFilterControls(); renderList(); }
  function renderAll() { renderStats(); renderNext(); renderWeek(); renderFilterControls(); renderList(); }
  $("f-class").addEventListener("change", () => { if ($("f-class").value) { filters.classes.add($("f-class").value); refresh(); } });
  $("f-type").addEventListener("change", () => { if ($("f-type").value) { filters.types.add($("f-type").value); refresh(); } });
  $("assignment-search").addEventListener("input", () => { page = 0; renderList(); });
  $("sort").addEventListener("change", () => { page = 0; renderList(); });
  $("show-done").addEventListener("change", () => { page = 0; renderList(); });
  $("all-open").addEventListener("click", resetQueue);
  $("queue-prev").addEventListener("click", () => { page--; renderList(); });
  $("queue-next").addEventListener("click", () => { page++; renderList(); });
  $("add-assignment").addEventListener("click", () => {
    if (!CLASSES.length) { location.href = "assignments.html"; return; }
    openAssignmentModal({}, renderAll);
  });
  window.addEventListener("resize", () => {
    const size = rowsPerPage();
    if (size !== pageSize) { pageSize = size; page = 0; renderList(); }
  });
  renderAll();
}
