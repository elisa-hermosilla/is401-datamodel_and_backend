/* Classes page. Classes are real (GET/POST/PUT/DELETE /api/courses);
   the assignments listed under each class are still sample data from data.js. */

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
      const all = ASSIGNMENTS.filter(a => a.course_code === c.course_code);
      const items = all
        .filter(a => showDone.checked || !a.done)
        .sort((a, b) => dueDate(a) - dueDate(b));
      const openCount = all.filter(a => !a.done).length;
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
    grid.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => openAssignmentModal(Number(b.dataset.add))));
    grid.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openClassModal(Number(b.dataset.edit))));
    grid.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => openDeleteConfirm(Number(b.dataset.delete))));
  }
  showDone.addEventListener("change", render);

  /* ---------- Add / edit class ---------- */
  const classForm = document.getElementById("class-form");
  const classError = document.getElementById("class-error");
  const classSubmit = document.getElementById("class-submit");

  function setFieldError(inputId, msg) {
    const input = document.getElementById(inputId);
    const field = input.closest(".field");
    const err = document.getElementById(`${inputId}-error`);
    if (msg) { field.classList.add("invalid"); if (err) err.textContent = msg; }
    else { field.classList.remove("invalid"); if (err) err.textContent = ""; }
  }
  function showFormError(el, msg) { el.textContent = msg; el.classList.add("show"); }
  function clearFormError(el) { el.textContent = ""; el.classList.remove("show"); }

  function fillSourceOptions(selectedId) {
    const sel = document.getElementById("c-source");
    sel.innerHTML = LMS_SOURCES.map(s =>
      `<option value="${s.lms_source_id}" ${s.lms_source_id === selectedId ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  }

  /* courseId undefined = add; a number = edit that class */
  function openClassModal(courseId) {
    const cls = courseId ? CLASSES.find(c => c.course_id === courseId) : null;
    classForm.reset();
    clearFormError(classError);
    ["c-code", "c-name", "c-source"].forEach(id => setFieldError(id, ""));

    document.getElementById("c-id").value = cls ? cls.course_id : "";
    document.getElementById("c-code").value = cls ? cls.course_code : "";
    document.getElementById("c-name").value = cls ? (cls.course_name || "") : "";
    document.getElementById("c-color").value = cls ? cls.color_hex : "#0891b2";
    const manual = LMS_SOURCES.find(s => s.name === "Manual");
    fillSourceOptions(cls ? cls.lms_source_id : (manual ? manual.lms_source_id : undefined));

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
    const fields = {
      course_code: document.getElementById("c-code").value.trim(),
      course_name: document.getElementById("c-name").value.trim() || null,
      lms_source_id: Number(document.getElementById("c-source").value),
      color_hex: document.getElementById("c-color").value,
    };

    /* Inline validation (the server checks the same rules) */
    let ok = true;
    if (!fields.course_code) { setFieldError("c-code", "Course code is required."); ok = false; }
    else if (fields.course_code.length > 30) { setFieldError("c-code", "30 characters or fewer."); ok = false; }
    else setFieldError("c-code", "");
    if (fields.course_name && fields.course_name.length > 150) { setFieldError("c-name", "150 characters or fewer."); ok = false; }
    else setFieldError("c-name", "");
    if (!fields.lms_source_id) { setFieldError("c-source", "Choose a source."); ok = false; }
    else setFieldError("c-source", "");
    if (!ok) return;

    classSubmit.disabled = true;
    try {
      let saved;
      if (id) {
        saved = await API.courses.update(Number(id), fields);
        setClasses(CLASSES.map(c => (c.course_id === saved.course_id ? saved : c)));
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
    const n = ASSIGNMENTS.filter(a => a.course_code === cls.course_code).length;
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

  /* ---------- Add assignment (sample data only for this milestone) ---------- */
  const assignmentError = document.getElementById("assignment-error");

  function openAssignmentModal(courseId) {
    const sel = document.getElementById("a-class");
    sel.innerHTML = CLASSES.map(c =>
      `<option value="${esc(c.course_code)}" ${c.course_id === courseId ? "selected" : ""}>${esc(c.course_code)}${c.course_name ? ` · ${esc(c.course_name)}` : ""}</option>`).join("");
    document.getElementById("a-type").innerHTML = ASSIGNMENT_TYPES.map(t => `<option>${t}</option>`).join("");
    document.getElementById("a-submission").innerHTML = SUBMISSION_TYPES.map(t => `<option>${t}</option>`).join("");
    document.getElementById("a-notes").value = "";
    document.getElementById("a-minutes").value = "";
    const d = addDays(today(), 3);
    document.getElementById("a-date").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    document.getElementById("a-time").value = "23:59";
    document.getElementById("a-title").value = "";
    clearFormError(assignmentError);
    setFieldError("a-title", ""); setFieldError("a-date", "");
    openModal("assignment-modal");
    setTimeout(() => document.getElementById("a-title").focus(), 50);
  }

  document.getElementById("assignment-form").addEventListener("submit", e => {
    e.preventDefault();
    const title = document.getElementById("a-title").value.trim();
    const date = document.getElementById("a-date").value;
    let ok = true;
    if (!title) { setFieldError("a-title", "Assignment name is required."); ok = false; } else setFieldError("a-title", "");
    if (!date) { setFieldError("a-date", "Due date is required."); ok = false; } else setFieldError("a-date", "");
    if (!ok) return;

    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = (document.getElementById("a-time").value || "23:59").split(":").map(Number);
    const due = new Date(y, m - 1, d, hh, mm);
    const minutes = Number(document.getElementById("a-minutes").value) || null;
    ASSIGNMENTS.push({
      id: Math.max(0, ...ASSIGNMENTS.map(a => a.id)) + 1,
      course_code: document.getElementById("a-class").value,
      title,
      type: document.getElementById("a-type").value,
      submission: document.getElementById("a-submission").value,
      notes: document.getElementById("a-notes").value.trim(),
      dueISO: due.toISOString(),
      minutes,
      done: false,
    });
    closeModal("assignment-modal");
    render();
    toast("Assignment added (sample data, not saved)");
  });

  render();
}
