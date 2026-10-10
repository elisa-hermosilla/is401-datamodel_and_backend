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

  function applyFilters(list) {
    return list.filter(a =>
      (filters.classes.size === 0 || filters.classes.has(a.course_code)) &&
      (filters.types.size === 0 || filters.types.has(typeLabel(a))));
  }

  function refresh() { renderFilterControls(); renderList(); }
  function renderAll() { renderStats(); renderNext(); renderStreaks(); renderList(); }

  /* ---------- Sortable list ---------- */
  const sortSel = document.getElementById("sort");
  const showDone = document.getElementById("show-done");
  /* Custom order is persisted in assignment.sort_order; offer it if any row has one */
  if (ASSIGNMENTS.some(a => a.sort_order != null)) sortSel.value = "custom";

  function sorted() {
    let list = applyFilters(showDone.checked ? [...ASSIGNMENTS] : openItems());
    const mode = sortSel.value;
    if (mode === "custom") {
      const big = Number.MAX_SAFE_INTEGER;
      list.sort((a, b) => ((a.sort_order ?? big) - (b.sort_order ?? big)) || dueDate(a) - dueDate(b));
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
    const hasFilters = filters.classes.size || filters.types.size;
    el.innerHTML = list.length
      ? list.map(a => assignmentRow(a, { handle: true })).join("")
      : `<div class="empty">${hasFilters ? "No assignments match these filters." : "Nothing due."}</div>`;
    document.getElementById("filter-count").textContent = `${list.length} assignment${list.length === 1 ? "" : "s"}`;
    bindChecks(el, renderAll, { onFilterClass: addClassFilter, onFilterType: addTypeFilter });
    bindDrag(el);
  }

  function bindDrag(el) {
    let dragId = null;
    el.querySelectorAll(".a-row").forEach(row => {
      row.addEventListener("dragstart", () => { dragId = Number(row.dataset.id); row.classList.add("dragging"); });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); el.querySelectorAll(".drag-over").forEach(r => r.classList.remove("drag-over")); });
      row.addEventListener("dragover", e => { e.preventDefault(); row.classList.add("drag-over"); });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", async e => {
        e.preventDefault();
        const targetId = Number(row.dataset.id);
        if (dragId === null || dragId === targetId) return;
        const order = sorted().map(a => a.assignment_id);
        order.splice(order.indexOf(dragId), 1);
        order.splice(order.indexOf(targetId), 0, dragId);
        order.forEach((id, i) => { getAssignment(id).sort_order = i; });
        sortSel.value = "custom";
        renderList();
        try { await API.assignments.reorder(order); toast("Order saved"); }
        catch (err) { toast(err.message); }
      });
    });
  }

  sortSel.addEventListener("change", renderList);
  showDone.addEventListener("change", renderList);

  renderStats();
  renderNext();
  renderStreaks();
  refresh();
}
