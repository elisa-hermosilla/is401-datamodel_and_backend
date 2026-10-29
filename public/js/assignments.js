/* Classes page. Classes and their assignments are real (GET/POST/PUT/DELETE
   /api/courses and /api/assignments). */

initApp("assignments").then(main);

function main() {
  document.getElementById("add-class-btn").innerHTML = `${ICONS.plus} Add class`;
  const showDone = document.getElementById("show-done");

  /* ---------- Render class cards ---------- */
  function render() {
    const grid = document.getElementById("class-grid");
    if (CLASSES.length === 0) {
      grid.innerHTML = `<div class="empty">No classes yet. Add a class to get started.</div>`;
      return;
    }
    grid.innerHTML = CLASSES.map(c => {
      const all = ASSIGNMENTS.filter(a => a.course_id === c.course_id);
      const items = all
        .filter(a => showDone.checked || !isDone(a))
        .sort((a, b) => dueDate(a) - dueDate(b));
      const openCount = all.filter(a => !isDone(a)).length;
      return `
        <div class="card class-card" id="class-${c.course_id}">
          <div class="between">
            <div class="class-title">
              <div class="swatch" style="background:${c.color_hex}"></div>
              <div>
                <div class="code">${esc(c.course_code)} ${c.course_name ? `<span style="font-weight:500;color:var(--muted);font-size:14px">· ${esc(c.course_name)}</span>` : ""}</div>
                <div class="cname">${sourceTag(c)} &nbsp;${openCount} open assignment${openCount === 1 ? "" : "s"}${c.is_archived ? " &nbsp;<span class=\"tag type\">Archived</span>" : ""}</div>
              </div>
            </div>
            <div class="class-actions">
              <button class="btn btn-secondary btn-sm" data-add="${c.course_id}">${ICONS.plus} Add assignment</button>
              <button class="btn btn-ghost btn-sm" data-edit="${c.course_id}" title="Edit class">${ICONS.pencil} Edit</button>
              <button class="btn btn-ghost btn-sm" data-delete="${c.course_id}" title="Delete class" style="color:var(--danger)">${ICONS.trash} Delete</button>
            </div>
          </div>
          <div class="class-body a-list">
            ${items.length ? items.map(a => assignmentRow(a)).join("") : `<div class="empty">${all.length ? "No open assignments." : "No assignments yet."}</div>`}
          </div>
        </div>`;
    }).join("");

    bindChecks(grid, render);
    grid.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => openAssignmentModal({ course_id: Number(b.dataset.add) }, render)));
    grid.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openClassModal(Number(b.dataset.edit))));
    grid.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => openDeleteConfirm(Number(b.dataset.delete))));
  }
  showDone.addEventListener("change", render);

  /* ---------- Add / edit class ---------- */
  const classForm = document.getElementById("class-form");
  const classError = document.getElementById("class-error");
  const classSubmit = document.getElementById("class-submit");

  /* Mark a field invalid with a message, or clear it. The field wrapper is found from
     the input, or from the error span when the input is hidden (e.g. source chips). */
  function setFieldError(inputId, msg) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(`${inputId}-error`);
    const field = (input && input.closest(".field")) || (err && err.closest(".field"));
    if (!field) return;
    if (msg) { field.classList.add("invalid"); if (err) err.textContent = msg; }
    else { field.classList.remove("invalid"); if (err) err.textContent = ""; }
  }
  function showFormError(el, msg) { el.textContent = msg; el.classList.add("show"); }
  function clearFormError(el) { el.textContent = ""; el.classList.remove("show"); }

  /* --- Source chips. The chosen source decides which extra section shows. --- */
  const SOURCE_DOT = { "Canvas": "#f87171", "Learning Suite": "#60a5fa", "Manual": "#9ca3af" };
  const sourceSection = name => ({ "Canvas": "c-section-canvas", "Learning Suite": "c-section-ls", "Manual": "c-section-manual" })[name];

  function currentSourceName() {
    const id = Number(document.getElementById("c-source").value);
    return (LMS_SOURCES.find(s => s.lms_source_id === id) || {}).name;
  }

  function selectSource(lmsSourceId) {
    document.getElementById("c-source").value = lmsSourceId;
    const name = currentSourceName();
    document.querySelectorAll("#c-source-chips .chip").forEach(ch => ch.classList.toggle("active", Number(ch.dataset.source) === lmsSourceId));
    document.querySelectorAll(".source-section").forEach(sec => sec.classList.toggle("show", sec.id === sourceSection(name)));
    setFieldError("c-source", "");
  }

  function renderSourceChips(selectedId) {
    const el = document.getElementById("c-source-chips");
    el.innerHTML = LMS_SOURCES.map(s =>
      `<button type="button" class="chip" data-source="${s.lms_source_id}"><span class="dot" style="background:${SOURCE_DOT[s.name] || "#9ca3af"}"></span>${esc(s.name)}</button>`).join("");
    el.querySelectorAll(".chip").forEach(ch => ch.addEventListener("click", () => selectSource(Number(ch.dataset.source))));
    selectSource(selectedId);
  }

  /* --- Canvas class picker: the student's live Canvas course list (GET /api/canvas/courses) --- */
  let canvasCourses = null; // fetched once per modal open
  async function renderCanvasOptions(cls) {
    const sel = document.getElementById("c-canvas-course");
    const note = document.getElementById("c-canvas-note");
    const current = cls && cls.external_course_id;
    document.getElementById("c-external-id").value = current || "";

    if (!CANVAS.connected) {
      sel.style.display = "none";
      note.innerHTML = `Canvas isn't connected. <a href="settings.html">Connect it in Settings</a> to pick from your classes, or enter the code and name below.`;
      return;
    }
    sel.style.display = "";
    sel.disabled = true;
    sel.innerHTML = `<option value="">Loading your Canvas classes</option>`;
    note.textContent = "From your Canvas account. Picking one fills in the code and name below; assignments sync from it.";
    try {
      if (!canvasCourses) canvasCourses = await API.canvas.courses();
      const placeholder = cls ? `Keep ${esc(cls.course_code)}` : "Choose a Canvas class";
      sel.innerHTML = `<option value="">${placeholder}</option>` +
        canvasCourses.map(c =>
          `<option value="${esc(c.external_course_id)}" ${c.external_course_id === current ? "selected" : ""}>${esc(c.course_code)} · ${esc(c.course_name)}${c.term ? ` (${esc(c.term)})` : ""}${c.already_added && c.external_course_id !== current ? " · already added" : ""}</option>`).join("");
    } catch (err) {
      sel.innerHTML = `<option value="">Could not load Canvas classes</option>`;
      note.textContent = err.message;
    } finally {
      sel.disabled = false;
    }
  }
  document.getElementById("c-canvas-course").addEventListener("change", e => {
    const pick = (canvasCourses || []).find(c => c.external_course_id === e.target.value);
    document.getElementById("c-external-id").value = pick ? pick.external_course_id : "";
    if (pick) {
      document.getElementById("c-code").value = pick.course_code;
      document.getElementById("c-name").value = pick.course_name;
      setFieldError("c-code", "");
      setFieldError("c-canvas-course", "");
    }
  });

  /* --- Learning Suite "Check link": fetch + parse the feed and report what's in it --- */
  const ICS_DEFAULT_NOTE = "In Learning Suite open the course, go to Schedule, and copy the iCal link. Syncing pulls every dated item on the schedule.";
  document.getElementById("c-ics-check").addEventListener("click", async e => {
    const btn = e.currentTarget;
    const note = document.getElementById("c-ics-note");
    const url = document.getElementById("c-ics").value.trim();
    setFieldError("c-ics", "");
    if (!url) return setFieldError("c-ics", "Paste the iCalendar link first.");
    btn.disabled = true; btn.textContent = "Checking";
    note.textContent = "Fetching the calendar";
    try {
      const p = await API.learningSuite.preview(url);
      const next = p.sample[0] ? ` Next: ${p.sample[0].title} (${fmtDayLabel(new Date(p.sample[0].due_at))}).` : "";
      note.textContent = p.total
        ? `Link works: ${p.total} item${p.total === 1 ? "" : "s"}, ${p.upcoming} upcoming.${next}`
        : "Link works, but the calendar is empty. Check that the professor added items to the Schedule.";
    } catch (err) {
      note.textContent = ICS_DEFAULT_NOTE;
      setFieldError("c-ics", err.message);
    } finally {
      btn.disabled = false; btn.textContent = "Check link";
    }
  });

  /* --- Color swatches --- */
  function selectColor(hex) {
    document.getElementById("c-color").value = hex;
    document.querySelectorAll("#c-swatches .color-swatch").forEach(b => b.classList.toggle("active", b.dataset.hex.toLowerCase() === hex.toLowerCase()));
  }
  function renderSwatches(selectedHex) {
    const colors = [...CLASS_COLORS];
    /* An existing class may have a color outside the palette; keep it available so editing never changes it silently. */
    if (selectedHex && !colors.some(c => c.hex.toLowerCase() === selectedHex.toLowerCase())) colors.push({ hex: selectedHex, name: "Current color" });
    const el = document.getElementById("c-swatches");
    el.innerHTML = colors.map(c =>
      `<button type="button" class="color-swatch" data-hex="${c.hex}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}">${ICONS.check}</button>`).join("");
    el.querySelectorAll(".color-swatch").forEach(b => b.addEventListener("click", () => selectColor(b.dataset.hex)));
    selectColor(selectedHex);
  }

  /* ---------- Two-step modal plumbing ----------
     Step 1 is the class form. For Canvas and Learning Suite classes the submit
     button says Next and leads to step 2, the category mapping. Manual classes
     have no categories to map, so their button saves and closes. */
  const modalBox = document.getElementById("class-modal-box");
  const step2 = document.getElementById("class-step-2");
  let wizard = { course: null };            // the saved class we're mapping in step 2

  function stepLabel(step) {
    const base = document.getElementById("c-id").value ? "Edit class" : "Add a class";
    const syncSource = currentSourceName() !== "Manual";
    document.getElementById("class-modal-title").innerHTML = `${base}${syncSource ? `<span class="step-tag">Step ${step} of 2</span>` : ""}`;
  }
  function showStep(step) {
    classForm.style.display = step === 1 ? "" : "none";
    step2.style.display = step === 2 ? "" : "none";
    modalBox.classList.toggle("modal-wide", step === 2);
    stepLabel(step);
  }
  /* The submit button's label depends on the source chip */
  function refreshSubmitLabel() {
    const editing = !!document.getElementById("c-id").value;
    classSubmit.textContent = currentSourceName() === "Manual" ? (editing ? "Save" : "Add class") : "Next";
    stepLabel(1);
  }

  /* courseId undefined = add; a number = edit that class */
  function openClassModal(courseId) {
    const cls = courseId ? CLASSES.find(c => c.course_id === courseId) : null;
    classForm.reset();
    clearFormError(classError);
    ["c-code", "c-name", "c-source", "c-ics", "c-canvas-course"].forEach(id => setFieldError(id, ""));
    wizard = { course: cls || null };

    document.getElementById("c-id").value = cls ? cls.course_id : "";
    document.getElementById("c-code").value = cls ? cls.course_code : "";
    document.getElementById("c-name").value = cls ? (cls.course_name || "") : "";
    document.getElementById("c-ics").value = cls ? (cls.ics_feed_url || "") : "";
    document.getElementById("c-ics-note").textContent = ICS_DEFAULT_NOTE;

    const manual = LMS_SOURCES.find(s => s.name === "Manual");
    renderSourceChips(cls ? cls.lms_source_id : (manual ? manual.lms_source_id : LMS_SOURCES[0]?.lms_source_id));
    canvasCourses = null;
    renderCanvasOptions(cls);
    renderSwatches(cls ? cls.color_hex : nextClassColor());

    showStep(1);
    refreshSubmitLabel();
    openModal("class-modal");
    setTimeout(() => document.getElementById("c-code").focus(), 50);
  }
  document.getElementById("add-class-btn").addEventListener("click", () => openClassModal());
  document.getElementById("c-source-chips").addEventListener("click", refreshSubmitLabel);

  classForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearFormError(classError);

    const id = document.getElementById("c-id").value;
    const source = currentSourceName();
    const fields = {
      course_code: document.getElementById("c-code").value.trim(),
      course_name: document.getElementById("c-name").value.trim() || null,
      lms_source_id: Number(document.getElementById("c-source").value),
      color_hex: document.getElementById("c-color").value,
      ics_feed_url: source === "Learning Suite" ? (document.getElementById("c-ics").value.trim() || null) : null,
      external_course_id: source === "Canvas" ? (document.getElementById("c-external-id").value || null) : null,
    };

    /* Inline validation (the server checks the same rules) */
    let ok = true;
    if (!fields.lms_source_id) { setFieldError("c-source", "Choose a source."); ok = false; }
    else setFieldError("c-source", "");
    if (source === "Canvas" && !id && CANVAS.connected && !fields.external_course_id) { setFieldError("c-canvas-course", "Choose a Canvas class."); ok = false; }
    else setFieldError("c-canvas-course", "");
    if (source === "Learning Suite" && fields.ics_feed_url && !/^(https?|webcal):\/\/\S+$/i.test(fields.ics_feed_url)) { setFieldError("c-ics", "Paste a full link starting with https://."); ok = false; }
    else setFieldError("c-ics", "");
    if (!fields.course_code) { setFieldError("c-code", "Course code is required."); ok = false; }
    else if (fields.course_code.length > 30) { setFieldError("c-code", "30 characters or fewer."); ok = false; }
    else setFieldError("c-code", "");
    if (fields.course_name && fields.course_name.length > 150) { setFieldError("c-name", "150 characters or fewer."); ok = false; }
    else setFieldError("c-name", "");
    if (!ok) return;

    classSubmit.disabled = true;
    try {
      let saved;
      if (id) {
        saved = await API.courses.update(Number(id), fields);
        setClasses(CLASSES.map(c => (c.course_id === saved.course_id ? saved : c)));
        /* Assignments carry a copy of the course code/color; refresh them */
        ASSIGNMENTS.forEach(a => { if (a.course_id === saved.course_id) { a.course_code = saved.course_code; a.color_hex = saved.color_hex; } });
      } else {
        saved = await API.courses.create(fields);
        setClasses([...CLASSES, saved]);
      }
      /* Keep the same order the API uses: non-archived first, then by code */
      CLASSES.sort((a, b) => (a.is_archived - b.is_archived) || a.course_code.localeCompare(b.course_code) || a.course_id - b.course_id);
      document.getElementById("c-id").value = saved.course_id;
      render();

      if (source === "Manual") {
        closeModal("class-modal");
        toast(id ? `${saved.course_code} saved` : `${saved.course_code} added`);
        const card = document.getElementById(`class-${saved.course_id}`);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        wizard.course = CLASSES.find(c => c.course_id === saved.course_id);
        await openMappingStep();
      }
    } catch (err) {
      showFormError(classError, err.message);
    } finally {
      classSubmit.disabled = false;
    }
  });

  /* ---------- Step 2: map categories to types ---------- */
  const catBody = document.getElementById("cat-body");
  const catError = document.getElementById("cat-error");
  const catFinish = document.getElementById("cat-finish");

  async function openMappingStep() {
    const course = wizard.course;
    const isLS = course.source === "Learning Suite";
    showStep(2);
    clearFormError(catError);
    document.getElementById("cat-intro").textContent = isLS
      ? `Items on the ${course.course_code} schedule are grouped by keyword. Pick the type each group should show as, a due time for its all-day items, and whether to include it.`
      : `${course.course_code}'s Canvas assignment groups. Pick the type each one should show as and whether to include it.`;
    catBody.innerHTML = `<div class="empty">Loading categories from ${isLS ? "the schedule" : "Canvas"}</div>`;
    catFinish.disabled = true;
    try {
      const cats = await API.courses.discoverCategories(course.course_id);
      renderCategoryTable(cats, isLS);
    } catch (err) {
      catBody.innerHTML = `<div class="empty">No categories to map yet.</div>`;
      showFormError(catError, err.message);
    } finally {
      catFinish.disabled = false;
    }
  }

  function renderCategoryTable(cats, isLS) {
    if (!cats.length) { catBody.innerHTML = `<div class="empty">Nothing found to map. Sync later and edit the class to map new categories.</div>`; return; }
    const typeOptions = sel => `<option value="">None</option>` +
      ASSIGNMENT_TYPES.map(t => `<option value="${t.assignment_type_id}" ${sel === t.assignment_type_id ? "selected" : ""}>${esc(cap(t.name))}</option>`).join("");
    catBody.innerHTML = `
      <table class="cat-table">
        <thead><tr>
          <th>Category</th><th>Show as</th>${isLS ? "<th>Due time</th>" : ""}<th style="text-align:center">Include</th>
        </tr></thead>
        <tbody>
          ${cats.map(c => {
            const n = c.item_count != null ? c.item_count : c.assignment_count;
            return `
            <tr data-cat="${c.assignment_category_id}" class="${c.is_included ? "" : "excluded"}">
              <td class="name">${esc(c.name)}<span class="n">${n} item${n === 1 ? "" : "s"}</span></td>
              <td class="type"><select class="select" data-field="type">${typeOptions(c.assignment_type_id)}</select></td>
              ${isLS ? `<td class="time"><input class="input" type="time" data-field="time" value="${esc(c.default_due_time || "")}" title="Due time for all-day items (blank = 11:59 PM)"></td>` : ""}
              <td class="inc"><input type="checkbox" data-field="include" ${c.is_included ? "checked" : ""} title="Include this category"></td>
            </tr>`; }).join("")}
        </tbody>
      </table>
      ${isLS ? `<span class="hint" style="display:block;margin-top:8px">Blank due time keeps the schedule's 11:59 PM.</span>` : ""}`;
    catBody.querySelectorAll('[data-field="include"]').forEach(cb =>
      cb.addEventListener("change", () => cb.closest("tr").classList.toggle("excluded", !cb.checked)));
  }

  function readCategoryTable() {
    return [...catBody.querySelectorAll("tr[data-cat]")].map(tr => ({
      assignment_category_id: Number(tr.dataset.cat),
      assignment_type_id: tr.querySelector('[data-field="type"]').value ? Number(tr.querySelector('[data-field="type"]').value) : null,
      default_due_time: tr.querySelector('[data-field="time"]')?.value || null,
      is_included: tr.querySelector('[data-field="include"]').checked,
    }));
  }

  document.getElementById("cat-back").addEventListener("click", () => { showStep(1); refreshSubmitLabel(); });

  catFinish.addEventListener("click", async () => {
    const course = wizard.course;
    clearFormError(catError);
    catFinish.disabled = true; catFinish.textContent = "Syncing";
    try {
      const rows = readCategoryTable();
      if (rows.length) await API.courses.saveCategories(course.course_id, rows);
      let msg = `${course.course_code} saved`;
      try {
        const r = await API.courses.sync(course.course_id);
        msg = `${course.course_code}: synced ${r.assignments_synced} item${r.assignments_synced === 1 ? "" : "s"}`;
      } catch (err) {
        msg = `${course.course_code} saved, but sync failed: ${err.message}`;
      }
      /* Sync changed last_synced_at on the course too, so refresh both lists,
         and the sidebar note (a first linked class flips it from "Nothing linked"). */
      const [assignments, courses] = await Promise.all([API.assignments.list(), API.courses.list()]);
      ASSIGNMENTS = assignments;
      setClasses(courses);
      refreshSyncStatus();
      closeModal("class-modal");
      render();
      toast(msg);
      const card = document.getElementById(`class-${course.course_id}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      showFormError(catError, err.message);
    } finally {
      catFinish.disabled = false; catFinish.textContent = "Finish";
    }
  });

  /* ---------- Delete class ---------- */
  let pendingDeleteId = null;
  const confirmError = document.getElementById("confirm-error");

  function openDeleteConfirm(courseId) {
    const cls = CLASSES.find(c => c.course_id === courseId);
    if (!cls) return;
    pendingDeleteId = courseId;
    clearFormError(confirmError);
    const n = ASSIGNMENTS.filter(a => a.course_id === courseId).length;
    document.getElementById("confirm-title").textContent = `Delete ${cls.course_code}?`;
    document.getElementById("confirm-text").textContent = n
      ? `This deletes the class and its ${n} assignment${n === 1 ? "" : "s"}. This cannot be undone.`
      : "This deletes the class. This cannot be undone.";
    openModal("confirm-modal");
  }

  document.getElementById("confirm-delete").addEventListener("click", async e => {
    const btn = e.currentTarget;
    const cls = CLASSES.find(c => c.course_id === pendingDeleteId);
    if (!cls) return closeModal("confirm-modal");
    btn.disabled = true;
    try {
      await API.courses.remove(cls.course_id);
      setClasses(CLASSES.filter(c => c.course_id !== cls.course_id));
      ASSIGNMENTS = ASSIGNMENTS.filter(a => a.course_id !== cls.course_id);
      closeModal("confirm-modal");
      render();
      toast(`${cls.course_code} deleted`);
    } catch (err) {
      showFormError(confirmError, err.message);
    } finally {
      btn.disabled = false;
      pendingDeleteId = null;
    }
  });

  render();
}
