/* ---------- Sample data (front-end only) ----------
   Classes come from the database (see app.js initApp -> CLASSES).
   Assignments are still sample data for this milestone. Each one points at a
   class by course_code, so it shows up under whichever of the logged-in user's
   classes has that code; assignments for codes the user doesn't have are hidden.

   Due dates are stored as day offsets from "today" so the demo always looks
   current no matter when it is opened. A future milestone replaces ASSIGNMENTS
   with a fetch and keeps this shape (course_code, title, type, submission,
   due, minutes, done, notes). */

const ASSIGNMENT_TYPES = ["Homework", "Quiz", "Exam", "Project", "Reading", "Discussion", "Paper", "Lab"];
const SUBMISSION_TYPES = ["Online upload", "Online quiz", "Text entry", "Discussion board", "External tool", "In class", "Testing Center", "No submission"];

/* offset: days from today (negative = past). time: 24h "HH:MM". minutes: estimated effort. */
const ASSIGNMENTS = [
  { id: 1,  course_code: "ACC 200",   title: "Ch. 6 Problem Set",              type: "Homework",   submission: "External tool",    offset: -2, time: "23:59", minutes: 60,  done: false, notes: "Connect problems 6-3 through 6-9. Unlimited attempts." },
  { id: 2,  course_code: "STAT 121",  title: "Lab 5: Sampling Distributions",  type: "Lab",        submission: "Online upload",    offset: -1, time: "17:00", minutes: 60,  done: false, notes: "" },
  { id: 3,  course_code: "IS 401",    title: "Design Sprint Prototype",        type: "Project",    submission: "Online upload",    offset: 0,  time: "23:59", minutes: 180, done: false, notes: "Submit the GitHub link plus a 2-minute walkthrough." },
  { id: 4,  course_code: "REL A 275", title: "Alma 32-34 Reading Response",    type: "Reading",    submission: "Text entry",       offset: 0,  time: "09:00", minutes: 30,  done: true,  notes: "" },
  { id: 5,  course_code: "IS 402",    title: "Quiz 4: REST & Controllers",     type: "Quiz",       submission: "Online quiz",      offset: 1,  time: "12:00", minutes: 20,  done: false, notes: "Open note, 20 minutes, one attempt." },
  { id: 6,  course_code: "STAT 121",  title: "Homework 7",                     type: "Homework",   submission: "Online upload",    offset: 1,  time: "23:59", minutes: 90,  done: false, notes: "" },
  { id: 7,  course_code: "ACC 200",   title: "Midterm 1",                      type: "Exam",       submission: "Testing Center",   offset: 3,  time: "14:00", minutes: 240, done: false, notes: "Covers ch. 1-6. Bring a calculator. Testing Center closes at 10 pm; last entry 8 pm." },
  { id: 8,  course_code: "IS 401",    title: "User Testing Discussion Post",   type: "Discussion", submission: "Discussion board", offset: 3,  time: "23:59", minutes: 45,  done: false, notes: "" },
  { id: 9,  course_code: "IS 402",    title: "Sprint 3 Deliverable",           type: "Project",    submission: "Online upload",    offset: 5,  time: "23:59", minutes: 150, done: false, notes: "" },
  { id: 10, course_code: "REL A 275", title: "Doctrinal Mastery Quiz",         type: "Quiz",       submission: "Online quiz",      offset: 6,  time: "09:00", minutes: 15,  done: false, notes: "" },
  { id: 11, course_code: "STAT 121",  title: "Homework 8",                     type: "Homework",   submission: "Online upload",    offset: 8,  time: "23:59", minutes: 90,  done: false, notes: "" },
  { id: 12, course_code: "IS 401",    title: "Requirements Document",          type: "Paper",      submission: "Online upload",    offset: 10, time: "23:59", minutes: 120, done: false, notes: "" },
  { id: 13, course_code: "ACC 200",   title: "Ch. 7 Problem Set",              type: "Homework",   submission: "External tool",    offset: 12, time: "23:59", minutes: 60,  done: false, notes: "" },
  { id: 14, course_code: "IS 402",    title: "Quiz 5: Authentication",         type: "Quiz",       submission: "Online quiz",      offset: 14, time: "12:00", minutes: 20,  done: false, notes: "" },
  { id: 15, course_code: "REL A 275", title: "Personal Application Paper",     type: "Paper",      submission: "Online upload",    offset: 17, time: "23:59", minutes: 120, done: false, notes: "" },
  { id: 16, course_code: "STAT 121",  title: "Exam 2",                         type: "Exam",       submission: "Testing Center",   offset: 21, time: "10:00", minutes: 180, done: false, notes: "" },
  { id: 17, course_code: "IS 401",    title: "Final Presentation",             type: "Project",    submission: "In class",         offset: 27, time: "15:00", minutes: 120, done: false, notes: "" },
  { id: 18, course_code: "IS 402",    title: "Sprint 4 Deliverable",           type: "Project",    submission: "Online upload",    offset: 19, time: "23:59", minutes: 150, done: false, notes: "" },
  { id: 19, course_code: "ACC 200",   title: "Ch. 5 Problem Set",              type: "Homework",   submission: "External tool",    offset: -9, time: "23:59", minutes: 60,  done: true,  notes: "" },
  { id: 20, course_code: "IS 401",    title: "Wireframes",                     type: "Project",    submission: "Online upload",    offset: -7, time: "23:59", minutes: 90,  done: true,  notes: "" },
  { id: 21, course_code: "Personal",  title: "Meet with career advisor",       type: "Homework",   submission: "No submission",    offset: 5,  time: "15:00", minutes: 30,  done: false, notes: "Bring resume." },
  { id: 22, course_code: "Personal",  title: "Book TA appointment",            type: "Homework",   submission: "No submission",    offset: 2,  time: "12:00", minutes: 10,  done: false, notes: "" },
  { id: 23, course_code: "IS 403",    title: "Business strategy case study",   type: "Paper",      submission: "Online upload",    offset: 1,  time: "23:59", minutes: 90,  done: false, notes: "Read the case and highlight key decisions." },
  { id: 24, course_code: "IS 403",    title: "Team research project",          type: "Project",    submission: "Online upload",    offset: 11, time: "23:59", minutes: 360, done: false, notes: "" },
  { id: 25, course_code: "IS 404",    title: "Power BI dashboard draft",       type: "Project",    submission: "Online upload",    offset: 2,  time: "23:59", minutes: 150, done: false, notes: "" },
  { id: 26, course_code: "IS 404",    title: "ETL lab",                        type: "Lab",        submission: "Online upload",    offset: -4, time: "23:59", minutes: 90,  done: false, notes: "" },
  { id: 27, course_code: "FIN 201",   title: "Problem Set 4",                  type: "Homework",   submission: "External tool",    offset: 4,  time: "23:59", minutes: 75,  done: false, notes: "" },
  { id: 28, course_code: "FIN 201",   title: "Midterm",                        type: "Exam",       submission: "Testing Center",   offset: 14, time: "09:00", minutes: 240, done: false, notes: "" },
];

const STREAKS = {
  noPastDueBest: 18,
  checkInCurrent: 23,
  checkInBest: 41,
};
