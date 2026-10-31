import { SLIDE_ID } from "./parse.js";

// plan.json: the outline the studio UI and the agent share. See FORMAT.md.

const META_FIELDS = ["topic", "audience", "goal", "lang", "theme"];
const isText = (v) => typeof v === "string";
const singleLine = (v) => isText(v) && !/[\r\n]/.test(v);

// Returns a list of "<path>: <problem>" strings; empty when the plan is valid.
export function validatePlan(plan) {
  const problems = [];
  const fail = (where, msg) => problems.push(`${where}: ${msg}`);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["$: must be an object"];

  if (plan.version !== undefined && plan.version !== 1) fail("$.version", "must be 1");
  if (!singleLine(plan.title) || plan.title.trim() === "") fail("$.title", "must be a non-empty single-line string");
  for (const key of META_FIELDS) {
    if (plan[key] === undefined) continue;
    if (!isText(plan[key])) fail(`$.${key}`, "must be a string");
    else if (!singleLine(plan[key])) fail(`$.${key}`, "must be a single-line string");
  }
  if (!Array.isArray(plan.slides) || plan.slides.length === 0) {
    fail("$.slides", "must be a non-empty array");
    return problems;
  }

  const seen = new Set();
  plan.slides.forEach((slide, i) => {
    const at = `$.slides[${i}]`;
    if (!slide || typeof slide !== "object" || Array.isArray(slide)) return fail(at, "must be an object");
    if (!isText(slide.id) || !SLIDE_ID.test(slide.id)) {
      fail(`${at}.id`, `must match ${SLIDE_ID.source}, got ${JSON.stringify(slide.id)}`);
    } else if (seen.has(slide.id)) {
      fail(`${at}.id`, `duplicate id ${JSON.stringify(slide.id)}`);
    } else {
      seen.add(slide.id);
    }
    if (!singleLine(slide.title) || slide.title.trim() === "") fail(`${at}.title`, "must be a non-empty single-line string");
    if (slide.points !== undefined) {
      if (!Array.isArray(slide.points)) fail(`${at}.points`, "must be an array");
      else slide.points.forEach((p, k) => {
        if (!singleLine(p)) fail(`${at}.points[${k}]`, "must be a single-line string");
        else if (/^\s*(---|:::)/.test(p)) fail(`${at}.points[${k}]`, "must not start with --- or :::");
      });
    }
    if (slide.notes !== undefined && !isText(slide.notes)) fail(`${at}.notes`, "must be a string");
    if (slide.layout !== undefined) {
      if (!isText(slide.layout)) fail(`${at}.layout`, "must be a string");
      else if (!singleLine(slide.layout)) fail(`${at}.layout`, "must be a single-line string");
    }
  });
  return problems;
}

// Parses plan.json text; returns { plan } or { problems }.
export function readPlan(text) {
  let plan;
  try {
    plan = JSON.parse(text);
  } catch {
    return { problems: ["$: invalid JSON"] };
  }
  const problems = validatePlan(plan);
  return problems.length ? { problems } : { plan };
}

// Deck markdown skeleton: one slide per plan slide, first slide is the cover.
export function scaffoldDeck(plan) {
  const front = [
    "---",
    `title: ${plan.title}`,
    ...(plan.goal ? [`brief: ${plan.goal}`] : []),
    `theme: ${plan.theme || "gentleman-cute"}`,
    ...(plan.lang ? [`lang: ${plan.lang}`] : []),
    "---",
  ].join("\n");
  const slides = plan.slides.map((slide, i) => {
    const directives = [`id: ${slide.id}`];
    if (i === 0) directives.push("class: cover");
    if (slide.layout) directives.push(`layout: ${slide.layout}`);
    const heading = `${i === 0 ? "#" : "##"} ${slide.title}`;
    const points = (slide.points ?? []).map((p) => `- ${p}`).join("\n");
    return [directives.join("\n"), heading, points].filter(Boolean).join("\n\n");
  });
  return `${front}\n\n${slides.join("\n\n---\n\n")}\n`;
}
