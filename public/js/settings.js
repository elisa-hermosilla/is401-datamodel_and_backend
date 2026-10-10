/* Settings. Still a mockup for this milestone: nothing here is saved to the API. */

initApp("settings").then(main);

function main() {
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
      toast("Password changed");
    } catch (err) {
      fail(err.message);
    } finally {
      pwBtn.disabled = false;
    }
  });

  /* Real user bits in otherwise-mock cards */
  document.getElementById("delivery-email").textContent = USER.email || "No email on file";
  const count = name => CLASSES.filter(c => c.source === name).length;
  document.getElementById("canvas-detail").textContent = `Last synced 4 minutes ago · ${count("Canvas")} course${count("Canvas") === 1 ? "" : "s"}`;
  document.getElementById("ls-detail").textContent = `Last synced 4 minutes ago · ${count("Learning Suite")} course${count("Learning Suite") === 1 ? "" : "s"}`;

  /* ---------- State ---------- */
  const state = {
    days: new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]),
    minutes: new Set([180, 1440]),   // reminder points, stored in minutes before due
  };

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
      toast(`Added ${fmtDur(amt * unit)} reminder`);
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
    el.innerHTML = `${ICONS.info}<div><strong>Preview:</strong> "You have 3 assignments due today and 2 tomorrow." arrives at <strong>${time}</strong> ${dayText}.</div>`;
  }
  document.getElementById("summary-time").addEventListener("input", renderSummaryPreview);

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
  document.getElementById("summary-on").addEventListener("change", () => toggleSection("summary-on", "summary-body"));
  document.getElementById("reminders-on").addEventListener("change", () => toggleSection("reminders-on", "reminders-body"));

  document.getElementById("save").addEventListener("click", () => toast("Settings saved (not persisted yet)"));

  renderDow();
  renderHours();
  renderSummaryPreview();
  renderDndExample();
}
