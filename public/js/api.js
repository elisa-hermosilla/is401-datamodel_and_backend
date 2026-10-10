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

  lmsSources: () => apiFetch("/api/lms-sources"),

  courses: {
    list: () => apiFetch("/api/courses"),
    create: fields => apiFetch("/api/courses", { method: "POST", body: fields }),
    update: (id, fields) => apiFetch(`/api/courses/${id}`, { method: "PUT", body: fields }),
    remove: id => apiFetch(`/api/courses/${id}`, { method: "DELETE" }),
  },
};
