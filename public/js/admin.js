/* Admin page: the user list with admin toggles, and the two OKRs
   (retention and quick-start setup). Data comes from /api/admin/*. */

initApp("admin").then(main);

const SERIES_COLOR = "#245b91";

function main() {
  const shell = document.getElementById("settings-shell");
  const selectCategory = bindCategoryNav(shell, { defaultKey: "okrs" });

  /* The Admin tour (lightbulb -> "Admin page"). Steps switch to the panel
     they describe; the one you were on comes back at the end. */
  window.PAGE_TOUR = async () => {
    const was = shell.querySelector("[data-settings-category].active")?.dataset.settingsCategory || "okrs";
    const hadDetail = shell.classList.contains("show-detail");
    await startWalkthrough(adminTourSteps(), { kicker: "Admin tour" });
    selectCategory(was);
    if (!hadDetail) shell.classList.remove("show-detail");
  };
  function adminTourSteps() {
    const go = key => () => selectCategory(key);
    return [
      { target: ".page-header", title: "Admin", text: [
        "This page is for the people who run DueList: who has admin access, and how the app is doing against its goals.",
      ] },
      { target: "#okr-objective-1", title: "Objectives and key results", enter: go("okrs"), text: [
        "Two objectives, each with two key results. The cards show where DueList stands on each one.",
      ] },
      { target: "#kr-tutorial", title: "Time to activate", enter: go("okrs"), text: [
        "How long new accounts take from signing up to finishing the navigation tutorial. The target is under 24 hours.",
        "The bars show how that time is spread out.",
      ] },
      { target: "#kr-sync", title: "First sync", enter: go("okrs"), text: [
        "How long from sign-up to the first time an account's classes sync. The target is 15 minutes or less.",
      ] },
      { target: "#kr-churn", title: "First-month churn", enter: go("okrs"), text: [
        "An account churns if it goes 7 days without a visit during its first month. The target is to keep this below 33%.",
        "The chart shows the rate as of each day; pick the range above the cards.",
      ] },
      { target: "#kr-streaks", title: "5-day streaks", enter: go("okrs"), text: [
        "Each time someone checks in five days in a row counts once. Weekends off don't break a run; a missed weekday does.",
        "The chart is the running total.",
      ] },
      { target: ".user-tools", title: "Find a user", enter: go("users"), text: [
        "Search by name, username or email, and narrow the list to admins or non-admins.",
      ] },
      { target: () => document.querySelector(".admin-user-row"), fallback: "#user-list", title: "Admin access", enter: go("users"), text: [
        "Make admin gives someone this page and the ability to promote others. Remove admin takes it away.",
        "You can't remove your own access, so there is always at least one admin.",
      ] },
    ];
  }
  loadUsers();
  loadOkrs();
  document.getElementById("okr-range").addEventListener("change", loadOkrs);
  document.getElementById("user-search").addEventListener("input", renderUsers);
  document.querySelectorAll("#user-filter .chip").forEach(chip => chip.addEventListener("click", () => {
    document.querySelectorAll("#user-filter .chip").forEach(c => {
      const on = c === chip;
      c.classList.toggle("active", on);
      c.setAttribute("aria-pressed", String(on));
    });
    renderUsers();
  }));
  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(redrawCharts, 120); };
  window.addEventListener("resize", onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(document.getElementById("admin-okrs"));
}

/* ---------- Users ---------- */

let USERS = [];

async function loadUsers() {
  const list = document.getElementById("user-list");
  try {
    USERS = await API.admin.users();
  } catch (e) {
    list.innerHTML = `<p class="sub">${esc(e.message)}</p>`;
    return;
  }
  renderUsers();
}

