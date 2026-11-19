/* Assignment types, shared by the syncs and the admin page.

   The syncs guess a type from keywords and then look the row up BY NAME
   (TYPE_PATTERNS in canvas.js, BUCKETS in learningsuite.js), so the seed
   names below are lookup keys: the admin API refuses to rename or delete
   them. "other" is the no-type bucket. Types an admin adds are free to edit;
   they reach students through the assignment form, the AI categorizer's
   allowed list, and matchTypeName below. */

export const BUILT_IN_TYPES = ["homework", "quiz", "exam", "paper", "project", "reading", "discussion", "other"];

export function isBuiltInType(name) {
  return BUILT_IN_TYPES.includes(String(name || "").toLowerCase());
}

const NAME_RE = /^[a-z0-9][a-z0-9 -]{0,49}$/;

/* Trim, collapse spaces and lowercase (the seed rows are lowercase).
   Throws a 400-style error on bad input. */
export function cleanTypeName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!name) throw bad("Enter a name for the type");
  if (name.length > 50) throw bad("Type names must be 50 characters or fewer");
  if (!NAME_RE.test(name)) throw bad("Type names can only use letters, numbers, spaces, and dashes");
  return name;
}

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/* Which of `names` (the admin-added types) appears in `text` as whole words,
   case-insensitively. The longest match wins, so "lab report" beats "lab".
   Null when none does. */
export function matchTypeName(text, names) {
  const t = String(text || "").toLowerCase();
  if (!t || !names || !names.length) return null;
  let best = null;
  for (const name of names) {
    const n = String(name || "").toLowerCase();
    if (!n || (best && n.length <= best.length)) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(n)}($|[^a-z0-9])`);
    if (re.test(t)) best = n;
  }
  return best;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* The admin-added names in a name -> id map (the syncs' typeIds). */
export function customTypeNames(typeIds) {
  return Object.keys(typeIds || {}).filter(n => !isBuiltInType(n));
}
