/* ---------- Thin wrappers around fetch('/api/...') ----------
   One helper: sends/receives JSON with the session cookie, and throws an
   Error whose message is the server's `error` field on any non-2xx response,
   so page code can `try { await API.x() } catch (e) { show(e.message) }`. */

async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const API = {
  login: (identifier, password) => apiFetch("/api/login", { method: "POST", body: { identifier, password } }),
  logout: () => apiFetch("/api/logout", { method: "POST" }),
  me: () => apiFetch("/api/me"),
  register: fields => apiFetch("/api/register", { method: "POST", body: fields }),
  changePassword: (current_password, new_password) =>
    apiFetch("/api/change-password", { method: "POST", body: { current_password, new_password } }),

  lmsSources: () => apiFetch("/api/lms-sources"),

  courses: {
    list: () => apiFetch("/api/courses"),
    create: fields => apiFetch("/api/courses", { method: "POST", body: fields }),
    update: (id, fields) => apiFetch(`/api/courses/${id}`, { method: "PUT", body: fields }),
    remove: id => apiFetch(`/api/courses/${id}`, { method: "DELETE" }),
    categories: id => apiFetch(`/api/courses/${id}/categories`),
    discoverCategories: id => apiFetch(`/api/courses/${id}/categories/discover`, { method: "POST" }),
    saveCategories: (id, categories) => apiFetch(`/api/courses/${id}/categories`, { method: "PUT", body: { categories } }),
    sync: id => apiFetch(`/api/courses/${id}/sync`, { method: "POST" }),
  },

  assignmentTypes: () => apiFetch("/api/assignment-types"),

  learningSuite: {
    preview: ics_feed_url => apiFetch("/api/learning-suite/preview", { method: "POST", body: { ics_feed_url } }),
    status: () => apiFetch("/api/learning-suite/status"),
    sync: () => apiFetch("/api/learning-suite/sync", { method: "POST" }),
  },

  sync: {
    status: () => apiFetch("/api/sync/status"),
    run: () => apiFetch("/api/sync", { method: "POST" }),
  },

  canvas: {
    status: () => apiFetch("/api/canvas/status"),
    connect: access_token => apiFetch("/api/canvas/connect", { method: "POST", body: { access_token } }),
    disconnect: () => apiFetch("/api/canvas/connect", { method: "DELETE" }),
    courses: () => apiFetch("/api/canvas/courses"),
    sync: () => apiFetch("/api/canvas/sync", { method: "POST" }),
  },

  assignments: {
    list: () => apiFetch("/api/assignments"),
    create: fields => apiFetch("/api/assignments", { method: "POST", body: fields }),
    update: (id, fields) => apiFetch(`/api/assignments/${id}`, { method: "PUT", body: fields }),
    remove: id => apiFetch(`/api/assignments/${id}`, { method: "DELETE" }),
    reorder: ids => apiFetch("/api/assignments/reorder", { method: "POST", body: { assignment_ids: ids } }),
  },
};