function fullName(u) { return `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username; }

/* The rows that match the search box and the All / Admins / Non-admins chips */
function visibleUsers() {
  const q = document.getElementById("user-search").value.trim().toLowerCase();
  const filter = document.querySelector("#user-filter .chip.active")?.dataset.filter || "all";
  return USERS.filter(u => {
    if (filter === "admin" && !u.is_admin) return false;
    if (filter === "non-admin" && u.is_admin) return false;
    if (!q) return true;
    return [fullName(u), u.username, u.email || ""].some(v => v.toLowerCase().includes(q));
  });
}

function renderUsers() {
  const list = document.getElementById("user-list");
  const admins = USERS.filter(u => u.is_admin).length;
  const shown = visibleUsers();
  const count = shown.length === USERS.length ? plural(USERS.length, "account") : `${shown.length} of ${plural(USERS.length, "account")}`;
  document.getElementById("users-sub").textContent =
    `${count} · ${plural(admins, "admin")}. Admins can open this page and grant or remove admin access.`;
  if (!shown.length) {
    list.innerHTML = '<p class="sub admin-empty">No users match.</p>';
    return;
  }
  list.innerHTML = shown.map(u => {
    const me = u.user_id === USER.user_id;
    const joined = new Date(u.created_at);
    const facts = [
      u.email || "",
      `Joined ${MONTHS[joined.getMonth()].slice(0, 3)} ${joined.getDate()}, ${joined.getFullYear()}`,
      `Last sign-in ${relTime(u.last_login_at)}`,
      u.onboarding_completed_at ? "Quick start done" : "Quick start not finished",
    ].filter(Boolean);
    const tag = u.is_admin ? `<span class="tag type admin-tag">${me ? "You · Admin" : "Admin"}</span>` : "";
    const button = me ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-toggle-admin="${u.user_id}">${u.is_admin ? "Remove admin" : "Make admin"}</button>`;
    return `<div class="admin-user-row">
      <div class="info">
        <div class="t">${esc(fullName(u))} <span class="admin-username">${esc(u.username)}</span></div>
        <div class="d">${facts.map(esc).join(" · ")}</div>
      </div>
      <div class="control">${tag}${button}</div>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-toggle-admin]").forEach(btn => btn.addEventListener("click", () => toggleAdmin(Number(btn.dataset.toggleAdmin), btn)));
}

async function toggleAdmin(id, btn) {
  const u = USERS.find(x => x.user_id === id);
  if (!u) return;
  const name = fullName(u);
  if (u.is_admin && !window.confirm(`Remove admin access from ${name}? They will no longer see the Admin page.`)) return;
  btn.disabled = true;
  try {
    const updated = await API.admin.setAdmin(id, !u.is_admin);
    Object.assign(u, updated);
    toast(updated.is_admin ? `${name} is now an admin` : `${name} is no longer an admin`, "success");
    renderUsers();
  } catch (e) {
    btn.disabled = false;
    toast(e.message, "error");
  }
}

/* ---------- OKRs ---------- */

let OKRS = null;

async function loadOkrs() {
  const days = Number(document.getElementById("okr-range").value);
  document.querySelectorAll(".okr-chart").forEach(f => f.classList.add("loading"));
  try {
    OKRS = await API.admin.okrs(days);
  } catch (e) {
    toast(e.message, "error");
    return;
  } finally {
    document.querySelectorAll(".okr-chart").forEach(f => f.classList.remove("loading"));
  }
  renderOkrs();
}

function tile(label, value, foot) {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="foot">${esc(foot)}</div></div>`;
}

function pct(n) { return `${Math.round(n)}%`; }
function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

/* "under a minute", "12 min", "1 hr 20 min", "2.5 days" */
function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return m ? `${h} hr ${m} min` : plural(h, "hr");
  }
  const d = minutes / 1440;
  return `${d >= 10 ? Math.round(d) : Math.round(d * 10) / 10} days`;
}

function meters(id, buckets, unit = "user") {
  const max = Math.max(1, ...buckets.map(b => b.count));
  document.getElementById(id).innerHTML = buckets.map(b => `
    <div class="meter-row">
      <div class="meter-label">${esc(b.label)}</div>
      <div class="meter-track" aria-hidden="true"><div class="meter-fill" style="width:${(b.count / max * 100).toFixed(1)}%"></div></div>
      <div class="meter-value">${plural(b.count, unit)}</div>
    </div>`).join("");
}

