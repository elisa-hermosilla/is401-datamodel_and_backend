/* Dashboard: deadlines, a scrolling assignment queue, a seven-day workload,
   and the two streaks. */
initApp("dashboard").then(main);

function main() {
  const $ = id => document.getElementById(id);
  let scope = "all";
  let selectedDate = null;
  const filters = { classes: new Set(), types: new Set() };
  const params = new URLSearchParams(location.search);
  if (params.get("class") && getClass(params.get("class"))) filters.classes.add(params.get("class"));
  if (params.get("type")) filters.types.add(params.get("type"));
  const h = new Date().getHours();
  $("greeting").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${USER.first_name}`;
  $("today-line").textContent = fmtLongDate(new Date());

  const sortSel = $("sort");
  const showDone = $("show-done");
  const resetBtn = $("reset-order");
  const searchEl = $("assignment-search");

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
  const scopeName = () => ({ all: showDone.checked ? "All assignments" : "All open assignments", past: "Past due", today: "Still due today", tomorrow: "Due tomorrow", week: "Due in the next 7 days", date: selectedDate ? `Due ${fmtDayLabel(selectedDate).toLowerCase()}` : "" })[scope];
  function setScope(value, date = null) {
    scope = value; selectedDate = date;
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
      <h2><button class="focus-title" type="button" data-view="${next.assignment_id}">${esc(next.title)}</button></h2>
      <p class="focus-meta">${esc(next.course_code)}${next.estimated_minutes ? ` · ${fmtMinutes(next.estimated_minutes)} estimated` : ""}</p>
      <p class="focus-due">${fmtDayLabel(due)} · ${next.due_time_known === false ? "All day" : fmtTime(due)}</p>
      <div class="focus-actions"><button type="button" class="btn btn-primary btn-sm" data-check="${next.assignment_id}">${ICONS.check} Complete</button><button type="button" class="btn btn-secondary btn-sm" data-view="${next.assignment_id}">Details</button></div>`;
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

  /* Two small cards under the week card. Streaks come from the server (which
     also records today's check-in before answering), so they load after the
     rest and show dashes until then or if the request fails. */
  function renderStreaks(s) {
    const card = (icon, value, label, best, off) => `
      <div class="card streak-mini ${off ? "off" : ""}">
        <span class="streak-icon" aria-hidden="true">${icon}</span>
        <div>
          <div class="num">${value == null ? "–" : value}<small>${value === 1 ? "day" : "days"}</small></div>
          <div class="label">${label}</div>
          <div class="best">${best == null ? "" : `Best: ${best}`}</div>
        </div>
      </div>`;
    const ci = s && s.check_in, nl = s && s.no_past_due;
    $("streak-row").innerHTML =
      card(ICONS.flame, ci ? ci.current : null, "Check-in streak", ci ? ci.best : null, !ci || !ci.current) +
      card(ICONS.calCheck, nl ? nl.current : null, "No late turn-ins", nl ? nl.best : null, !nl || !nl.current);
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

  /* ---------- Search ---------- */
  /* Every word typed must appear somewhere in the row's name, class code or
     name, submission type, or assignment type (case- and accent-insensitive).
     Class codes are also matched without their spaces, so "is401" finds
     "IS 401". Typing is debounced; Esc clears; "/" focuses the box. */
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
  function updateSearch() { searchTokens = tokensOf(searchEl.value); renderList(); }
  let searchTimer = null;
  searchEl.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(updateSearch, 120); });
  searchEl.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (searchEl.value) { searchEl.value = ""; updateSearch(); } else searchEl.blur();
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  });
  /* ?q=... in the URL pre-fills the search (the first render below applies it) */
  if (params.get("q")) { searchEl.value = params.get("q"); searchTokens = tokensOf(params.get("q")); }

  /* ---------- Custom order ---------- */
  /* Rows the student has dragged carry a sort_order; rows that arrived since
     (a newly synced assignment, a new manual one) have none. Instead of
     dumping those at the bottom, slot each one where it disturbs due-date
     order the least: the position with the most rows above it due at or
     before it, plus rows below it due at or after it. On a list that's
     already in due order that is simply "before the first row due at or after
     it"; a single row the student pinned out of order can't pull new rows
     along with it. Ties go to the earlier spot, so a new row sits ahead of
     rows due at the same time. The next drag saves these positions for real. */
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

  /* Does the student's custom order (over every assignment) differ from due-date order? */
  function customDiffersFromDue() {
    const byDue = [...ASSIGNMENTS].sort((a, b) => dueDate(a) - dueDate(b) || a.assignment_id - b.assignment_id);
    const custom = customOrder(ASSIGNMENTS);
    return custom.some((a, i) => a.assignment_id !== byDue[i].assignment_id);
  }

  function sorted() {
    const list = ASSIGNMENTS.filter(a => (showDone.checked || !isDone(a)) && inScope(a)
      && (!filters.classes.size || filters.classes.has(a.course_code))
      && (!filters.types.size || filters.types.has(typeLabel(a)))
      && matchesSearch(a));
    const mode = sortSel.value;
    if (mode === "custom") return customOrder(list);
    return list.sort((a, b) => {
      if (mode === "class") return a.course_code.localeCompare(b.course_code) || dueDate(a) - dueDate(b);
      if (mode === "type") return typeLabel(a).localeCompare(typeLabel(b)) || dueDate(a) - dueDate(b);
      return dueDate(a) - dueDate(b);
    });
  }

  function renderList() {
    const list = sorted();
    const el = $("assignment-list");
    /* Drag handles and the Reset button only make sense in Custom mode, and
       Reset only when the custom order actually differs from due-date order.
       style.display, not the hidden attribute: the .btn display rule would
       override `hidden`. */
    const custom = sortSel.value === "custom";
    const showReset = custom && customDiffersFromDue();
    resetBtn.style.display = showReset ? "" : "none";
    if (!showReset) disarmReset();
    const hasFilters = filters.classes.size || filters.types.size || scope !== "all";
    el.innerHTML = list.length
      ? list.map(a => compactAssignmentRow(a, { handle: custom, gutter: true, highlight: searchTokens })).join("")
      : `<div class="empty queue-empty"><span class="empty-icon" aria-hidden="true">${ICONS.list}</span><strong>${ASSIGNMENTS.length ? "No assignments to show" : "Your assignments will appear here"}</strong><p>${searchTokens.length ? `Nothing matches “${esc(searchEl.value.trim())}”${hasFilters ? " with these filters" : ""}.` : ASSIGNMENTS.length ? "Try another date range or adjust your filters." : "Add a class to start planning your week."}</p>${ASSIGNMENTS.length ? '<button type="button" class="btn btn-secondary btn-sm" id="reset-queue">Reset filters</button>' : '<a class="btn btn-secondary btn-sm" href="assignments.html">Add a class</a>'}</div>`;
    $("filter-count").textContent = `${list.length} assignment${list.length === 1 ? "" : "s"}`;
    $("queue-scope").textContent = scopeName();
    $("all-open").setAttribute("aria-pressed", scope === "all");
    sortSel.title = custom ? "Drag rows to reorder. Your order is saved automatically." : "Choose Custom order to drag rows into your own order.";
    bindChecks(el, renderAll);
    if (custom) bindDrag(el);
    $("reset-queue")?.addEventListener("click", resetQueue);
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
      toast("Custom order cleared", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      resetBtn.disabled = false;
    }
  });

  function resetQueue() {
    filters.classes.clear(); filters.types.clear(); scope = "all"; selectedDate = null;
    searchEl.value = ""; searchTokens = []; showDone.checked = false;
    renderAll();
  }

  /* While a row is being dragged near the top or bottom of the list, scroll
     the list in that direction (the page instead, when the list has no
     scrollbar of its own). The speed starts slow and ramps up the longer the
     pointer stays in the edge zone, and is faster the closer it is to the
     edge. HTML5 drag events keep firing while the pointer is held still, so a
     frame loop driven by the last known pointer Y is enough. */
  const autoScroll = (() => {
    const ZONE = 70, MIN = 2, MAX = 24, ACCEL = 0.012; // px/frame, and px/frame gained per ms in the zone
    let y = null, raf = null, enteredAt = null, box = null;
    const onDragOver = e => { y = e.clientY; };
    function frame() {
      if (y != null) {
        const own = box && box.scrollHeight > box.clientHeight + 1;
        const r = own ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const fromTop = y - r.top, fromBottom = r.bottom - y;
        let dir = 0, depth = 0;
        if (fromTop < ZONE) { dir = -1; depth = 1 - Math.max(0, fromTop) / ZONE; }
        else if (fromBottom < ZONE) { dir = 1; depth = 1 - Math.max(0, fromBottom) / ZONE; }
        if (dir) {
          if (enteredAt == null) enteredAt = performance.now();
          const ramp = Math.min(MAX, MIN + (performance.now() - enteredAt) * ACCEL);
          const v = (0.3 + 0.7 * depth) * ramp;
          if (own) {
            box.scrollTop = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + dir * v));
          } else {
            const maxY = document.documentElement.scrollHeight - window.innerHeight;
            const next = Math.max(0, Math.min(maxY, window.scrollY + dir * v));
            if (next !== window.scrollY) window.scrollTo(0, next);
          }
        } else {
          enteredAt = null;
        }
      }
      raf = requestAnimationFrame(frame);
    }
    return {
      start(el) { box = el; y = null; enteredAt = null; document.addEventListener("dragover", onDragOver); if (!raf) raf = requestAnimationFrame(frame); },
      stop() { document.removeEventListener("dragover", onDragOver); cancelAnimationFrame(raf); raf = null; y = null; enteredAt = null; box = null; },
    };
  })();

  /* While dragging, a line shows the gap the row will land in: above the row
     under the pointer when the pointer is in its top half, below it otherwise.
     The drop uses the same rule. */
  function bindDrag(el) {
    let dragId = null;
    const clearMarkers = () => el.querySelectorAll(".drop-before, .drop-after").forEach(r => r.classList.remove("drop-before", "drop-after"));
    const dropAfter = (row, e) => { const r = row.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    el.querySelectorAll(".compact-assignment").forEach(row => {
      row.addEventListener("dragstart", e => {
        dragId = Number(row.dataset.id); row.classList.add("dragging"); autoScroll.start(el);
        e.dataTransfer.setData("text/plain", String(dragId)); e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); clearMarkers(); autoScroll.stop(); });
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
           filter, the scope, or the completed toggle keep their places
           relative to the visible rows instead of being renumbered over. */
        const visibleSet = new Set(visible);
        let v = 0;
        const order = customOrder(ASSIGNMENTS).map(a => (visibleSet.has(a.assignment_id) ? visible[v++] : a.assignment_id));
        const previous = ASSIGNMENTS.map(a => [a.assignment_id, a.sort_order]);
        order.forEach((id, i) => { getAssignment(id).sort_order = i + 1; });
        renderList();
        try { await API.assignments.reorder(order); toast("Order saved", "success"); }
        catch (err) { previous.forEach(([id, sort]) => { getAssignment(id).sort_order = sort; }); renderList(); toast(err.message, "error"); }
      });
    });
  }

  function refresh() { renderFilterControls(); renderList(); }
  function renderAll() { renderStats(); renderNext(); renderWeek(); renderFilterControls(); renderList(); }
  $("f-class").addEventListener("change", () => { if ($("f-class").value) { filters.classes.add($("f-class").value); refresh(); } });
  $("f-type").addEventListener("change", () => { if ($("f-type").value) { filters.types.add($("f-type").value); refresh(); } });
  sortSel.addEventListener("change", () => { rememberSort(); renderList(); });
  showDone.addEventListener("change", renderList);
  $("all-open").addEventListener("click", resetQueue);
  $("add-assignment").addEventListener("click", () => {
    if (!CLASSES.length) { location.href = "assignments.html"; return; }
    openAssignmentModal({}, renderAll);
  });
  renderAll();
  renderStreaks(null);
  API.streaks().then(renderStreaks).catch(() => renderStreaks(null));

  /* Fit to the window: the rail is stretched to the room left under the stat
     cards (its cards share the extra height), and the queue card takes the
     rail's height so the two columns end on the same line; the list scrolls
     inside. When the rail needs more than the window, the page scrolls. On
     one-column layouts everything keeps its natural height. */
  const layout = document.querySelector(".dashboard-layout");
  const rail = document.querySelector(".dashboard-rail");
  const queue = document.querySelector(".queue-panel");
  const twoColumns = window.matchMedia("(min-width: 761px)");
  const fitRail = () => {
    if (!twoColumns.matches) { rail.style.minHeight = ""; return; }
    const top = layout.getBoundingClientRect().top + window.scrollY;
    const bottomPad = parseFloat(getComputedStyle(document.querySelector("main.main")).paddingBottom) || 0;
    rail.style.minHeight = `${Math.max(0, window.innerHeight - top - bottomPad)}px`;
  };
  const fitQueue = () => { queue.style.height = twoColumns.matches ? `${rail.offsetHeight}px` : ""; };
  new ResizeObserver(fitQueue).observe(rail);
  window.addEventListener("resize", fitRail);
  twoColumns.addEventListener("change", () => { fitRail(); fitQueue(); });
  fitRail();
  fitQueue();

  /* Everything is rendered: show the page, sections fading in top to bottom */
  const mainEl = document.querySelector("main.main");
  mainEl.classList.remove("is-loading");
  mainEl.classList.add("reveal");
}
