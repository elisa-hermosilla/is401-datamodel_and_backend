/* First-login setup walkthrough. Classes are configured here before the first
   sync, using the same course and category APIs as the Assignments page. */
async function startOnboarding(onboardingStatus) {
  if (onboardingStatus === undefined) {
    try { onboardingStatus = await API.onboarding.status(); } catch { return; }
  }
  if (!onboardingStatus || onboardingStatus.completed_at) return;

  const modal = document.getElementById("onboarding-modal");
  const content = document.getElementById("onboarding-content");
  const actions = document.getElementById("onboarding-actions");
  const skip = document.getElementById("onboarding-skip");
  const modalBox = modal.querySelector(".onboarding-modal");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let phase = "welcome";
  let source = "";
  let learningSuiteStatus = { courses: [] };
  let canvasCourses = [];
  let setupCourses = [];
  let configuring = null;
  let didSync = false;
  let editDraft = null;
  API.learningSuite.status().then(s => { learningSuiteStatus = s; }).catch(() => {});

  const button = (label, action, cls = "btn-primary") => `<button type="button" class="btn ${cls}" data-onboarding="${action}">${label}</button>`;
  const show = (title, body, buttons, { skipAllowed = true, wide = false, classEditor = false } = {}) => {
    modal.classList.remove("tour-mode");
    document.body.classList.remove("onboarding-tour-active");
    modalBox.classList.remove("tour-callout");
    modalBox.classList.toggle("onboarding-wide", wide);
    modalBox.classList.toggle("onboarding-class-editor", classEditor);
    content.innerHTML = `${classEditor ? "" : `<p class="onboarding-kicker">DueList quick start</p>`}<h3 id="onboarding-title">${title}</h3><div class="onboarding-body">${body}</div>`;
    actions.innerHTML = buttons;
    skip.hidden = !skipAllowed;
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  };
  const errBox = msg => {
    const el = content.querySelector(".onboarding-error");
    if (el) { el.textContent = msg; el.classList.add("show"); }
  };
  const finish = async () => {
    try { await API.onboarding.complete(); }
    catch (err) { errBox(`Couldn't save tutorial completion: ${err.message}`); return; }
    modal.classList.remove("open", "tour-mode"); modal.setAttribute("aria-hidden", "true");
    modalBox.classList.remove("tour-callout", "onboarding-wide", "onboarding-class-editor");
    document.body.classList.remove("onboarding-tour-active");
    document.querySelectorAll(".onboarding-spotlight").forEach(el => el.classList.remove("onboarding-spotlight"));
    releaseDeferredToasts();
    if (didSync) window.location.reload();
  };
  const accounts = () => `<div class="onboarding-account-box"><strong>Connected accounts</strong><div><b>Canvas</b> <span class="tag ${CANVAS.connected ? "canvas" : "type"}">${CANVAS.connected ? "Connected" : "Not connected"}</span></div><div><b>Learning Suite</b> <span class="tag ${learningSuiteStatus.courses?.length ? "ls" : "type"}">${learningSuiteStatus.courses?.length ? "Linked" : "Not linked"}</span></div></div>`;
  const connectPrompt = () => { phase = "choose"; show("Connect your learning source", `${accounts()}<p>Choose Canvas or Learning Suite. You can add classes from either source.</p>`, `${button("Canvas", "choose-canvas", "btn-secondary")}${button("Learning Suite", "choose-ls", "btn-secondary")}${button("Continue", "sources-done")}`); };
  function setupList() {
    phase = "setup-list";
    const rows = setupCourses.map((item, i) => {
      const cls = item.course || item.canvas || item;
      const label = `${esc(cls.course_code)}${cls.course_name ? ` · ${esc(cls.course_name)}` : ""}`;
      return `<div class="onboarding-class-row"><label class="onboarding-class-pick"><input type="checkbox" data-pick="${i}" ${item.selected ? "checked" : ""}><span>${label}</span></label><span class="tag ${item.source === "Canvas" ? "canvas" : "ls"}">${esc(item.source)}</span><button type="button" class="btn btn-ghost btn-sm" data-onboarding="configure" data-index="${i}">Configure</button></div>`;
    }).join("");
    show("Classes to sync", `<p>Choose the classes DueList should track. Configure categories for each class now; you can change them later from Assignments.</p>${rows ? `<div class="onboarding-class-list">${rows}</div>` : `<div class="empty">No classes added yet.</div>`}<div class="form-error onboarding-error" role="alert"></div>`, `${button(CANVAS.connected ? "Add Canvas classes" : "Connect Canvas", CANVAS.connected ? "choose-canvas" : "choose-canvas-connect", "btn-secondary")}${button("Add Learning Suite class", "choose-ls", "btn-secondary")}${button("Save and sync", "save-setup")}`, { wide: true });
    content.querySelectorAll("[data-pick]").forEach(cb => cb.addEventListener("change", () => {
      const item = setupCourses[Number(cb.dataset.pick)];
      item.selected = cb.checked;
      if (!cb.checked && item.createdHere && item.course?.course_id) {
        API.courses.remove(item.course.course_id).then(() => {
          item.course = null; item.createdHere = false; item.categoryRows = null;
          return API.courses.list().then(setClasses);
        }).catch(err => { item.selected = true; cb.checked = true; errBox(err.message); });
      }
    }));
    content.querySelectorAll('[data-onboarding="configure"]').forEach(b => b.addEventListener("click", async () => {
      try { await configureClass(setupCourses[Number(b.dataset.index)]); }
      catch (err) { errBox(err.message); }
    }));
  }

  async function createCanvasClass(item) {
    if (item.course) return item.course;
    const src = LMS_SOURCES.find(s => s.name === "Canvas");
    const c = item.canvas;
    item.course = await API.courses.create({ lms_source_id: src.lms_source_id, course_code: c.course_code, course_name: c.course_name || null, color_hex: CLASS_COLORS[setupCourses.indexOf(item) % CLASS_COLORS.length].hex, external_course_id: c.external_course_id });
    item.createdHere = true;
    setClasses(await API.courses.list());
    return item.course;
  }

  async function configureClass(item) {
    if (!item.selected) { item.selected = true; setupList(); }
    if (item.source === "Canvas") await createCanvasClass(item);
    configuring = item;
    editDraft = { source: item.source, course_code: item.course.course_code, course_name: item.course.course_name || "", color_hex: item.course.color_hex, external_course_id: item.course.external_course_id || "", ics_feed_url: item.course.ics_feed_url || "" };
    await renderClassEditor();
  }

  async function renderClassEditor() {
    phase = "class-edit";
    const currentSource = editDraft.source;
    const canvasOptions = currentSource === "Canvas" && CANVAS.connected
      ? `<label for="onboarding-edit-canvas">Canvas class</label><select class="select" id="onboarding-edit-canvas"><option value="">Loading Canvas classes…</option></select><span class="hint">From your Canvas account. Picking one fills in the code and name below; assignments sync from it.</span>` : "";
    const sourceFields = currentSource === "Learning Suite"
      ? `<label for="onboarding-edit-ics">iCalendar link</label><div class="onboarding-ics-row"><input class="input" id="onboarding-edit-ics" type="url" value="${esc(editDraft.ics_feed_url)}" placeholder="Paste the class iCal link"><button type="button" class="btn btn-secondary btn-sm" id="onboarding-edit-check-ics">Check Link</button></div><span class="hint" id="onboarding-edit-ics-note">In Learning Suite, open the course Schedule and copy its iCal link.</span>`
      : canvasOptions;
    const sourceButtons = LMS_SOURCES.map(s => `<button type="button" class="chip ${s.name === currentSource ? "active" : ""}" data-edit-source="${s.lms_source_id}"><span class="dot" style="background:${s.name === "Canvas" ? "#f87171" : s.name === "Learning Suite" ? "#60a5fa" : "#9ca3af"}"></span>${esc(s.name)}</button>`).join("");
    const swatches = CLASS_COLORS.map(c => `<button type="button" class="color-swatch ${editDraft.color_hex.toLowerCase() === c.hex.toLowerCase() ? "active" : ""}" data-edit-color="${c.hex}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}">${ICONS.check}</button>`).join("");
    show(`Edit class <span class="step-tag">Step 1 of 2</span>`, `<div class="onboarding-form class-edit-form"><label>Source</label><div class="chips source-chips onboarding-source-chips">${sourceButtons}</div><div class="onboarding-source-fields">${sourceFields}</div><label for="onboarding-edit-code">Course code</label><input class="input" id="onboarding-edit-code" maxlength="30" value="${esc(editDraft.course_code)}" placeholder="e.g. MKTG 201"><label for="onboarding-edit-name">Course name</label><input class="input" id="onboarding-edit-name" maxlength="150" value="${esc(editDraft.course_name)}" placeholder="e.g. Marketing Management"><label>Color</label><div class="color-swatches onboarding-edit-swatches">${swatches}</div><div class="form-error onboarding-error" role="alert"></div></div>`, `${button("Cancel", "edit-cancel", "btn-secondary")}${button("Next", "edit-next")}`, { classEditor: true, skipAllowed: false });
    content.querySelectorAll("[data-edit-source]").forEach(b => b.addEventListener("click", async () => {
      collectClassDraft();
      const source = LMS_SOURCES.find(s => s.lms_source_id === Number(b.dataset.editSource))?.name;
      if (source && source !== editDraft.source) {
        editDraft.source = source;
        editDraft.ics_feed_url = "";
        editDraft.external_course_id = "";
        await renderClassEditor();
      }
    }));
    content.querySelectorAll("[data-edit-color]").forEach(b => b.addEventListener("click", () => {
      collectClassDraft(); editDraft.color_hex = b.dataset.editColor; renderClassEditor();
    }));
    const canvasSelect = document.getElementById("onboarding-edit-canvas");
    if (canvasSelect) {
      try {
        canvasCourses = await API.canvas.courses();
        canvasSelect.innerHTML = `<option value="">Choose a class</option>${canvasCourses.map(c => `<option value="${esc(c.external_course_id)}" ${c.external_course_id === editDraft.external_course_id ? "selected" : ""}>${esc(c.course_code)} · ${esc(c.course_name)}${c.term ? ` (${esc(c.term)})` : ""}${c.already_added && c.external_course_id !== editDraft.external_course_id ? " · already added" : ""}</option>`).join("")}`;
        canvasSelect.addEventListener("change", () => {
          const selected = canvasCourses.find(c => c.external_course_id === canvasSelect.value);
          if (selected) { collectClassDraft(); editDraft.external_course_id = selected.external_course_id; editDraft.course_code = selected.course_code; editDraft.course_name = selected.course_name; renderClassEditor(); }
        });
      } catch (err) { errBox(err.message); }
    }
    document.getElementById("onboarding-edit-check-ics")?.addEventListener("click", async e => {
      collectClassDraft();
      const note = document.getElementById("onboarding-edit-ics-note"), btn = e.currentTarget;
      if (!editDraft.ics_feed_url) { note.textContent = "Paste the iCalendar link first."; return; }
      btn.disabled = true; btn.textContent = "Checking"; note.textContent = "Fetching the calendar…";
      try { const preview = await API.learningSuite.preview(editDraft.ics_feed_url); note.textContent = preview.total ? `Link works: ${preview.total} schedule item${preview.total === 1 ? "" : "s"}.` : "Link works, but the calendar is empty."; }
      catch (err) { note.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = "Check Link"; }
    });
    document.getElementById("onboarding-edit-code").addEventListener("input", collectClassDraft);
    document.getElementById("onboarding-edit-name").addEventListener("input", collectClassDraft);
    document.getElementById("onboarding-edit-ics")?.addEventListener("input", collectClassDraft);
  }

  function collectClassDraft() {
    if (!editDraft) return;
    const code = document.getElementById("onboarding-edit-code");
    const name = document.getElementById("onboarding-edit-name");
    const ics = document.getElementById("onboarding-edit-ics");
    if (code) editDraft.course_code = code.value;
    if (name) editDraft.course_name = name.value;
    if (ics) editDraft.ics_feed_url = ics.value;
    const picked = document.getElementById("onboarding-edit-canvas")?.value;
    if (picked) editDraft.external_course_id = picked;
  }

  async function saveClassDraft() {
    collectClassDraft();
    const sourceRecord = LMS_SOURCES.find(s => s.name === editDraft.source);
    if (!editDraft.course_code.trim()) return errBox("Course code is required.");
    if (editDraft.source === "Canvas" && CANVAS.connected && !editDraft.external_course_id) return errBox("Choose a Canvas class.");
    if (editDraft.source === "Learning Suite" && !/^(https?|webcal):\/\/\S+$/i.test(editDraft.ics_feed_url.trim())) return errBox("Paste a full iCalendar link starting with https://.");
    const previousSource = configuring.source;
    const updated = await API.courses.update(configuring.course.course_id, {
      lms_source_id: sourceRecord.lms_source_id,
      course_code: editDraft.course_code.trim(),
      course_name: editDraft.course_name.trim() || null,
      color_hex: editDraft.color_hex,
      ics_feed_url: editDraft.source === "Learning Suite" ? editDraft.ics_feed_url.trim() : null,
      external_course_id: editDraft.source === "Canvas" ? editDraft.external_course_id || null : null,
    });
    configuring.course = updated;
    configuring.source = editDraft.source;
    configuring.selected = editDraft.source !== "Manual";
    if (previousSource !== editDraft.source) { configuring.categoryRows = null; configuring.categoryMode = null; }
    setClasses(await API.courses.list());
    if (editDraft.source === "Manual") { setupList(); return; }
    await openCategoryEditor(configuring);
  }

  async function openCategoryEditor(item) {
    const isLS = item.source === "Learning Suite";
    phase = "categories";
    show(`Edit class <span class="step-tag">Step 2 of 2</span>`, `<p class="onboarding-config-intro">${isLS ? "Choose how schedule items are grouped, then edit the category settings." : "Choose how Canvas assignment groups map to your assignment types."}</p><div id="onboarding-category-body"><div class="empty">Loading categories…</div></div><div class="form-error onboarding-error" role="alert"></div>`, `${button("Back", "category-back", "btn-secondary")}${button("Finish", "category-finish")}`, { wide: true, classEditor: true, skipAllowed: false });
    document.querySelector('[data-onboarding="category-finish"]').disabled = true;
    if (isLS && !item.categoryMode) { renderModeChoice(item); return; }
    await loadCategories(item, item.categoryMode || null);
  }

  function renderModeChoice(item) {
    const body = document.getElementById("onboarding-category-body");
    document.querySelector('[data-onboarding="category-finish"]').disabled = true;
    body.innerHTML = `<div class="cat-choice"><button type="button" class="cat-option" data-mode="ai"><span class="t">Categorize using AI</span><span class="d">AI suggests groups for this schedule. You can edit names, keywords, and types.</span></button><button type="button" class="cat-option" data-mode="keywords"><span class="t">Categorize using Key Words</span><span class="d">Use standard groups such as Readings, Quizzes, and Exams based on item titles.</span></button></div>`;
    body.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", async () => {
      body.querySelectorAll("[data-mode]").forEach(x => x.disabled = true);
      item.categoryMode = b.dataset.mode;
      await loadCategories(item, item.categoryMode);
    }));
  }

  async function loadCategories(item, mode) {
    const body = document.getElementById("onboarding-category-body");
    body.innerHTML = `<div class="empty">${mode === "ai" ? "Asking AI to organize the schedule…" : "Finding categories…"}</div>`;
    try {
      const cats = await API.courses.discoverCategories(item.course.course_id, mode);
      item.categoryRows = item.categoryRows ? mergeEdits(cats, item.categoryRows) : cats;
      renderCategoryEditor(item, item.categoryRows);
      document.querySelector('[data-onboarding="category-finish"]').disabled = false;
    } catch (err) {
      if (item.source === "Learning Suite" && !item.categoryRows) renderModeChoice(item);
      else body.innerHTML = `<div class="empty">Could not load categories.</div>`;
      if (item.source !== "Learning Suite") document.querySelector('[data-onboarding="category-finish"]').disabled = false;
      errBox(err.message);
    }
  }

  function renderCategoryEditor(item, allCats) {
    const isLS = item.source === "Learning Suite";
    const body = document.getElementById("onboarding-category-body");
    const cats = allCats.filter(c => (c.item_count ?? c.assignment_count ?? 0) > 0);
    if (!cats.length) { body.innerHTML = `<div class="empty">No categories found yet. You can sync and edit categories later.</div>`; return; }
    const typeOpts = selected => `<option value="">None</option>${ASSIGNMENT_TYPES.map(t => `<option value="${t.assignment_type_id}" ${selected === t.assignment_type_id ? "selected" : ""}>${esc(t.name[0].toUpperCase() + t.name.slice(1))}</option>`).join("")}`;
    body.innerHTML = `<table class="cat-table"><thead><tr><th>Category</th><th>Show as</th>${isLS ? "<th>Keywords</th><th>Due time</th>" : ""}<th>Include</th></tr></thead><tbody>${cats.map(c => `<tr data-cat="${c.assignment_category_id}" class="${c.is_included ? "" : "excluded"}"><td class="name">${esc(c.name)}<span class="n">${c.item_count ?? c.assignment_count} items</span></td><td class="type"><select class="select" data-field="type">${typeOpts(c.assignment_type_id)}</select></td>${isLS ? `<td class="kw"><input class="input" data-field="keywords" value="${esc((c.match_keywords || []).join(", "))}" placeholder="e.g. reading, chapter"></td><td class="time"><input class="input" type="time" data-field="time" value="${esc(c.default_due_time || "")}"></td>` : ""}<td class="inc"><input type="checkbox" data-field="include" ${c.is_included ? "checked" : ""}></td></tr>`).join("")}</tbody></table>${isLS ? `<span class="hint onboarding-category-hint">Edit keywords to control which schedule items land in each group. Blank due time leaves all-day items without a set time.</span>` : ""}`;
    body.querySelectorAll('[data-field="include"]').forEach(cb => cb.addEventListener("change", () => cb.closest("tr").classList.toggle("excluded", !cb.checked)));
  }

  function collectCategoryEdits() {
    return [...document.querySelectorAll("#onboarding-category-body tr[data-cat]")].map(tr => ({
      assignment_category_id: Number(tr.dataset.cat),
      assignment_type_id: tr.querySelector('[data-field="type"]').value ? Number(tr.querySelector('[data-field="type"]').value) : null,
      default_due_time: tr.querySelector('[data-field="time"]')?.value || null,
      is_included: tr.querySelector('[data-field="include"]').checked,
      ...(tr.querySelector('[data-field="keywords"]') ? { match_keywords: tr.querySelector('[data-field="keywords"]').value } : {}),
    }));
  }

  async function saveCategoryDraft() {
    if (phase === "categories") {
      const edits = collectCategoryEdits();
      if (edits.length) configuring.categoryRows = mergeEdits(configuring.categoryRows, edits);
    }
    setupList();
  }

  function canvasPicker() {
    phase = "canvas-picker";
    const list = canvasCourses.map((c, i) => {
      const item = setupCourses.find(x => x.canvas?.external_course_id === c.external_course_id || x.course?.external_course_id === c.external_course_id);
      const selected = item ? item.selected : c.already_added;
      return `<label class="onboarding-class-row onboarding-canvas-row"><span class="onboarding-class-pick"><input type="checkbox" data-canvas-pick="${i}" ${selected ? "checked" : ""}><span>${esc(c.course_code)} · ${esc(c.course_name)}${c.term ? ` <small>(${esc(c.term)})</small>` : ""}</span></span><span class="hint">${c.already_added ? "Already added" : ""}</span></label>`;
    }).join("");
    show("Choose Canvas classes", `<p>Select the classes to add. You can configure their assignment categories before the first sync.</p><div class="onboarding-class-list">${list || `<div class="empty">No active Canvas classes found.</div>`}</div><div class="form-error onboarding-error" role="alert"></div>`, `${button("Back", "back-setup", "btn-secondary")}${button("Add selected classes", "add-canvas-selected")}`, { wide: true });
    content.querySelectorAll("[data-canvas-pick]").forEach(cb => cb.addEventListener("change", () => {
      const c = canvasCourses[Number(cb.dataset.canvasPick)];
      let item = setupCourses.find(x => x.canvas?.external_course_id === c.external_course_id || x.course?.external_course_id === c.external_course_id);
      if (!item) { item = { source: "Canvas", canvas: c, selected: c.already_added, course: CLASSES.find(x => x.external_course_id === c.external_course_id) || null }; setupCourses.push(item); }
      item.selected = cb.checked;
    }));
  }

  async function addSelectedCanvas() {
    for (const item of setupCourses.filter(x => x.source === "Canvas" && x.selected)) await createCanvasClass(item);
    setupList();
  }

  function learningSuiteForm() {
    source = "Learning Suite";
    phase = "ls-form";
    show("Add a Learning Suite class", `<p>Paste the class iCalendar link. After adding it, you’ll choose how its schedule is grouped.</p><form id="onboarding-ls-form" class="onboarding-form"><label for="onboarding-ics">iCalendar link</label><input class="input" id="onboarding-ics" type="url" placeholder="Paste the class iCal link" required><label for="onboarding-ls-code">Course code</label><input class="input" id="onboarding-ls-code" maxlength="30" placeholder="e.g. MKTG 201" required><label for="onboarding-ls-name">Course name</label><input class="input" id="onboarding-ls-name" maxlength="150" placeholder="e.g. Marketing Management"><label>Color</label><div class="color-swatches" id="onboarding-ls-colors">${CLASS_COLORS.map((c, i) => `<button type="button" class="color-swatch ${i === 0 ? "active" : ""}" data-color="${c.hex}" style="background:${c.hex}" aria-label="${c.name}" title="${c.name}">${ICONS.check}</button>`).join("")}</div><input type="hidden" id="onboarding-ls-color" value="${CLASS_COLORS[0].hex}"><div class="form-error onboarding-error" role="alert"></div><button class="btn btn-primary" type="submit">Add</button></form>`, button("Back", "back-setup", "btn-secondary"));
    content.querySelectorAll(".color-swatch").forEach(b => b.addEventListener("click", () => { content.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("active")); b.classList.add("active"); document.getElementById("onboarding-ls-color").value = b.dataset.color; }));
  }

  async function saveAndSync() {
    const selected = setupCourses.filter(x => x.selected);
    if (!selected.length) { errBox("Select or add at least one class before syncing."); return; }
    phase = "syncing";
    show("Syncing your classes", `<div class="onboarding-sync-state"><span class="onboarding-sync-icon" aria-hidden="true">↻</span><p>Preparing your first sync…</p><div class="onboarding-sync-progress" role="status">0 of ${selected.length} classes</div></div><div class="form-error onboarding-error" role="alert"></div>`, "", { skipAllowed: false });
    let completed = 0;
    const failures = [];
    for (const item of selected) {
      try {
        if (!item.course) item.course = item.source === "Canvas" ? await createCanvasClass(item) : item.course;
        if (!item.course) throw new Error("Class setup is incomplete.");
        const rows = item.categoryRows ? collectSavedRows(item) : [];
        if (rows.length) await API.courses.saveCategories(item.course.course_id, rows);
        await API.courses.sync(item.course.course_id);
      } catch (err) { failures.push(`${item.course?.course_code || item.canvas?.course_code || "Class"}: ${err.message}`); }
      completed++;
      content.querySelector(".onboarding-sync-progress").textContent = `${completed} of ${selected.length} classes`;
    }
    didSync = true;
    await Promise.all([API.courses.list().then(setClasses), API.assignments.list().then(a => { ASSIGNMENTS = a; }), refreshSyncStatus()]);
    if (failures.length) {
      show("Sync finished with an issue", `<p>Some classes could not sync:</p><ul>${failures.map(e => `<li>${esc(e)}</li>`).join("")}</ul><p>You can retry from the class list.</p><div class="form-error onboarding-error" role="alert"></div>`, `${button("Back to classes", "back-setup", "btn-secondary")}${button("Continue", "after-sync")}`, { wide: true });
    } else afterSync();
  }

  function collectSavedRows(item) { return item.categoryRows.map(c => ({
    assignment_category_id: c.assignment_category_id,
    assignment_type_id: c.assignment_type_id,
    default_due_time: c.default_due_time,
    is_included: c.is_included,
    match_keywords: c.match_keywords || [],
  })); }
  function afterSync() { show("Your classes are ready", `<p>Your selected classes have synced. You can update class details and categories from Assignments at any time.</p>`, `${button("Continue", "after-sync")}`); }

  const tour = async index => {
    const pages = [["Dashboard", "Your home view highlights what is due soon, what is overdue, and your upcoming workload."],["Calendar", "See assignments by date and scan the week ahead to plan your study time."],["Assignments", "Manage your classes and assignment details, including adding or editing classes."],["Settings", "Manage connected accounts, notification preferences, and your account."]];
    document.querySelectorAll(".onboarding-spotlight").forEach(el => el.classList.remove("onboarding-spotlight"));
    if (index >= pages.length) { show("You're all set!", `<p>Your classes and assignments are ready. Revisit your sources or preferences in Settings at any time.</p>`, button("Finish", "finish")); return; }
    const [label, description] = pages[index];
    const nav = document.querySelector(`#sidebar .nav a[aria-label="${label}"]`);
    show(`Quick tour: ${label}`, `<p>${description}</p>`, `${index ? button("Back", `tour-back-${index}`, "btn-secondary") : ""}${button(index === pages.length - 1 ? "Finish" : "Next", `tour-next-${index}`)}`);
    modal.classList.add("tour-mode"); document.body.classList.add("onboarding-tour-active"); modalBox.classList.add("tour-callout");
    if (nav) { nav.classList.add("onboarding-spotlight"); const target = nav.getBoundingClientRect(), box = modalBox.getBoundingClientRect(); const top = Math.max(12, Math.min(window.innerHeight - box.height - 12, target.top + target.height / 2 - box.height / 2)); modalBox.style.setProperty("--tour-top", `${top}px`); modalBox.style.setProperty("--tour-arrow-y", `${Math.max(18, Math.min(box.height - 18, target.top + target.height / 2 - top))}px`); }
  };

  skip.addEventListener("click", () => show("Skip the tutorial?", `<p>Are you sure you don't want to go through the tutorial?</p>`, `${button("No, go back", "skip-no", "btn-secondary")}${button("Yes, exit", "skip-yes")}`, { skipAllowed: false }));
  actions.addEventListener("click", async e => {
    const act = e.target.closest("[data-onboarding]")?.dataset.onboarding; if (!act) return;
    try {
      if (act === "welcome-next") connectPrompt();
      else if (act === "connect-prompt") connectPrompt();
      else if (act === "choose-canvas") { source = "Canvas"; if (CANVAS.connected) { canvasCourses = await API.canvas.courses(); initializeCanvasItems(); canvasPicker(); } else canvasConnect(); }
      else if (act === "choose-canvas-connect") canvasConnect();
      else if (act === "choose-ls") learningSuiteForm();
      else if (act === "add-canvas-selected") await addSelectedCanvas();
      else if (act === "back-setup") setupList();
      else if (act === "edit-cancel") setupList();
      else if (act === "edit-next") await saveClassDraft();
      else if (act === "category-back") { await saveCategoryDraft(); editDraft = { source: configuring.source, course_code: configuring.course.course_code, course_name: configuring.course.course_name || "", color_hex: configuring.course.color_hex, external_course_id: configuring.course.external_course_id || "", ics_feed_url: configuring.course.ics_feed_url || "" }; await renderClassEditor(); }
      else if (act === "category-finish") await saveCategoryDraft();
      else if (act === "save-setup") await saveAndSync();
      else if (act === "sources-done") { if (!setupCourses.length && !CLASSES.length) setupList(); else if (!setupCourses.length) await startClasses(); else setupList(); }
      else if (act === "after-sync") await tour(0);
      else if (act === "finish") finish();
      else if (act === "skip-no") { if (phase === "welcome") welcome(); else if (phase === "choose") connectPrompt(); else setupList(); }
      else if (act === "skip-yes") finish();
      else if (act.startsWith("tour-next-")) await tour(Number(act.split("-").pop()) + 1);
      else if (act.startsWith("tour-back-")) await tour(Math.max(0, Number(act.split("-").pop()) - 1));
    } catch (err) { errBox(err.message); }
  });

  function mergeEdits(original, edits) {
    const byId = new Map(edits.map(c => [c.assignment_category_id, c]));
    return original.map(c => ({ ...c, ...(byId.get(c.assignment_category_id) || {}) }));
  }
  function startClasses() {
    setupCourses = CLASSES.filter(c => !c.is_archived && c.source !== "Manual").map(course => ({ course, source: course.source, selected: true, categoryRows: null }));
    setupList();
  }
  function initializeCanvasItems() {
    for (const c of canvasCourses) {
      if (!setupCourses.some(x => x.canvas?.external_course_id === c.external_course_id || x.course?.external_course_id === c.external_course_id)) {
        const existing = CLASSES.find(x => x.external_course_id === c.external_course_id);
        setupCourses.push({ source: "Canvas", canvas: c, course: existing || null, selected: !!c.already_added, categoryRows: null });
      }
    }
  }
  async function canvasConnect() {
    phase = "canvas-connect";
    show("Connect Canvas", `<p>In Canvas, open <a href="${esc(CANVAS.base_url || "https://byu.instructure.com")}/profile/settings" target="_blank" rel="noopener">Account → Settings</a>, scroll to Approved Integrations, choose <strong>+ New Access Token</strong>, then paste it here. Canvas shows the token once.</p><form id="onboarding-canvas-form" class="onboarding-form"><label for="onboarding-token">Canvas access token</label><input class="input" id="onboarding-token" type="password" autocomplete="off" placeholder="Paste access token"><div class="form-error onboarding-error" role="alert"></div><button class="btn btn-primary" type="submit">Connect Canvas</button></form><p class="hint">The token is stored securely on the DueList server so sync can run. Revoke it any time from Canvas settings.</p>`, button("Back", "connect-prompt", "btn-secondary"));
  }
  function welcome() { phase = "welcome"; show(`Welcome to DueList, ${esc(USER.first_name)}!`, `<p>DueList keeps your classes and assignments together so you can see what’s due and plan what to work on next.</p>`, button("Get started", "welcome-next")); }

  content.addEventListener("submit", async e => {
    if (e.target.id === "onboarding-canvas-form") {
      e.preventDefault(); const token = document.getElementById("onboarding-token").value.trim();
      if (!token) return errBox("Paste your Canvas access token.");
      const submit = e.target.querySelector("[type=submit]"); submit.disabled = true; submit.textContent = "Checking";
      try { CANVAS = await API.canvas.connect(token, true); await refreshSyncStatus(); canvasCourses = await API.canvas.courses(); initializeCanvasItems(); canvasPicker(); }
      catch (err) { errBox(err.message); submit.disabled = false; submit.textContent = "Connect Canvas"; }
    }
    if (e.target.id === "onboarding-ls-form") {
      e.preventDefault(); const code = document.getElementById("onboarding-ls-code").value.trim(), url = document.getElementById("onboarding-ics").value.trim();
      const submit = e.target.querySelector("[type=submit]"); submit.disabled = true; submit.textContent = "Adding";
      try {
        const src = LMS_SOURCES.find(s => s.name === "Learning Suite");
        const course = await API.courses.create({ lms_source_id: src.lms_source_id, course_code: code, course_name: document.getElementById("onboarding-ls-name").value.trim() || null, color_hex: document.getElementById("onboarding-ls-color").value, ics_feed_url: url });
        setClasses(await API.courses.list());
        const item = { source: "Learning Suite", course, selected: true, createdHere: true, categoryMode: null, categoryRows: null };
        setupCourses.push(item); learningSuiteStatus = await API.learningSuite.status();
        configuring = item;
        await openCategoryEditor(item);
      } catch (err) { errBox(err.message); submit.disabled = false; submit.textContent = "Add"; }
    }
  });

  welcome();
}
