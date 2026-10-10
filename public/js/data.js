/* ---------- Sample data (front-end only) ----------
   Classes, assignments, and assignment types now come from the database (see
   app.js initApp). What's left here is still mock. */

/* Free-text submission types offered in the assignment form. The column is
   free text, so anything a synced assignment brings in is shown as-is. */
const SUBMISSION_TYPES = ["Online upload", "Online quiz", "Text entry", "Discussion board", "External tool", "In class", "Testing Center", "No submission"];

/* The current check-in streak is not tracked yet; the best values come from the user row. */
const STREAKS = {
  checkInCurrent: 23,
};
