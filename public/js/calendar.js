/* Calendar. Classes (colors, legend) come from the API; assignments are still sample data. */

initApp("calendar").then(main);

function main() {
  let viewMonth = new Date(today().getFullYear(), today().getMonth(), 1);
  let selected = today();

  ["prev-month", "prev-day"].forEach(id => document.getElementById(id).innerHTML = ICONS.left);
  ["next-month", "next-day"].forEach(id => document.getElementById(id).innerHTML = ICONS.right);

  function assignmentsOn(date) {
    return visibleAssignments().filter(a => sameDay(dueDate(a), date)).sort((a, b) => dueDate(a) - dueDate(b));
  }

  function renderMonth() {
    document.getElementById("month-label").textContent = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
    const grid = document.getElementById("cal-grid");
    let html = DOW.map(d => `<div class="cal-dow">${d}</div>`).join("");

    const first = new Date(viewMonth);
    const lead = first.getDay();
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const prevDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0).getDate();

    for (let i = lead - 1; i >= 0; i--) html += `<div class="cal-day muted"><div class="n">${prevDays - i}</div></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
      const items = assignmentsOn(date);
      const codes = [...new Set(items.map(a => a.course_code))];
      const dots = codes.slice(0, 4).map(code => `<span style="background:${getClass(code).color_hex}"></span>`).join("")
        + (codes.length > 4 ? `<span class="more">+${codes.length - 4}</span>` : "");
      html += `
        <div class="cal-day ${sameDay(date, today()) ? "today" : ""} ${sameDay(date, selected) ? "selected" : ""}" data-date="${date.toISOString()}">
          <div class="n">${d}</div>
          <div class="dots">${dots}</div>
        </div>`;
    }
    const total = lead + daysInMonth;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 1; i <= trail; i++) html += `<div class="cal-day muted"><div class="n">${i}</div></div>`;

    grid.innerHTML = html;
    grid.querySelectorAll(".cal-day:not(.muted)").forEach(el => {
      el.addEventListener("click", () => { selected = new Date(el.dataset.date); renderMonth(); renderDay(); });
    });

    document.getElementById("legend").innerHTML = CLASSES.length
      ? CLASSES.map(c => `<span><i style="background:${c.color_hex}"></i>${esc(c.course_code)}</span>`).join("")
      : `<span>No classes yet</span>`;
  }

  function renderDay() {
    document.getElementById("day-label").textContent = fmtDayLabel(selected);
    document.getElementById("day-sub").textContent = fmtLongDate(selected);
    const items = assignmentsOn(selected);
    const el = document.getElementById("day-list");
    el.innerHTML = items.length
      ? items.map(a => assignmentRow(a)).join("")
      : `<div class="empty">Nothing due ${fmtDayLabel(selected).toLowerCase()}.</div>`;
    bindChecks(el, () => { renderMonth(); renderDay(); });
  }

  function shiftDay(n) {
    selected = addDays(selected, n);
    if (selected.getMonth() !== viewMonth.getMonth() || selected.getFullYear() !== viewMonth.getFullYear()) {
      viewMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    renderMonth(); renderDay();
  }

  document.getElementById("prev-month").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderMonth(); });
  document.getElementById("next-month").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderMonth(); });
  document.getElementById("prev-day").addEventListener("click", () => shiftDay(-1));
  document.getElementById("next-day").addEventListener("click", () => shiftDay(1));
  document.getElementById("jump-today").addEventListener("click", () => {
    selected = today(); viewMonth = new Date(today().getFullYear(), today().getMonth(), 1); renderMonth(); renderDay();
  });
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "ArrowLeft") shiftDay(-1);
    if (e.key === "ArrowRight") shiftDay(1);
  });

  renderMonth();
  renderDay();
}
