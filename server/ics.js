/* A small iCalendar (RFC 5545) reader: enough to turn a Learning Suite course
   feed into a list of { uid, title, description, description_first, url, due_at, all_day }.

   Handles line unfolding, VEVENT and VTODO blocks, property parameters
   (VALUE=DATE, TZID=...), text escapes, UTC "Z" stamps, zoned stamps,
   floating stamps (treated as campus time), and multi-day all-day events
   (due on the last day, since DTEND is exclusive). No dependencies. */

/* Campus time zone: dates with no zone, and all-day items, are interpreted here. */
export const CAMPUS_TZ = process.env.APP_TIMEZONE || "America/Denver";
/* All-day items (no time in the feed) are due at this local time. */
const ALL_DAY_DUE = { hour: 23, minute: 59 };

/* ---- time zone math without a library ---- */
function tzOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}
/* Wall-clock (y, mo, d, h, mi) in `tz` -> Date (UTC instant) */
export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2 * 60000;
  return new Date(utc);
}

/* The same calendar day as `date` (in campus time) at wall-clock "HH:MM". Used to
   apply a category's default due time to an all-day item. */
export function sameDayAt(date, hhmm, tz = CAMPUS_TZ) {
  const [h, mi] = String(hhmm).split(":").map(Number);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)]));
  return zonedToUtc(p.year, p.month, p.day, h, mi, 0, tz);
}

/* ---- parsing ---- */
function unfold(text) {
  const out = [];
  for (const raw of String(text).split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

function unescapeText(s) {
  return String(s ?? "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}
function collapseWs(s) { return String(s ?? "").replace(/\s+/g, " ").trim(); }

/* "20261015" | "20261015T140000" | "20261015T200000Z" with VALUE/TZID params -> { date, allDay } */
function parseStamp(value, params = {}) {
  const v = String(value || "").trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m || (params.VALUE === "DATE" && (m = v.match(/^(\d{4})(\d{2})(\d{2})/)))) {
    const [, y, mo, d] = m.map(Number);
    return { date: zonedToUtc(y, mo, d, ALL_DAY_DUE.hour, ALL_DAY_DUE.minute, 0, CAMPUS_TZ), allDay: true };
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const s = m[6] ? Number(m[6]) : 0;
  if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  let tz = params.TZID || CAMPUS_TZ;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = CAMPUS_TZ; } // unknown TZID -> campus time
  return { date: zonedToUtc(y, mo, d, h, mi, s, tz), allDay: false };
}

/* Decode feed bytes as UTF-8. Learning Suite's feeds are UTF-8 with a few
   stray Latin-1 bytes (non-breaking spaces) mixed in; those decode to U+FFFD
   and become plain spaces, while real UTF-8 text (curly quotes) stays intact. */
export function decodeFeed(bytes) {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.replace(/ /g, " ").replace(/�/g, " ");
}

/* Parse a whole feed. Returns events in feed order; items without a usable
   date or title are dropped. */
export function parseIcs(text) {
  if (!/BEGIN:VCALENDAR/i.test(String(text))) throw new Error("That link did not return a calendar (no BEGIN:VCALENDAR)");
  const items = [];
  let cur = null;
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT" || upper === "BEGIN:VTODO") { cur = { kind: upper.slice(6), props: {} }; continue; }
    if (upper === "END:VEVENT" || upper === "END:VTODO") { if (cur) items.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(";");
    const params = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    }
    cur.props[name.toUpperCase()] = { value: line.slice(idx + 1), params };
  }

  const events = [];
  for (const it of items) {
    const P = it.props;
    const description = unescapeText(P.DESCRIPTION?.value) || null;
    const first = collapseWs(description ? description.split("\n").map(s => s.trim()).find(Boolean) : "");
    const summary = collapseWs(unescapeText(P.SUMMARY?.value));
    /* Learning Suite schedule rows (topics, readings) have no name of their own:
       their SUMMARY is the description with line breaks removed, cut at ~100
       chars. Real assignments (exams, reports) have a proper SUMMARY and the
       instructions in DESCRIPTION. Tell them apart per item: an auto-generated
       SUMMARY is a prefix of the collapsed description, and then the
       description's first line is the better title. */
    const collapsed = collapseWs(description ? description.replace(/\n/g, "") : "");
    const autoSummary = !summary || summary === first || (collapsed !== "" && collapsed.startsWith(summary));
    const title = autoSummary && first ? first : summary;
    if (!title) continue;
    /* A to-do's DUE wins; otherwise the start stamp. */
    const stampProp = (it.kind === "VTODO" && P.DUE) ? P.DUE : (P.DTSTART || P.DUE);
    let stamp = stampProp ? parseStamp(stampProp.value, stampProp.params) : null;
    if (!stamp) continue;
    /* An all-day event that spans days has DTSTART = the day it opens and
       DTEND = the day after it closes (exclusive, RFC 5545). It's due on the
       last day, not the first. Timed DTENDs are ignored. */
    if (it.kind === "VEVENT" && stamp.allDay && P.DTEND) {
      const end = parseStamp(P.DTEND.value, P.DTEND.params);
      const m = String(P.DTEND.value).trim().match(/^(\d{4})(\d{2})(\d{2})/);
      if (end && end.allDay && m && end.date > stamp.date) {
        const [, y, mo, d] = m.map(Number);
        stamp = { date: zonedToUtc(y, mo, d - 1, ALL_DAY_DUE.hour, ALL_DAY_DUE.minute, 0, CAMPUS_TZ), allDay: true };
      }
    }
    const uid = unescapeText(P.UID?.value) || `${title}|${stamp.date.toISOString()}`;
    events.push({
      uid: uid.slice(0, 100),
      title: title.slice(0, 200),
      description,
      description_first: first || null,
      url: P.URL ? unescapeText(P.URL.value).slice(0, 500) : null,
      categories: P.CATEGORIES ? unescapeText(P.CATEGORIES.value) : null,
      due_at: stamp.date,
      all_day: stamp.allDay,
    });
  }
  return events;
}
