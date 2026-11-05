/* First-login setup walkthrough. It stays on the dashboard and uses the same
   connection and course APIs as Settings and Assignments. */
async function startOnboarding() {
  let onboardingStatus;
  try { onboardingStatus = await API.onboarding.status(); }
  catch { return; }
  if (onboardingStatus.completed_at) return;

  const modal = document.getElementById("onboarding-modal");
  const content = document.getElementById("onboarding-content");
  const actions = document.getElementById("onboarding-actions");
  const skip = document.getElementById("onboarding-skip");
  const modalBox = modal.querySelector(".onboarding-modal");
  const colors = CLASS_COLORS;
  let phase = "welcome";
  let source = "";
  let preferredClassSource = "";
  let canvasCourses = [];
  let classFormGeneration = 0;
  let setupPhase = true;
  let learningSuiteStatus = { courses: [] };
  API.learningSuite.status().then(s => { learningSuiteStatus = s; }).catch(() => {});
  const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const show = (title, body, buttons, { skipAllowed = true } = {}) => {
    modal.classList.remove("tour-mode");
    document.body.classList.remove("onboarding-tour-active");
    modalBox.classList.remove("tour-callout");
    content.innerHTML = `<p class="onboarding-kicker">DueList quick start</p><h3 id="onboarding-title">${title}</h3><div class="onboarding-body">${body}</div>`;
    actions.innerHTML = buttons;
    skip.hidden = !skipAllowed;
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  };
  const finish = async () => {
    try { await API.onboarding.complete(); }
    catch (err) { toast(`Couldn't save tutorial completion: ${err.message}`, "error"); return; }
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("tour-mode"); modalBox.classList.remove("tour-callout");
    document.body.classList.remove("onboarding-tour-active");
    document.querySelectorAll(".onboarding-spotlight").forEach(el => el.classList.remove("onboarding-spotlight"));
  };
  const button = (label, action, cls = "btn-primary") => `<button type="button" class="btn ${cls}" data-onboarding="${action}">${label}</button>`;
  const accounts = () => `<div class="onboarding-account-box"><strong>Connected accounts</strong><p>Sources DueList imports from.</p><div><b>Canvas</b> <span class="tag ${CANVAS.connected ? "canvas" : "type"}">${CANVAS.connected ? "Connected" : "Not connected"}</span></div><div><b>Learning Suite</b> <span class="tag ${learningSuiteStatus.courses?.length ? "ls" : "type"}">${learningSuiteStatus.courses?.length ? "Linked" : "Not linked"}</span>${learningSuiteStatus.courses?.length ? `<p>${learningSuiteStatus.courses.length} class${learningSuiteStatus.courses.length === 1 ? "" : "es"} with an iCal link</p>` : ""}</div></div>`;
  const connectPrompt = () => show("Connect your learning source", `${accounts()}<p>Choose one source to start. Canvas connects with an access token. Learning Suite connects when you add a class using its iCalendar link.</p>`,
    `${button("Canvas", "choose-canvas", "btn-secondary")}${button("Learning Suite", "choose-ls", "btn-secondary")}${button("Continue", "sources-done")}`);
  const sourcePrompt = () => show("Would you like to add another source?", `${accounts()}<p>You can connect Canvas and Learning Suite now, or continue with the one you selected.</p>`,
    `${button("Add Canvas", "choose-canvas", "btn-secondary")}${button("Add Learning Suite", "choose-ls", "btn-secondary")}${button("Continue", "sources-done")}`);
  const canvasConnect = () => show("Connect Canvas", `<p>In Canvas, open <a href="${escHtml(CANVAS.base_url || "https://byu.instructure.com")}/profile/settings" target="_blank" rel="noopener">Account → Settings</a>, scroll to Approved Integrations, choose <strong>+ New Access Token</strong>, then paste it here. Canvas shows the token once.</p><form id="onboarding-canvas-form" class="onboarding-form"><label for="onboarding-token">Canvas access token</label><input class="input" id="onboarding-token" type="password" autocomplete="off" placeholder="Paste access token"><div class="form-error" id="onboarding-error" role="alert"></div><button class="btn btn-primary" type="submit">Connect Canvas</button></form><p class="hint">The token is stored securely on the DueList server so sync can run. Revoke it any time from the same Canvas page.</p>`, `${button("Back", "connect-prompt", "btn-secondary")}`);
  const afterCanvas = msg => show("Canvas is connected", `<p>${msg || "Your Canvas account is connected."}</p><p>Run a sync now to bring in available assignment data. You can also sync again after adding classes.</p><div class="form-error" id="onboarding-error" role="alert"></div>`, `${button("Sync now", "sync-canvas")}${button("Continue", "after-source", "btn-secondary")}`);
  const classForm = async (firstLS = false) => {
    source = firstLS ? "Learning Suite" : source;
    const generation = (classFormGeneration = (classFormGeneration || 0) + 1);
    if (source === "Canvas" && !CANVAS.connected) return canvasConnect();
    const coursePick = source === "Canvas" ? `<label for="ob-course">Canvas class</label><select class="select" id="ob-course"><option value="">Loading Canvas classes…</option></select>` : "";
    const lsFields = source === "Learning Suite" ? `<label for="ob-ics">Learning Suite iCalendar link</label><input class="input" id="ob-ics" type="url" placeholder="Paste the class iCal link"><span class="hint">In Learning Suite, open the course Schedule and copy its iCal link.</span>` : "";
    const colorsHtml = colors.map((c, i) => `<button type="button" class="color-swatch ${i === 0 ? "active" : ""}" data-color="${c.hex}" title="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`).join("");
    show(firstLS ? "Add your first Learning Suite class" : "Add a class", `<p>Choose a source and add the classes you want to track. Canvas and Learning Suite classes can sync assignments; manual classes are for assignments you enter yourself.</p><form id="onboarding-class-form" class="onboarding-form"><label for="ob-source">Source</label><select class="select" id="ob-source"><option ${source === "Canvas" ? "selected" : ""}>Canvas</option><option ${source === "Learning Suite" ? "selected" : ""}>Learning Suite</option><option>Manual</option></select><div id="ob-source-fields">${coursePick}${lsFields}</div><label for="ob-code">Course code</label><input class="input" id="ob-code" maxlength="30" placeholder="e.g. MKTG 201"><label for="ob-name">Course name</label><input class="input" id="ob-name" maxlength="150" placeholder="e.g. Marketing Management"><label>Color</label><div class="color-swatches" id="ob-colors">${colorsHtml}</div><input type="hidden" id="ob-color" value="${colors[0].hex}"><div class="form-error" id="onboarding-error" role="alert"></div><button class="btn btn-primary" type="submit">Add class</button></form>`, `${button("Back", "class-back", "btn-secondary")}`);
    const form = document.getElementById("onboarding-class-form");
    const refreshSource = () => { source = document.getElementById("ob-source").value; preferredClassSource = source; classForm(false); };
    form.querySelector("#ob-source").addEventListener("change", refreshSource);
    form.querySelectorAll(".color-swatch").forEach(b => b.addEventListener("click", () => { form.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("active")); b.classList.add("active"); document.getElementById("ob-color").value = b.dataset.color; }));
    form.querySelector("#ob-course")?.addEventListener("change", e => { const pick = canvasCourses.find(c => c.external_course_id === e.target.value); if (pick) { form.querySelector("#ob-code").value = pick.course_code; form.querySelector("#ob-name").value = pick.course_name || ""; } });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const err = document.getElementById("onboarding-error");
      const code = document.getElementById("ob-code").value.trim();
      if (!code) { err.textContent = "Course code is required."; err.classList.add("show"); return; }
      const pick = canvasCourses.find(c => c.external_course_id === document.getElementById("ob-course")?.value);
      if (source === "Canvas" && !pick) { err.textContent = "Choose a Canvas class."; err.classList.add("show"); return; }
      if (source === "Learning Suite" && !document.getElementById("ob-ics").value.trim()) { err.textContent = "Paste the class iCalendar link."; err.classList.add("show"); return; }
      const src = LMS_SOURCES.find(s => s.name === source);
      const submit = form.querySelector("[type=submit]"); submit.disabled = true; submit.textContent = "Adding";
      try {
        const course = await API.courses.create({ lms_source_id: src.lms_source_id, course_code: code, course_name: document.getElementById("ob-name").value.trim() || null, color_hex: document.getElementById("ob-color").value, ics_feed_url: source === "Learning Suite" ? document.getElementById("ob-ics").value.trim() : null, external_course_id: pick?.external_course_id || null });
        const fresh = await API.courses.list(); setClasses(fresh);
        if (source === "Canvas") {
          show("Class added", `<p>${escHtml(course.course_code)} is linked. Syncing its assignments now…</p><div class="form-error" id="onboarding-error" role="alert"></div>`, "");
          try { await API.courses.sync(course.course_id); await refreshSyncStatus(); }
          catch (err) { document.getElementById("onboarding-error").textContent = err.message; document.getElementById("onboarding-error").classList.add("show"); }
          classAddedPrompt(course.course_code);
        } else if (source === "Learning Suite") {
          learningSuiteStatus = await API.learningSuite.status().catch(() => learningSuiteStatus);
          show("Learning Suite is linked", `<p>${escHtml(course.course_code)} is connected with its iCalendar feed. Sync assignments now to continue.</p><div class="form-error" id="onboarding-error" role="alert"></div>`, `${button("Sync now", `sync-course-${course.course_id}`)}${button("Continue", `course-synced-${course.course_id}`, "btn-secondary")}`);
        } else {
          classAddedPrompt(course.course_code);
        }
      } catch (err) { errBox(err.message); submit.disabled = false; submit.textContent = "Add class"; }
    });
    if (source === "Canvas") {
      const courseSelect = form.querySelector("#ob-course");
      API.canvas.courses().then(courses => {
        if (generation !== classFormGeneration || !form.isConnected || source !== "Canvas") return;
        canvasCourses = courses;
        courseSelect.innerHTML = `<option value="">Choose a class</option>${canvasCourses.map(c => `<option value="${escHtml(c.external_course_id)}">${escHtml(c.course_code)} · ${escHtml(c.course_name)}</option>`).join("")}`;
      }).catch(err => {
        if (generation !== classFormGeneration || !form.isConnected) return;
        courseSelect.innerHTML = `<option value="">Could not load Canvas classes</option>`;
        errBox(err.message);
      });
    }
  };
  const errBox = msg => { const e = document.getElementById("onboarding-error"); if (e) { e.textContent = msg; e.classList.add("show"); } };
  const classAddedPrompt = code => show("Add another class?", `<p>${escHtml(code)} has been added. Would you like to add another class?</p>`, `${button("Add another", "add-class", "btn-secondary")}${button("Done", "classes-done")}`);
  const tour = async index => {
    const pages = [
      ["Dashboard", "Your home view highlights what is due soon, what is overdue, and your upcoming workload."],
      ["Calendar", "See assignments by date and scan the week ahead to plan your study time."],
      ["Assignments", "Manage your classes and assignment details, including adding or editing classes."],
      ["Settings", "Manage connected accounts, notification preferences, and your account."],
    ];
    document.querySelectorAll(".onboarding-spotlight").forEach(el => el.classList.remove("onboarding-spotlight"));
    if (index >= pages.length) { show("You're all set!", `<p>Your classes and assignments are ready. You can revisit your sources or preferences in Settings at any time.</p>`, `${button("Finish", "finish")}`); return; }
    const [label, description] = pages[index];
    const nav = document.querySelector(`#sidebar .nav a[aria-label="${label}"]`);
    show(`Quick tour: ${label}`, `<p>${description}</p>`, `${index ? button("Back", `tour-back-${index}`, "btn-secondary") : ""}${button(index === pages.length - 1 ? "Finish" : "Next", `tour-next-${index}`)}`);
    modal.classList.add("tour-mode");
    document.body.classList.add("onboarding-tour-active");
    modalBox.classList.add("tour-callout");
    if (nav) {
      nav.classList.add("onboarding-spotlight");
      const target = nav.getBoundingClientRect();
      const box = modalBox.getBoundingClientRect();
      const top = Math.max(12, Math.min(window.innerHeight - box.height - 12, target.top + target.height / 2 - box.height / 2));
      modalBox.style.setProperty("--tour-top", `${top}px`);
      modalBox.style.setProperty("--tour-arrow-y", `${Math.max(18, Math.min(box.height - 18, target.top + target.height / 2 - top))}px`);
    }
  };
  const startClasses = () => { source = preferredClassSource || (CANVAS.connected ? "Canvas" : learningSuiteStatus.courses?.length ? "Learning Suite" : "Manual"); classForm(false); };

  skip.addEventListener("click", () => show("Skip the tutorial?", `<p>Are you sure you don't want to go through the tutorial?</p>`, `${button("No, go back", "skip-no", "btn-secondary")}${button("Yes, exit", "skip-yes")}`, {skipAllowed:false}));
  actions.addEventListener("click", async e => {
    const act = e.target.closest("[data-onboarding]")?.dataset.onboarding; if (!act) return;
    if (act === "welcome-next") { phase = "choose"; connectPrompt(); }
    else if (act === "connect-prompt") connectPrompt();
    else if (act === "choose-canvas") { source = "Canvas"; preferredClassSource = source; canvasConnect(); }
    else if (act === "choose-ls") { source = "Learning Suite"; preferredClassSource = source; await classForm(true); }
    else if (act === "sync-canvas") { const b = e.target; b.disabled = true; b.textContent = "Syncing"; try { const r = await API.canvas.sync(); afterCanvas(`Synced ${r.assignments_synced || 0} assignments from ${r.courses_synced || 0} classes.`); } catch (err) { errBox(err.message); b.disabled = false; b.textContent = "Sync now"; } }
    else if (act.startsWith("sync-course-")) { const id = Number(act.split("-").pop()); const cls = CLASSES.find(c => c.course_id === id); const b = e.target; b.disabled = true; b.textContent = "Syncing"; try { await API.courses.sync(id); learningSuiteStatus = await API.learningSuite.status(); await refreshSyncStatus(); classAddedPrompt(cls?.course_code || "Class"); } catch (err) { errBox(err.message); b.disabled = false; b.textContent = "Sync now"; } }
    else if (act.startsWith("course-synced-")) { const id = Number(act.split("-").pop()); const cls = CLASSES.find(c => c.course_id === id); classAddedPrompt(cls?.course_code || "Class"); }
    else if (act === "after-source") sourcePrompt();
    else if (act === "sources-done") { setupPhase = false; if (!CLASSES.length) startClasses(); else classAddedPrompt(CLASSES[0].course_code); }
    else if (act === "class-back") sourcePrompt();
    else if (act === "add-class") startClasses();
    else if (act === "classes-done") { if (setupPhase) sourcePrompt(); else await tour(0); }
    else if (act === "finish") finish();
    else if (act === "skip-no") { if (phase === "welcome") welcome(); else if (phase === "choose") connectPrompt(); else sourcePrompt(); }
    else if (act === "skip-yes") finish();
    else if (act.startsWith("tour-next-")) await tour(Number(act.split("-").pop()) + 1);
    else if (act.startsWith("tour-back-")) { const n = Number(act.split("-").pop()); await tour(Math.max(0, n - 1)); }
  });
  document.getElementById("onboarding-content").addEventListener("submit", async e => {
    if (e.target.id !== "onboarding-canvas-form") return;
    e.preventDefault(); const token = document.getElementById("onboarding-token").value.trim();
    if (!token) return errBox("Paste your Canvas access token.");
    const submit = e.target.querySelector("[type=submit]"); submit.disabled = true; submit.textContent = "Checking";
    try { CANVAS = await API.canvas.connect(token); await refreshSyncStatus(); afterCanvas(CANVAS.canvas_name ? `Connected as ${CANVAS.canvas_name}.` : "Your Canvas account is connected."); }
    catch (err) { errBox(err.message); submit.disabled = false; submit.textContent = "Connect Canvas"; }
  });
  function welcome() { phase = "welcome"; show(`Welcome to DueList, ${escHtml(USER.first_name)}!`, `<p>DueList keeps your classes and assignments together so you can see what’s due and plan what to work on next.</p>`, `${button("Get started", "welcome-next")}`); }
  welcome();
}