/* Two objectives, two key results each (see server/okrs.js for the maths) */
function renderOkrs() {
  const { tutorial, first_sync } = OKRS.activation;
  const { churn, streaks } = OKRS.retention;

  document.getElementById("kr-tutorial-tiles").innerHTML =
    tile("Under 24 hours", pct(tutorial.under_24h_pct), `${tutorial.under_24h} of ${plural(tutorial.finished, "finisher")}`) +
    tile("Median time", fmtDuration(tutorial.median_minutes), "sign-up to done") +
    tile("Not finished", String(tutorial.total - tutorial.finished), `of ${plural(tutorial.total, "account")}`);
  meters("kr-tutorial-buckets", tutorial.buckets);

  document.getElementById("kr-sync-tiles").innerHTML =
    tile("Within 15 min", pct(first_sync.within_15_pct), `${first_sync.within_15} of ${first_sync.synced} synced`) +
    tile("Median time", fmtDuration(first_sync.median_minutes), "sign-up to sync") +
    tile("No sync yet", String(first_sync.total - first_sync.synced), `of ${plural(first_sync.total, "account")}`);
  meters("kr-sync-buckets", first_sync.buckets);

  document.getElementById("kr-churn-tiles").innerHTML =
    tile("Churn rate", pct(churn.churn_pct), `${churn.churned} of ${plural(churn.cohort, "account")}`) +
    tile("Churned", String(churn.churned), "7 days no visit") +
    tile("Still active", String(churn.active), "in first month");
  const chip = document.getElementById("kr-churn-target");
  chip.classList.toggle("met", churn.cohort > 0 && churn.churn_pct < 33);
  chip.classList.toggle("missed", churn.cohort > 0 && churn.churn_pct >= 33);

  document.getElementById("kr-streaks-tiles").innerHTML =
    tile("5-day streaks", String(streaks.count), "runs reaching 5") +
    tile("Users with one", String(streaks.users_with_one), `of ${streaks.users_total} active`) +
    tile("Logins per user", streaks.avg_login_days.toFixed(1), "avg days so far");

  redrawCharts();
}

function redrawCharts() {
  if (!OKRS) return;
  const { churn, streaks } = OKRS.retention;
  drawLineChart(document.querySelector("#chart-churn .okr-chart-body"), churn.series, {
    value: p => p.churn_pct, max: 100, ticks: [0, 25, 50, 75, 100],
    fmt: v => `${Math.round(v)}%`,
    detail: p => `${p.churned} of ${plural(p.cohort, "account")}`,
  });
  const last = streaks.series.length ? streaks.series[streaks.series.length - 1].count : 0;
  const top = Math.max(4, Math.ceil(last / 4) * 4);
  drawLineChart(document.querySelector("#chart-streaks .okr-chart-body"), streaks.series, {
    value: p => p.count, max: top, ticks: [0, top / 4, top / 2, top * 3 / 4, top],
    fmt: v => String(Math.round(v)),
    detail: p => plural(p.count, "streak") + " so far",
  });
}

/* ---------- Line chart ----------
   One series, drawn into `host` as an SVG sized to the host's box (the
   cards stretch to fill the screen, so the height comes from layout). A
   crosshair follows the pointer (or the arrow keys when the chart has
   focus) and a tooltip shows that day's value. */

