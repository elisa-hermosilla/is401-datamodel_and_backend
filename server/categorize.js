/* "Categorize using AI" for Learning Suite classes.

   A feed has no category data, and the regex buckets miss a course's own
   naming ("Case Study 3", "Lab Report 2"). This sends the schedule's titles
   to Claude once and gets back groups: a name, one of our assignment types,
   keyword phrases that identify the group, and which items belong to it.
   The keywords are stored on the category rows and do all the routing on
   later syncs, so the model runs only when the student asks for it.

   Cost: one request per run, a few thousand tokens in and under a thousand
   out, about a cent on claude-sonnet-5-5. The key comes from
   ANTHROPIC_API_KEY; without it the option is simply unavailable. */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";
const MAX_ITEMS = 300;
const MAX_KEYWORDS = 8;
const MAX_COVERAGE_KEYWORDS = 30; // model keywords + titles added so every item is reachable
const MAX_KEYWORD_LEN = 40;
const RUNS_PER_USER_PER_DAY = 20;

export class AiUnavailable extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/* A per-process cap so a bug in a loop or a curious student can't burn the
   budget. Resets when the server restarts, which is fine for its purpose. */
const runs = new Map(); // userId -> { day, count }
function takeRun(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const r = runs.get(userId);
  const count = r && r.day === day ? r.count : 0;
  if (count >= RUNS_PER_USER_PER_DAY) throw new AiUnavailable("You've used today's AI organizing runs. Try again tomorrow, or organize by keyword.", 429);
  runs.set(userId, { day, count: count + 1 });
}

/* The text a keyword is matched against. Shared with sync so routing at
   import time sees exactly what the model saw. */
export function haystack(item) {
  return [item.title, item.category || item.categories, item.note || item.description_first]
    .filter(Boolean).join(" ").toLowerCase();
}

export function normalizeKeyword(k) {
  return String(k || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_KEYWORD_LEN).trim();
}

export function slugOf(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "group";
}

function schemaFor(typeNames) {
  return {
    type: "object",
    properties: {
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: typeNames },
            keywords: { type: "array", items: { type: "string" } },
            item_ids: { type: "array", items: { type: "integer" } },
          },
          required: ["name", "type", "keywords", "item_ids"],
          additionalProperties: false,
        },
      },
    },
    required: ["groups"],
    additionalProperties: false,
  };
}

const SYSTEM = `You organize a university course's schedule into groups of assignments.

You get a JSON list of schedule items (id, title, and sometimes a note or category). Group them by the course's own naming patterns: items that are the same kind of work belong together, even when the professor's wording varies. Return the groups as JSON.

For each group give:
- name: a short label a student would recognize, using the course's own words (for example "Case Studies", "Chapter Readings", "Weekly Quizzes").
- type: the closest of the allowed types.
- keywords: 1 to 6 lowercase phrases that appear literally in that group's titles or notes and that would identify future items of the same kind (for example "case study", "reading", "quiz"). A keyword must not also match items of other groups.
- item_ids: every item that belongs to the group.

Rules: every item id appears in exactly one group; prefer fewer, larger groups over many small ones; use one group named "Other" with type "other" only for items that fit nowhere else; an exam counts as "exam", a reading or chapter as "reading", a short graded check as "quiz".`;

/* Ask Claude to group the items. Returns [{ name, slug, type, keywords, item_ids }].
   `items` are { id, title, note?, category? }; `typeNames` are the allowed types. */
export async function organizeWithClaude(items, typeNames, userId) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailable("AI organizing isn't set up on this server. Organize by keyword instead.");
  if (!items.length) return [];
  takeRun(userId);

  const list = items.slice(0, MAX_ITEMS).map(it => {
    const row = { id: it.id, title: it.title };
    if (it.note) row.note = it.note;
    if (it.category) row.category = it.category;
    return row;
  });

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: schemaFor(typeNames) } },
      messages: [{ role: "user", content: `Allowed types: ${typeNames.join(", ")}\n\nItems:\n${JSON.stringify(list)}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailable("The server's AI key was rejected. Organize by keyword instead.", 502);
    if (err instanceof Anthropic.RateLimitError) throw new AiUnavailable("The AI service is busy right now. Try again in a minute, or organize by keyword.", 503);
    if (err instanceof Anthropic.APIError) {
      console.error("categorize: API error", err.status, err.message);
      throw new AiUnavailable(/credit|billing|balance/i.test(err.message) ? "The AI budget for this server is used up. Organize by keyword instead." : "The AI service returned an error. Organize by keyword instead.", 502);
    }
    throw err;
  }

  const u = response.usage || {};
  console.log(`categorize: ${MODEL} items=${list.length} in=${u.input_tokens} out=${u.output_tokens} stop=${response.stop_reason}`);
  if (response.stop_reason === "refusal") throw new AiUnavailable("Claude declined to organize this schedule. Organize by keyword instead.", 502);
  if (response.stop_reason === "max_tokens") throw new AiUnavailable("That schedule was too long to organize in one go. Organize by keyword instead.", 502);

  const text = response.content.find(b => b.type === "text")?.text;
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new AiUnavailable("Claude's answer couldn't be read. Try again, or organize by keyword.", 502); }
  return cleanGroups(parsed.groups, list, typeNames);
}

/* Make the model's answer safe to store: valid types, every item in exactly
   one group, tidy keywords, unique slugs, and keywords that really cover the
   items they were given (an uncovered item's title becomes a keyword, so the
   first import matches the grouping exactly). Exported for tests. */
export function cleanGroups(rawGroups, items, typeNames) {
  const byId = new Map(items.map(it => [it.id, it]));
  const seen = new Set();
  const slugs = new Set();
  const groups = [];
  for (const g of Array.isArray(rawGroups) ? rawGroups : []) {
    const name = String(g?.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) continue;
    const type = typeNames.includes(g.type) ? g.type : "other";
    const ids = [];
    for (const id of Array.isArray(g.item_ids) ? g.item_ids : []) {
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id); ids.push(id);
    }
    const keywords = [];
    for (const k of Array.isArray(g.keywords) ? g.keywords : []) {
      const n = normalizeKeyword(k);
      if (n && !keywords.includes(n) && keywords.length < MAX_KEYWORDS) keywords.push(n);
    }
    let slug = slugOf(name), base = slug, i = 2;
    while (slugs.has(slug)) slug = `${base}-${i++}`;
    slugs.add(slug);
    groups.push({ name, slug, type, keywords, item_ids: ids });
  }
  /* Items the model skipped go to Other */
  const missing = items.filter(it => !seen.has(it.id)).map(it => it.id);
  if (missing.length) {
    let other = groups.find(g => g.slug === "other");
    if (!other) { other = { name: "Other", slug: "other", type: "other", keywords: [], item_ids: [] }; groups.push(other); }
    other.item_ids.push(...missing);
  }
  /* Coverage: each item must be reachable by one of its group's keywords */
  for (const g of groups) {
    for (const id of g.item_ids) {
      const hay = haystack(byId.get(id));
      if (g.keywords.some(k => hay.includes(k))) continue;
      const k = normalizeKeyword(byId.get(id).title);
      if (k && !g.keywords.includes(k) && g.keywords.length < MAX_COVERAGE_KEYWORDS) g.keywords.push(k);
    }
  }
  return groups.filter(g => g.item_ids.length);
}
