/** Reject the request with 401 unless the session has a logged-in user. */
export function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}