function drawLineChart(host, series, { value, max, ticks, fmt, detail }) {
  host.replaceChildren();
  if (!series.length) { host.innerHTML = '<p class="sub">No data yet.</p>'; return; }
  const W = Math.max(260, host.clientWidth || 600), H = Math.max(120, host.clientHeight || 160);
  const M = { top: 14, right: 48, bottom: 26, left: 36 };
  const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
  const n = series.length;
  const x = i => M.left + (n === 1 ? pw / 2 : i / (n - 1) * pw);
  const y = v => M.top + ph - Math.min(v, max) / max * ph;
  const svgNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, text) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg", tabindex: "0", role: "img" });
  svg.setAttribute("aria-label", `${host.closest("figure").querySelector("figcaption").textContent}. Latest value ${fmt(value(series[n - 1]))}.`);

  // gridlines + y labels
  for (const t of ticks) {
    svg.appendChild(el("line", { x1: M.left, x2: W - M.right, y1: y(t), y2: y(t), class: "chart-grid" }));
    svg.appendChild(el("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end", class: "chart-axis" }, fmt(t)));
  }
  // x labels: first, last and a few in between
  const labelCount = Math.min(n, Math.max(2, Math.floor(pw / 90)));
  const used = new Set();
  for (let k = 0; k < labelCount; k++) {
    const i = labelCount === 1 ? 0 : Math.round(k / (labelCount - 1) * (n - 1));
    if (used.has(i)) continue;
    used.add(i);
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    svg.appendChild(el("text", { x: x(i), y: H - 8, "text-anchor": anchor, class: "chart-axis" }, shortDate(series[i].day)));
  }
  // area wash + line
  const pts = series.map((p, i) => [x(i), y(value(p))]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  svg.appendChild(el("path", { d: `${d} L${pts[n - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`, fill: SERIES_COLOR, "fill-opacity": "0.1" }));
  svg.appendChild(el("path", { d, fill: "none", stroke: SERIES_COLOR, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  // end marker + end label
  const [ex, ey] = pts[n - 1];
  svg.appendChild(el("circle", { cx: ex, cy: ey, r: 6, fill: "#fff" }));
  svg.appendChild(el("circle", { cx: ex, cy: ey, r: 4, fill: SERIES_COLOR }));
  svg.appendChild(el("text", { x: ex + 10, y: ey + 4, class: "chart-end-label" }, fmt(value(series[n - 1]))));

  // hover layer
  const hair = el("line", { y1: M.top, y2: M.top + ph, class: "chart-hair", visibility: "hidden" });
  const ring = el("circle", { r: 6, fill: "#fff", visibility: "hidden" });
  const dot = el("circle", { r: 4, fill: SERIES_COLOR, visibility: "hidden" });
  const hit = el("rect", { x: M.left, y: 0, width: pw, height: H, fill: "transparent" });
  svg.append(hair, ring, dot, hit);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  host.append(svg, tip);

  let current = n - 1;
  function show(i) {
    const p = series[i], [px, py] = pts[i];
    hair.setAttribute("x1", px); hair.setAttribute("x2", px);
    for (const c of [ring, dot]) { c.setAttribute("cx", px); c.setAttribute("cy", py); c.setAttribute("visibility", "visible"); }
    hair.setAttribute("visibility", "visible");
    tip.replaceChildren();
    const strong = document.createElement("strong"); strong.textContent = fmt(value(p));
    const date = document.createElement("div"); date.className = "chart-tip-date"; date.textContent = longDate(p.day);
    const sub = document.createElement("div"); sub.className = "chart-tip-sub"; sub.textContent = detail(p);
    tip.append(date, strong, sub);
    tip.hidden = false;
    const scale = host.clientWidth / W || 1;
    const left = px * scale;
    tip.style.left = `${left}px`;
    tip.style.top = `${py * scale}px`;
    tip.classList.toggle("flip", left > host.clientWidth * 0.65);
    current = i;
  }
  function hide() {
    for (const c of [hair, ring, dot]) c.setAttribute("visibility", "hidden");
    tip.hidden = true;
  }
  hit.addEventListener("pointermove", e => {
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    show(Math.max(0, Math.min(n - 1, Math.round((px - M.left) / pw * (n - 1)))));
  });
  hit.addEventListener("pointerleave", hide);
  svg.addEventListener("focus", () => show(current));
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(Math.max(0, current - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); show(Math.min(n - 1, current + 1)); }
    if (e.key === "Home") { e.preventDefault(); show(0); }
    if (e.key === "End") { e.preventDefault(); show(n - 1); }
  });
}

/* "Nov 3" / "Nov 3, 2026" from a YYYY-MM-DD string, without timezone shifts */
function partsOf(day) { const [y, m, d] = day.split("-").map(Number); return { y, m, d }; }
function shortDate(day) { const { m, d } = partsOf(day); return `${MONTHS[m - 1].slice(0, 3)} ${d}`; }
function longDate(day) { const { y, m, d } = partsOf(day); return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`; }
