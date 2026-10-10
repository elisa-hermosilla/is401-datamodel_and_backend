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

  /* courseId undefined = add; a number = edit that class */
  function openClassModal(courseId) {
    const cls = courseId ? CLASSES.find(c => c.course_id === courseId) : null;
    classForm.reset();
    clearFormError(classError);
    ["c-code", "c-name", "c-source", "c-ics", "c-canvas-course"].forEach(id => setFieldError(id, ""));

    document.getElementById("c-id").value = cls ? cls.course_id : "";
    document.getElementById("c-code").value = cls ? cls.course_code : "";
    document.getElementById("c-name").value = cls ? (cls.course_name || "") : "";
    document.getElementById("c-ics").value = cls ? (cls.ics_feed_url || "") : "";

    const manual = LMS_SOURCES.find(s => s.name === "Manual");
    renderSourceChips(cls ? cls.lms_source_id : (manual ? manual.lms_source_id : LMS_SOURCES[0]?.lms_source_id));
    canvasCourses = null;
    renderCanvasOptions(cls);
    renderSwatches(cls ? cls.color_hex : nextClassColor());

    document.getElementById("class-modal-title").textContent = cls ? "Edit class" : "Add a class";
    classSubmit.textContent = cls ? "Save" : "Add class";
    openModal("class-modal");
    setTimeout(() => document.getElementById("c-code").focus(), 50);
  }
  document.getElementById("add-class-btn").addEventListener("click", () => openClassModal());

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

      closeModal("class-modal");
      render();
      toast(id ? `${saved.course_code} saved` : `${saved.course_code} added`);
      const card = document.getElementById(`class-${saved.course_id}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      showFormError(classError, err.message);
    } finally {
      classSubmit.disabled = false;
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
