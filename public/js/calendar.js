/* Calendar: month previews and a paged daily agenda share the same filters. */
initApp("calendar").then(main);

function main() {
  const $ = id => document.getElementById(id);
  const pageSize = 4;
  let page = 0;
  let selected = today();
  const dateParam = new URLSearchParams(location.search).get("date");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam || "")) {
    const parsed = new Date(`${dateParam}T12:00:00`);
    if (!Number.isNaN(parsed.getTime()) && toDateInput(parsed) === dateParam) selected = startOfDay(parsed);
  }
  let viewMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  $("prev-month").innerHTML = $("prev-day").innerHTML = ICONS.left;
  $("next-month").innerHTML = $("next-day").innerHTML = ICONS.right;
  $("calendar-class").innerHTML = '<option value="">All classes</option>' + CLASSES.map(c => `<option value="${c.course_id}">${esc(c.course_code)}</option>`).join("");

  function visibleAssignments() {
    const course = $("calendar-class").value;
    return ASSIGNMENTS.filter(a => (!course || String(a.course_id) === course) && ($("calendar-completed").checked || !isDone(a)));
  }
  function assignmentsOn(date) {
    return visibleAssignments().filter(a => sameDay(dueDate(a), date)).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || dueDate(a) - dueDate(b));
  }
  function selectDay(date, focus = false) {
    selected = startOfDay(date); page = 0;
    viewMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderAll();
    if (focus) $("cal-grid").querySelector('[aria-pressed="true"]')?.focus();
  }

  function renderMonth() {
    const label = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
    $("month-label").textContent = label;
    const grid = $("cal-grid");
    grid.setAttribute("aria-label", `${label}. Use arrow keys to choose a day.`);
    const lead = viewMonth.getDay();
    const count = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((lead + count) / 7);
    grid.style.setProperty("--calendar-weeks", weeks);
    let html = DOW.map(d => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join("");
    for (let i = 0; i < weeks * 7; i++) {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i - lead + 1);
      if (date.getMonth() !== viewMonth.getMonth()) {
        html += `<div class="cal-day muted" aria-hidden="true"><span class="n">${date.getDate()}</span></div>`;
        continue;
      }
      const items = assignmentsOn(date);
      const open = items.filter(a => !isDone(a));
      const first = items[0];
      const isToday = sameDay(date, today());
      const isSelected = sameDay(date, selected);
      const aria = `${fmtLongDate(date)}${isToday ? ", today" : ""}. ${open.length} open${items.length > open.length ? `, ${items.length - open.length} completed` : ""} assignment${items.length === 1 ? "" : "s"}${first ? `. ${first.title}${items.length > 1 ? ` and ${items.length - 1} more` : ""}` : ""}`;
      html += `<button type="button" class="cal-day ${items.length ? "has-assignments" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-date="${toDateInput(date)}" aria-label="${esc(aria)}" aria-pressed="${isSelected}" ${isToday ? 'aria-current="date"' : ""} tabindex="${isSelected ? "0" : "-1"}">
        <span class="cal-date-line"><span class="n">${date.getDate()}</span>${open.length ? `<span class="cal-count">${open.length}<span class="sr-only"> open</span></span>` : ""}</span>
        ${first ? `<span class="cal-preview ${isDone(first) ? "is-complete" : ""}" style="--course-color:${getClassById(first.course_id).color_hex}" title="${esc(first.course_code)} · ${esc(first.title)}">${esc(first.title)}</span>${items.length > 1 ? `<span class="cal-more">+${items.length - 1} more</span>` : ""}` : ""}
      </button>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll("[data-date]").forEach(btn => btn.addEventListener("click", () => selectDay(new Date(`${btn.dataset.date}T12:00:00`), true)));
    const monthItems = visibleAssignments().filter(a => dueDate(a).getMonth() === viewMonth.getMonth() && dueDate(a).getFullYear() === viewMonth.getFullYear());
    const open = monthItems.filter(a => !isDone(a));
    const busy = new Set(open.map(a => toDateInput(dueDate(a)))).size;
    $("month-summary").textContent = `${open.length} open · ${busy} day${busy === 1 ? "" : "s"} with deadlines${$("calendar-completed").checked ? ` · ${monthItems.length - open.length} completed` : ""}`;
  }

  function renderDay() {
    $("day-label").textContent = fmtDayLabel(selected);
    $("day-sub").textContent = `${MONTHS[selected.getMonth()]} ${selected.getDate()}, ${selected.getFullYear()}`;
    const items = assignmentsOn(selected);
    const open = items.filter(a => !isDone(a));
    const estimated = open.filter(a => Number(a.estimated_minutes) > 0);
    const minutes = estimated.reduce((sum, a) => sum + Number(a.estimated_minutes), 0);
    $("day-summary").innerHTML = `<strong>${open.length} open</strong><span>${minutes ? `${fmtMinutes(minutes)} estimated${estimated.length < open.length ? ` (${estimated.length}/${open.length})` : ""}` : items.length ? `${items.length - open.length} completed` : "No deadlines"}</span>`;
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    page = Math.min(page, pages - 1);
    const start = page * pageSize;
    const el = $("day-list");
    el.innerHTML = items.length ? items.slice(start, start + pageSize).map(a => compactAssignmentRow(a, { agenda: true })).join("") : `<div class="empty agenda-empty"><span class="empty-icon" aria-hidden="true">${ICONS.calCheck}</span><strong>${CLASSES.length ? "Nothing due" : "No classes yet"}</strong><p>${CLASSES.length ? "A little room in your schedule." : "Add a class to see your deadlines."}</p>${CLASSES.length ? '<button type="button" class="text-button" id="add-on-day">Add an assignment</button>' : '<a class="subtle-link" href="assignments.html">Add a class ↗</a>'}</div>`;
    bindChecks(el, renderAll);
    $("add-on-day")?.addEventListener("click", addAssignment);
    $("day-pagination").hidden = items.length <= pageSize;
    $("day-page").textContent = `${start + 1}–${Math.min(start + pageSize, items.length)} of ${items.length}`;
    $("day-prev-page").disabled = page === 0;
    $("day-next-page").disabled = page >= pages - 1;
    const next = visibleAssignments().filter(a => !isDone(a) && startOfDay(dueDate(a)) > selected).sort((a, b) => dueDate(a) - dueDate(b))[0];
    $("agenda-next").innerHTML = next ? `<span class="eyebrow">Next day with deadlines</span><button type="button" class="agenda-jump" id="next-deadline"><span><strong>${fmtDayLabel(dueDate(next))}</strong><small>${assignmentsOn(dueDate(next)).filter(a => !isDone(a)).length} open · ${esc(next.course_code)}</small></span>${ICONS.right}</button>` : `<p class="agenda-end">No later deadlines${$("calendar-class").value ? " for this class" : ""}.</p>`;
    $("next-deadline")?.addEventListener("click", () => selectDay(dueDate(next)));
  }

  function shiftMonth(n) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + n, 1);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    selectDay(new Date(next.getFullYear(), next.getMonth(), Math.min(selected.getDate(), last)));
  }
  function addAssignment() {
    if (!CLASSES.length) { location.href = "assignments.html"; return; }
    openAssignmentModal({ due_date: selected, course_id: Number($("calendar-class").value) || undefined }, renderAll);
  }
  function renderAll() { renderMonth(); renderDay(); }
  $("prev-month").addEventListener("click", () => shiftMonth(-1));
  $("next-month").addEventListener("click", () => shiftMonth(1));
  $("prev-day").addEventListener("click", () => selectDay(addDays(selected, -1)));
  $("next-day").addEventListener("click", () => selectDay(addDays(selected, 1)));
  $("jump-today").addEventListener("click", () => selectDay(today()));
  $("calendar-class").addEventListener("change", () => { page = 0; renderAll(); });
  $("calendar-completed").addEventListener("change", () => { page = 0; renderAll(); });
  $("day-prev-page").addEventListener("click", () => { page--; renderDay(); });
  $("day-next-page").addEventListener("click", () => { page++; renderDay(); });
  $("add-assignment").addEventListener("click", addAssignment);
  $("cal-grid").addEventListener("keydown", e => {
    if (!e.target.matches("[data-date]")) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); selectDay(addDays(selected, step), true); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); selectDay(addDays(selected, e.key === "Home" ? -selected.getDay() : 6 - selected.getDay()), true); }
  });
  renderAll();
}
