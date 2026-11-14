/* Admin page: the user list with admin toggles, and the two OKRs
   (retention and quick-start setup). Data comes from /api/admin/*. */

initApp("admin").then(main);

const SERIES_COLOR = "#245b91";

function main() {
  bindCategoryNav(document.getElementById("settings-shell"), { defaultKey: "okrs" });
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
  renderRetention();
  renderSetup();
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

function renderRetention() {
  const r = OKRS.retention;
  document.getElementById("retention-tiles").innerHTML =
    tile("Active in the past 30 days", pct(r.active_pct), `${r.active_users} of ${plural(r.total_users, "account")}`) +
    tile("Days per week", r.avg_days_per_week.toFixed(1), "average among active users") +
    tile("Accounts", String(r.total_users), "registered so far");
  redrawCharts();
}

function redrawCharts() {
  if (!OKRS) return;
  const s = OKRS.retention.series;
  drawLineChart(document.querySelector("#chart-active .okr-chart-body"), s, {
    value: p => p.active_pct, max: 100, ticks: [0, 25, 50, 75, 100],
    fmt: v => `${Math.round(v)}%`,
    detail: p => `${p.active_users} of ${plural(p.total_users, "account")}`,
  });
  drawLineChart(document.querySelector("#chart-days .okr-chart-body"), s, {
    value: p => p.avg_days_per_week, max: 7, ticks: [0, 2, 4, 6],
    fmt: v => v.toFixed(1),
    detail: p => plural(p.active_users, "active user"),
  });
}

function renderSetup() {
  const s = OKRS.setup;
  document.getElementById("setup-tiles").innerHTML =
    tile("Finished the quick start", pct(s.completion_pct), `${s.completed_users} of ${plural(s.total_users, "account")}`) +
    tile("Average time", fmtDuration(s.avg_minutes), "account created to Finish") +
    tile("Median time", fmtDuration(s.median_minutes), "half finish faster than this");
  const max = Math.max(1, ...s.buckets.map(b => b.count));
  document.getElementById("setup-buckets").innerHTML = s.buckets.map(b => `
    <div class="meter-row">
      <div class="meter-label">${esc(b.label)}</div>
      <div class="meter-track" aria-hidden="true"><div class="meter-fill" style="width:${(b.count / max * 100).toFixed(1)}%"></div></div>
      <div class="meter-value">${plural(b.count, "user")}</div>
    </div>`).join("");
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
