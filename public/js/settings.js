/* Settings UI; assignment reminder preferences and push subscriptions are persisted through the API. */

initApp("settings").then(main);

function main() {
  bindCategoryNav(document.getElementById("settings-shell"), {
    defaultKey: "account",
    onSelect: key => { document.getElementById("settings-save-actions").hidden = !["notifications", "delivery"].includes(key); },
  });
  document.getElementById("account-name").textContent = `${USER.first_name} ${USER.last_name}`;
  document.getElementById("account-username").textContent = USER.username;
  document.getElementById("account-email").textContent = USER.email;
  document.getElementById("settings-class-list").innerHTML = CLASSES.length ? CLASSES.map(c =>
    `<div class="setting-row"><div class="info"><div class="t"><span class="course-marker" style="display:inline-block;background:${esc(c.color_hex)}"></span> ${esc(c.course_code)}</div><div class="d">${esc(c.course_name || c.source)}</div></div><a class="btn btn-secondary btn-sm" href="/assignments?edit_class=${c.course_id}">Manage</a></div>`).join("") : '<p class="sub">No classes yet. Add a class to get started.</p>';

  /* ---------- Account (real): who you are + change password ---------- */
  document.getElementById("account-sub").textContent = `${USER.first_name} ${USER.last_name} · ${USER.username} · ${USER.email}`;
  const pwForm = document.getElementById("password-form");
  const pwError = document.getElementById("password-error");
  const pwBtn = document.getElementById("pw-btn");
  pwForm.addEventListener("submit", async e => {
    e.preventDefault();
    pwError.classList.remove("show");
    const current = document.getElementById("pw-current").value;
    const next = document.getElementById("pw-new").value;
    const confirm = document.getElementById("pw-confirm").value;
    const fail = msg => { pwError.textContent = msg; pwError.classList.add("show"); };
    if (!current) return fail("Enter your current password.");
    if (next.length < 8) return fail("New password must be at least 8 characters.");
    if (next !== confirm) return fail("New passwords do not match.");
    pwBtn.disabled = true;
    try {
      await API.changePassword(current, next);
      pwForm.reset();
      toast("Password changed", "success");
    } catch (err) {
      fail(err.message);
    } finally {
      pwBtn.disabled = false;
    }
  });

  /* ---------- Canvas connection (real) ---------- */
  function renderCanvas() {
    const el = document.getElementById("canvas-row");
    if (CANVAS.connected) {
      const last = CANVAS.last_sync;
      const linked = CANVAS.linked_courses || 0;
      /* Each part is escaped on its own so the live relTimeEl span survives */
      const detail = [
        `Last synced ${relTimeEl(CANVAS.last_synced_at)}`,
        esc(`${linked} linked class${linked === 1 ? "" : "es"}`),
        last && last.status === "failed" ? esc(`Last sync failed: ${last.error_message || "unknown error"}`) : null,
        last && last.status === "success" ? esc(`${last.assignments_synced} assignment${last.assignments_synced === 1 ? "" : "s"} last time`) : null,
      ].filter(Boolean).join(" · ");
      el.innerHTML = `
        <div class="setting-row">
          <div class="info">
            <div class="t">Canvas <span class="tag ${CANVAS.status === "error" ? "type" : "canvas"}">${CANVAS.status === "error" ? "Token rejected" : "Connected"}</span></div>
            <div class="d">${detail}</div>
            ${linked === 0 ? `<div class="d">Link a class: Assignments page → Add class → Canvas.</div>` : ""}
          </div>
          <div class="control">
            <button class="btn btn-secondary btn-sm" id="canvas-sync">Sync now</button>
            <button class="btn btn-ghost btn-sm" id="canvas-disconnect">Disconnect</button>
          </div>
        </div>
        <div class="form-error" id="canvas-error" role="alert"></div>
        <form id="canvas-replace-form" class="row" style="margin-top:12px;max-width:560px;align-items:flex-end" novalidate>
          <div class="field" style="margin:0;flex:1">
            <label for="canvas-replace-token">Replace Canvas token</label>
            <input class="input" id="canvas-replace-token" type="password" placeholder="Paste a new access token" autocomplete="off" spellcheck="false">
          </div>
          <button class="btn btn-secondary" type="submit" id="canvas-replace" style="flex:none">Replace token</button>
        </form>`;
      document.getElementById("canvas-replace-form").addEventListener("submit", async e => {
        e.preventDefault();
        const btn = document.getElementById("canvas-replace");
        const token = document.getElementById("canvas-replace-token").value.trim();
        if (!token) return showCanvasError("Paste your new Canvas access token.");
        btn.disabled = true; btn.textContent = "Checking";
        try {
          const r = await API.canvas.connect(token);
          CANVAS = r;
          toast("Canvas token replaced", "success");
          renderCanvas();
          refreshSyncStatus();
          if (r.sync_error) showCanvasError(`Token replaced, but the first sync failed: ${r.sync_error}`);
        } catch (err) {
          showCanvasError(err.message);
          btn.disabled = false; btn.textContent = "Replace token";
        }
      });
      applySyncCooldown(document.getElementById("canvas-sync"));
      document.getElementById("canvas-sync").addEventListener("click", async e => {
        const b = e.currentTarget;
        if (syncOnCooldown(b)) return;
        b.disabled = true; b.textContent = "Syncing";
        try {
          const r = await API.canvas.sync();
          if (!r.courses_synced && r.courses_skipped) toast(`All classes were synced recently. ${cooldownTip(r.next_sync_at)}.`);
          else toast(`Synced ${r.assignments_synced} assignment${r.assignments_synced === 1 ? "" : "s"} from ${r.courses_synced} class${r.courses_synced === 1 ? "" : "es"}${removedNote(r.assignments_removed)}${r.courses_skipped ? ` · ${r.courses_skipped} synced recently, skipped` : ""}`, "success");
        } catch (err) {
          if (isCanvasTokenRejected(err)) showCanvasTokenWarning();
          showCanvasError(err.message);
        }
        CANVAS = await API.canvas.status();
        renderCanvas();
        refreshSyncStatus();
      });
      document.getElementById("canvas-disconnect").addEventListener("click", async e => {
        e.currentTarget.disabled = true;
        try {
          await API.canvas.disconnect();
          CANVAS = await API.canvas.status();
          toast("Canvas disconnected", "success");
          renderCanvas();
          refreshSyncStatus();
        } catch (err) { showCanvasError(err.message); }
      });
    } else {
      el.innerHTML = `
        <div class="setting-row">
          <div class="info">
            <div class="t">Canvas <span class="tag type">Not connected</span></div>
            <div class="d">Paste a Canvas access token to import your classes and assignments. In Canvas go to <a href="${esc(CANVAS.base_url || "https://byu.instructure.com")}/profile/settings" target="_blank" rel="noopener">Account → Settings</a>, scroll to Approved Integrations, click <strong>+ New Access Token</strong>, and copy the token. Canvas shows it only once.</div>
          </div>
        </div>
        <form id="canvas-form" novalidate class="row" style="max-width:560px;align-items:flex-start">
          <div class="field" style="margin:0;flex:1">
            <input class="input" id="canvas-token" type="password" aria-label="Canvas access token" placeholder="Paste access token" autocomplete="off" spellcheck="false">
          </div>
          <button class="btn btn-primary" type="submit" id="canvas-connect" style="flex:none">Connect</button>
        </form>
        <div class="form-error" id="canvas-error" role="alert" style="margin-top:10px"></div>
        <div class="hint canvas-token-note">The token is stored on the DueList server so sync can run. Revoke it any time from the same Canvas page.</div>`;
      document.getElementById("canvas-form").addEventListener("submit", async e => {
        e.preventDefault();
        const btn = document.getElementById("canvas-connect");
        const token = document.getElementById("canvas-token").value.trim();
        if (!token) return showCanvasError("Paste your Canvas access token.");
        btn.disabled = true; btn.textContent = "Checking";
        try {
          const r = await API.canvas.connect(token);
          CANVAS = r;
          const who = r.canvas_name ? ` as ${r.canvas_name}` : "";
          if (r.sync) toast(`Connected${who}. Synced ${r.sync.assignments_synced} assignment${r.sync.assignments_synced === 1 ? "" : "s"} from ${r.sync.courses_synced} class${r.sync.courses_synced === 1 ? "" : "es"}.`, "success");
          else toast(`Connected${who}`, "success");
          renderCanvas();
          refreshSyncStatus();
          if (r.sync_error) showCanvasError(`Connected, but the first sync failed: ${r.sync_error}`);
        } catch (err) {
          showCanvasError(err.message);
          btn.disabled = false; btn.textContent = "Connect";
        }
      });
    }
  }
  function showCanvasError(msg) {
    const e = document.getElementById("canvas-error");
    if (!e) return;
    e.textContent = msg; e.classList.add("show");
  }
  renderCanvas();

  /* ---------- Learning Suite feeds (real) ---------- */
  let LS = { courses: [], last_synced_at: null };
  function renderLearningSuite() {
    const el = document.getElementById("ls-row");
    const n = LS.courses.length;
    const failed = LS.courses.filter(c => c.last_sync && c.last_sync.status === "failed");
    /* Already-escaped HTML; the relTimeEl span is live so it can tick */
    const detail = n
      ? [esc(`${n} class${n === 1 ? "" : "es"} with an iCal link`), `last synced ${relTimeEl(LS.last_synced_at)}`,
         failed.length ? esc(`${failed.length} failed last time`) : null].filter(Boolean).join(" · ")
      : "No classes have an iCal link yet. Add one: Assignments → Add class → Learning Suite.";
    el.innerHTML = `
      <div class="setting-row">
        <div class="info">
          <div class="t">Learning Suite <span class="tag ${n ? "ls" : "type"}">${n ? (failed.length ? "Needs attention" : "Linked") : "Not linked"}</span></div>
          <div class="d">${detail}</div>
          ${LS.courses.map(c => `<div class="d">${esc(c.course_code)}: ${c.last_sync ? (c.last_sync.status === "failed" ? `failed, ${esc(c.last_sync.error_message || "")}` : `${c.last_sync.assignments_synced} item${c.last_sync.assignments_synced === 1 ? "" : "s"} ${relTimeEl(c.last_sync.finished_at)}`) : "never synced"}</div>`).join("")}
        </div>
        ${n ? `<div class="control"><button class="btn btn-secondary btn-sm" id="ls-sync">Sync now</button></div>` : ""}
      </div>
      <div class="form-error" id="ls-error" role="alert"></div>`;
    const btn = document.getElementById("ls-sync");
    applySyncCooldown(btn);
    if (btn) btn.addEventListener("click", async () => {
      if (syncOnCooldown(btn)) return;
      btn.disabled = true; btn.textContent = "Syncing";
      try {
        const r = await API.learningSuite.sync();
        if (r.errors.length) { const e = document.getElementById("ls-error"); e.textContent = r.errors.map(x => `${x.course_code}: ${x.error}`).join(" · "); e.classList.add("show"); }
        if (!r.courses_synced && r.courses_skipped && !r.errors.length) toast(`All classes were synced recently. ${cooldownTip(r.next_sync_at)}.`);
        else toast(`Synced ${r.assignments_synced} item${r.assignments_synced === 1 ? "" : "s"} from ${r.courses_synced} class${r.courses_synced === 1 ? "" : "es"}${removedNote(r.assignments_removed)}${r.courses_skipped ? ` · ${r.courses_skipped} synced recently, skipped` : ""}`, r.errors.length ? "error" : "success");
      } catch (err) {
        const e = document.getElementById("ls-error"); e.textContent = err.message; e.classList.add("show");
      }
      LS = await API.learningSuite.status();
      renderLearningSuite();
      refreshSyncStatus();
    });
  }
  API.learningSuite.status()
    .then(s => { LS = s; renderLearningSuite(); })
    .catch(() => { renderLearningSuite(); });

  /* ---------- State ---------- */
  const state = {
    days: new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]),
    minutes: new Set([180, 1440]),   // reminder points, stored in minutes before due
  };
  const saveButton = document.getElementById("save");
  const pushToggle = document.getElementById("push-on");
  const pushTestButton = document.getElementById("push-test");
  const pushStatus = document.getElementById("push-status");
  let pushConfig = null;
  saveButton.disabled = true;

  function setPushStatus(message) { pushStatus.textContent = message; }
  function base64UrlToBytes(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function connectThisBrowserToPush() {
    if (!window.isSecureContext) throw new Error("Push notifications need the secure HTTPS address. You can save reminder preferences now and enable push after HTTPS is ready.");
    if (!pushConfig?.enabled || !pushConfig.public_key) throw new Error("Push delivery is not configured on the server yet.");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("This browser does not support web push notifications.");
    }
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Allow notifications in your browser to enable push reminders.");

    await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(pushConfig.public_key),
      });
    }
    await API.notifications.subscribe(subscription.toJSON());
    setPushStatus("This browser is connected. Save changes to turn on push delivery.");
    return subscription.toJSON();
  }

  async function loadNotificationPreferences() {
    try {
      const [prefs, config, summary] = await Promise.all([
        API.notifications.preferences(),
        API.notifications.pushConfig(),
        API.notifications.summarySettings(),
      ]);
      pushConfig = config;
      state.minutes = new Set((prefs.reminder_minutes || []).map(Number));
      state.days = new Set((summary.days || []).map(day => DOW[Number(day)]).filter(Boolean));
      document.getElementById("summary-on").checked = summary.enabled;
      document.getElementById("summary-time").value = summary.send_time;
      document.getElementById("summary-range").value = summary.summary_range;
      document.getElementById("reminders-on").checked = prefs.assignment_reminders_enabled;
      document.getElementById("dnd-on").checked = prefs.quiet_hours_enabled;
      document.getElementById("dnd-start").value = prefs.quiet_hours_start;
      document.getElementById("dnd-end").value = prefs.quiet_hours_end;
      pushToggle.checked = prefs.push_enabled;
      toggleSection("summary-on", "summary-body");
      toggleSection("reminders-on", "reminders-body");
      toggleSection("dnd-on", "dnd-times");
      renderHours();
      renderDow();
      renderSummaryPreview();
      renderDndExample();

      if (!window.isSecureContext) {
        setPushStatus("Open this page over HTTPS to connect browser push. Reminder preferences can still be saved.");
      } else if (!config.enabled) {
        setPushStatus("Push delivery is not configured on the server yet. Reminder preferences can still be saved.");
      } else if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("This browser does not support web push notifications.");
      } else if (Notification.permission === "denied") {
        setPushStatus("Notifications are blocked by this browser. Allow them in browser settings to receive push.");
      } else {
        setPushStatus(prefs.push_subscription_count ? "Browser subscription saved." : "Turn this on to connect this browser to push.");
      }
      pushTestButton.disabled = !prefs.push_subscription_count || !config.enabled || !window.isSecureContext ||
        !("Notification" in window) || Notification.permission !== "granted" ||
        !("serviceWorker" in navigator) || !("PushManager" in window);
      pushToggle.disabled = false;
      saveButton.disabled = false;
    } catch (err) {
      setPushStatus(`Could not load saved reminder settings: ${err.message}`);
      toast("Could not load saved reminder settings", "error");
    }
  }

  /* Format a duration in minutes. adj=true gives the hyphenated adjective form ("3-hour"). */
  function fmtDur(min, adj = false) {
    let n, unit;
    if (min % 1440 === 0 && min >= 1440) { n = min / 1440; unit = "day"; }
    else if (min % 60 === 0) { n = min / 60; unit = adj ? "hour" : "hr"; }
    else if (min > 60) { return `${Math.floor(min / 60)}h ${min % 60}m`; }
    else { n = min; unit = "min"; }
    if (adj) return `${n}-${unit}`;
    return `${n} ${unit}${n === 1 || unit === "min" ? "" : "s"}`;
  }

  /* ---------- Day-of-week chips ---------- */
  const dowEl = document.getElementById("dow-chips");
  function renderDow() {
    dowEl.innerHTML = DOW.map(d => `<button type="button" class="chip ${state.days.has(d) ? "active" : ""}" data-day="${d}">${d}</button>`).join("");
    dowEl.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
      state.days.has(c.dataset.day) ? state.days.delete(c.dataset.day) : state.days.add(c.dataset.day);
      renderDow(); renderSummaryPreview();
    }));
  }

  /* ---------- Hours-before chips ---------- */
  const hoursEl = document.getElementById("hours-chips");
  const PRESETS = [15, 30, 60, 180, 360, 720, 1440, 2880];
  function renderHours() {
    const all = [...new Set([...PRESETS, ...state.minutes])].sort((a, b) => a - b);
    hoursEl.innerHTML = all.map(m => `<button type="button" class="chip ${state.minutes.has(m) ? "active" : ""}" data-m="${m}">${fmtDur(m)}</button>`).join("");
    hoursEl.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
      const m = Number(c.dataset.m);
      state.minutes.has(m) ? state.minutes.delete(m) : state.minutes.add(m);
      renderHours(); renderDndExample();
    }));
  }
  function addCustom() {
    const amt = Number(document.getElementById("custom-amount").value);
    const unit = Number(document.getElementById("custom-unit").value);
    if (amt > 0) {
      state.minutes.add(amt * unit);
      document.getElementById("custom-amount").value = "";
      renderHours(); renderDndExample();
      toast(`Added ${fmtDur(amt * unit)} reminder`, "success");
    }
  }
  document.getElementById("add-hours").addEventListener("click", addCustom);
  document.getElementById("custom-amount").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  /* ---------- Summary preview ---------- */
  function renderSummaryPreview() {
    const el = document.getElementById("summary-preview");
    const t = document.getElementById("summary-time").value;
    const [h, m] = t.split(":").map(Number);
    const time = fmtTime(new Date(2000, 0, 1, h, m));
    const days = DOW.filter(d => state.days.has(d));
    let dayText = days.length === 7 ? "every day" : days.length === 0 ? "on no days (select at least one)" : days.length === 5 && !state.days.has("Sat") && !state.days.has("Sun") ? "on weekdays" : `on ${days.join(", ")}`;
    const examples = {
      today: "You have 3 assignments due today.",
      today_tomorrow: "You have 3 assignments due today and 2 tomorrow.",
      next_7_days: "You have 5 assignments due in the next 7 days.",
    };
    const example = examples[document.getElementById("summary-range").value] || examples.today_tomorrow;
    el.innerHTML = `${ICONS.info}<div><strong>Preview:</strong> "${example}" arrives at <strong>${time}</strong> ${dayText} (Mountain Time).</div>`;
  }
  document.getElementById("summary-time").addEventListener("input", renderSummaryPreview);
  document.getElementById("summary-range").addEventListener("change", renderSummaryPreview);

  /* ---------- Quiet-hours example ----------
     Walk backwards from the due time one minute at a time.
     Minutes inside the quiet window don't count toward the "hours before" total. */
  function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  function inDnd(minOfDay, start, end) {
    if (start === end) return false;
    return start < end ? (minOfDay >= start && minOfDay < end) : (minOfDay >= start || minOfDay < end);
  }
  function computeReminder(dueMin, minutesBefore, dnd) {
    let cursor = dueMin;            // minutes since midnight of due day (can go negative = previous days)
    let remaining = minutesBefore;
    let guard = 0;
    while (remaining > 0 && guard++ < 60 * 24 * 14) {
      cursor -= 1;
      const mod = ((cursor % 1440) + 1440) % 1440;
      if (!dnd || !inDnd(mod, dnd.start, dnd.end)) remaining -= 1;
    }
    return cursor;
  }
  function labelFor(cursor) {
    const dayOffset = Math.floor(cursor / 1440);
    const mod = ((cursor % 1440) + 1440) % 1440;
    const time = fmtTime(new Date(2000, 0, 1, Math.floor(mod / 60), mod % 60));
    const dayLabel = dayOffset === 0 ? "the day it's due" : dayOffset === -1 ? "the day before" : `${-dayOffset} days before`;
    return { time, dayLabel };
  }

  function renderDndExample() {
    const el = document.getElementById("dnd-example");
    const tl = document.getElementById("dnd-timeline");
    const dndOn = document.getElementById("dnd-on").checked;
    document.getElementById("dnd-times").style.opacity = dndOn ? 1 : .45;
    document.getElementById("dnd-times").style.pointerEvents = dndOn ? "auto" : "none";

    const points = [...state.minutes].sort((a, b) => a - b);
    if (!points.length) { el.innerHTML = `${ICONS.info}<div>Select at least one reminder point to see an example.</div>`; tl.innerHTML = ""; return; }

    const start = toMin(document.getElementById("dnd-start").value);
    const end = toMin(document.getElementById("dnd-end").value);
    const dnd = dndOn ? { start, end } : null;
    const dueMin = 9 * 60; // Example: assignment due at 9:00 AM
    const h = points[0];

    const withDnd = labelFor(computeReminder(dueMin, h, dnd));
    const plain = labelFor(computeReminder(dueMin, h, null));

    let body = `<strong>Example:</strong> an assignment due at <strong>9:00 AM</strong> with a <strong>${fmtDur(h, true)}</strong> reminder `;
    if (dndOn) {
      const s = fmtTime(new Date(2000, 0, 1, Math.floor(start / 60), start % 60));
      const e = fmtTime(new Date(2000, 0, 1, Math.floor(end / 60), end % 60));
      body += `and quiet hours <strong>${s} to ${e}</strong> notifies you at <strong>${withDnd.time} ${withDnd.dayLabel}</strong>`;
      if (withDnd.time !== plain.time || withDnd.dayLabel !== plain.dayLabel) body += ` (instead of ${plain.time} ${plain.dayLabel}, which falls inside quiet hours).`;
      else body += `.`;
    } else {
      body += `notifies you at <strong>${plain.time} ${plain.dayLabel}</strong>.`;
    }
    if (points.length > 1) body += ` You also get reminders ${points.slice(1).map(x => fmtDur(x)).join(", ")} before.`;
    el.innerHTML = `${ICONS.info}<div>${body}</div>`;

    /* Timeline: from reminder to due, showing counted vs quiet segments */
    const startCursor = computeReminder(dueMin, h, dnd);
    const segs = [];
    let cur = startCursor, segStart = cur, curType = null;
    while (cur < dueMin) {
      const mod = ((cur % 1440) + 1440) % 1440;
      const type = dnd && inDnd(mod, dnd.start, dnd.end) ? "dnd" : "count";
      if (curType === null) curType = type;
      if (type !== curType) { segs.push({ type: curType, len: cur - segStart }); segStart = cur; curType = type; }
      cur += 1;
    }
    segs.push({ type: curType, len: cur - segStart });
    const total = dueMin - startCursor;
    tl.innerHTML = `
      <div class="timeline">${segs.map(s => `<div class="seg ${s.type}" style="flex:${s.len / total}" title="${s.type === "dnd" ? "Quiet hours (skipped)" : "Counts toward " + fmtDur(h)}"></div>`).join("")}</div>
      <div class="timeline-labels"><span>Reminder ${withDnd.time}</span>${dndOn && segs.some(s => s.type === "dnd") ? "<span>Striped = quiet hours skipped</span>" : ""}<span>Due 9:00 AM</span></div>`;
  }
  ["dnd-on", "dnd-start", "dnd-end"].forEach(id => document.getElementById(id).addEventListener("input", renderDndExample));

  /* ---------- Section toggles ---------- */
  function toggleSection(chk, body) {
    const on = document.getElementById(chk).checked;
    const el = document.getElementById(body);
    el.style.opacity = on ? 1 : .45;
    el.style.pointerEvents = on ? "auto" : "none";
  }
  document.getElementById("summary-on").addEventListener("change", () => {
    toggleSection("summary-on", "summary-body");
    renderSummaryPreview();
  });
  document.getElementById("reminders-on").addEventListener("change", () => {
    if (document.getElementById("reminders-on").checked && !state.minutes.size) {
      state.minutes.add(15);
      renderHours();
    }
    toggleSection("reminders-on", "reminders-body");
    renderDndExample();
  });
  pushToggle.addEventListener("change", async () => {
    if (!pushToggle.checked) {
      setPushStatus("Push delivery will turn off when you save changes.");
      return;
    }
    pushToggle.disabled = true;
    try {
      await connectThisBrowserToPush();
      pushTestButton.disabled = false;
    } catch (err) {
      pushToggle.checked = false;
      setPushStatus(err.message);
      toast(err.message, "error");
    } finally {
      pushToggle.disabled = false;
    }
  });

  pushTestButton.addEventListener("click", async () => {
    pushTestButton.disabled = true;
    try {
      const subscription = await connectThisBrowserToPush();
      await API.notifications.sendTest(subscription.endpoint);
      setPushStatus("Push service accepted the test for this browser. If nothing appears, allow Google Chrome notifications and banners in system settings and check Focus / Do Not Disturb.");
      toast("Test submitted for this browser", "success");
    } catch (err) {
      setPushStatus(err.message);
      toast(err.message, "error");
    } finally {
      pushTestButton.disabled = !pushToggle.checked;
    }
  });

  saveButton.textContent = "Save notification settings";
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      await API.notifications.saveSummarySettings({
        enabled: document.getElementById("summary-on").checked,
        days: DOW.map((day, index) => state.days.has(day) ? index : null).filter(day => day !== null),
        send_time: document.getElementById("summary-time").value,
        summary_range: document.getElementById("summary-range").value,
      });
      await API.notifications.savePreferences({
        reminder_minutes: document.getElementById("reminders-on").checked ? [...state.minutes].sort((a, b) => a - b) : [],
        quiet_hours_enabled: document.getElementById("dnd-on").checked,
        quiet_hours_start: document.getElementById("dnd-start").value,
        quiet_hours_end: document.getElementById("dnd-end").value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver",
        push_enabled: pushToggle.checked,
      });
      if (!pushToggle.checked) {
        const registration = await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) await subscription.unsubscribe();
        await API.notifications.removeSubscriptions();
        pushTestButton.disabled = true;
      }
      setPushStatus(pushToggle.checked ? "Browser push delivery is enabled for this account." : "Browser push delivery is turned off.");
      toast("Notification settings saved", "success");
    } catch (err) {
      toast(err.message, "error");
      setPushStatus(err.message);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save notification settings";
    }
  });

  renderDow();
  renderHours();
  renderSummaryPreview();
  renderDndExample();
  loadNotificationPreferences();
}
