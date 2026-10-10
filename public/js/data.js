/* ---------- Sample data (front-end only) ----------
   Classes, assignments, and assignment types now come from the database (see
   app.js initApp). What's left here is still mock. */

/* Free-text submission types offered in the assignment form. The column is
   free text, so anything a synced assignment brings in is shown as-is. */
const SUBMISSION_TYPES = ["Online upload", "Online quiz", "Text entry", "Discussion board", "External tool", "In class", "Testing Center", "No submission"];

/* Sample Canvas course list (what a connected Canvas account would return).
   The add-class modal offers these when Source = Canvas. A future milestone
   replaces this with a fetch from the Canvas API via connected_account. */
const CANVAS_COURSES = [
  { external_course_id: "canvas-10231", course_code: "IS 401",   course_name: "Systems Design & Implementation" },
  { external_course_id: "canvas-10455", course_code: "IS 403",   course_name: "Principles of Business" },
  { external_course_id: "canvas-10988", course_code: "STAT 121", course_name: "Principles of Statistics" },
  { external_course_id: "canvas-11204", course_code: "MKTG 201", course_name: "Marketing Management" },
  { external_course_id: "canvas-11377", course_code: "ECON 110", course_name: "Economic Principles and Problems" },
  { external_course_id: "canvas-11502", course_code: "CS 142",   course_name: "Introduction to Computer Programming" },
];

/* The current check-in streak is not tracked yet; the best values come from the user row. */
const STREAKS = {
  checkInCurrent: 23,
};
