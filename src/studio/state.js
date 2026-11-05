// Studio state: deck paths, revision, slide statuses, and the requests queue.
// The deck directory contract lives in FORMAT.md (S4-S10).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitSlides, parseSlide, assignIds, SLIDE_ID } from "../parse.js";
import { readPlan, scaffoldDeck } from "../plan.js";
import { slideTitle } from "../design.js";

export const REQUESTS_FILE = "requests.json";
// S2: the studio URL must be stable across restarts for the same deck, so the access token is
// persisted next to the plan instead of being generated per server start.
export const TOKEN_FILE = ".studio-token";
// S15: the server records its pid so `decks studio stop` can shut it down after approval.
export const PID_FILE = ".studio-pid";
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
// S8: a request may carry a reply (string, at most 2000 characters) and when it was written.
export const MAX_REPLY = 2000;
// S8: api/state keeps only the most recent resolved requests browsable.
export const MAX_RESOLVED = 50;

// Absolute paths of the files a studio deck dir may hold.
export function studioPaths(dir) {
  const root = path.resolve(dir);
  const slug = path.basename(root);
  return {
    dir: root,
    slug,
    plan: path.join(root, "plan.json"),
    deck: path.join(root, `${slug}.md`),
    requests: path.join(root, REQUESTS_FILE),
    token: path.join(root, TOKEN_FILE),
    pid: path.join(root, PID_FILE),
    themes: path.join(root, "themes"),
  };
}

export const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

// S15: the running studio's pid, or null when no studio is recorded for this deck.
export function readStudioPid(paths) {
  try {
    const pid = Number(fs.readFileSync(paths.pid, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// S2: returns the deck's persisted studio token, creating a fresh one only when the file is
// missing or corrupt. A corrupt file is replaced, never trusted.
export function readOrCreateStudioToken(paths) {
  try {
    const stored = fs.readFileSync(paths.token, "utf8").trim();
    if (TOKEN_RE.test(stored)) return stored;
  } catch {
    // first run for this deck
  }
  const token = crypto.randomBytes(24).toString("base64url");
  writeAtomic(paths.token, `${token}\n`);
  return token;
}

function readBytes(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

// Atomic write: a temporary file in the same directory, then a rename.
export function writeAtomic(file, content) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

// S6: plan.json bytes and deck bytes ("none" when missing), so any edit changes the rev.
export function deckRev(paths) {
  const plan = readBytes(paths.plan);
  const deck = readBytes(paths.deck);
  return `${plan ? sha256(plan) : "none"}.${deck ? sha256(deck) : "none"}`;
}

// The plan on disk, or its problems (the server requires the file to exist at start).
export function readPlanDocument(paths) {
  const bytes = readBytes(paths.plan);
  if (!bytes) return { problems: ["$: plan.json not found"] };
  const { plan, problems } = readPlan(bytes.toString("utf8"));
  return problems ? { problems } : { plan };
}

// Parsed deck slides, or null when the deck does not exist yet. Parse errors are reported, not thrown,
// so a half-written deck never takes the studio down.
export function readDeck(paths) {
  const bytes = readBytes(paths.deck);
  if (!bytes) return null;
  const text = bytes.toString("utf8");
  const { meta, body } = parseFrontmatter(text);
  try {
    return { text, meta, slides: assignIds(splitSlides(body).map(parseSlide)) };
  } catch (err) {
    return { text, meta, slides: [], error: err.message };
  }
}

// Slide bodies the plan scaffold would produce, keyed by id: the `draft` baseline of S6.
function scaffoldBodies(plan) {
  const bodies = new Map();
  try {
    const { body } = parseFrontmatter(scaffoldDeck(plan));
    for (const slide of assignIds(splitSlides(body).map(parseSlide))) bodies.set(slide.id, slide.body.trim());
  } catch {}
  return bodies;
}

// S6 slide list: plan order first, then deck-only slides. Plan slides keep their plan title.
export function slideStates(plan, deck) {
  const drafts = scaffoldBodies(plan);
  const found = new Map((deck?.slides ?? []).map((slide) => [slide.id, slide]));
  const planIds = new Set(plan.slides.map((slide) => slide.id));
  const slides = plan.slides.map((slide, index) => {
    const inDeck = found.get(slide.id);
    let status = "pending";
    if (inDeck) status = inDeck.body.trim() === drafts.get(slide.id) ? "draft" : "ready";
    return { id: slide.id, index, title: slide.title, status };
  });
  (deck?.slides ?? []).forEach((slide, deckIndex) => {
    if (planIds.has(slide.id)) return;
    slides.push({ id: slide.id, index: slides.length, title: slideTitle(slide, deckIndex), status: "ready" });
  });
  return slides;
}

// requests.json: { version: 1, requests: [...] }. A missing file is an empty queue.
export function readRequests(paths) {
  const bytes = readBytes(paths.requests);
  if (!bytes) return { version: 1, requests: [] };
  let doc;
  try {
    doc = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`invalid ${REQUESTS_FILE}`);
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.requests)) throw new Error(`invalid ${REQUESTS_FILE}`);
  return { version: 1, requests: doc.requests };
}

export function writeRequests(paths, doc) {
  writeAtomic(paths.requests, JSON.stringify({ version: 1, requests: doc.requests }, null, 2) + "\n");
}

export const openRequests = (paths) => readRequests(paths).requests.filter((request) => request.status === "open");

// S8: the 50 most recently resolved requests, newest first. Equal timestamps keep the last written first.
export function resolvedRequests(paths) {
  return readRequests(paths)
    .requests.map((request, index) => ({ request, index }))
    .filter(({ request }) => request.status === "resolved")
    .sort((a, b) => {
      const left = String(a.request.resolvedAt ?? "");
      const right = String(b.request.resolvedAt ?? "");
      if (left !== right) return left < right ? 1 : -1;
      return b.index - a.index;
    })
    .slice(0, MAX_RESOLVED)
    .map(({ request }) => request);
}

// S8: replies are checked before anything is written, so a bad one leaves requests.json untouched.
// Blank replies count as empty; the boundary is inclusive (2000 characters are accepted).
export const replyProblem = (text) =>
  typeof text !== "string" || text.trim() === "" || text.length > MAX_REPLY ? "invalid reply" : null;

// The agent bridge (S9): requests describe work an agent should do, and stay open until resolved.
// S10/S11: `propose-style` carries theme work, so theme actions are not disguised as slide comments.
export const REQUEST_KINDS = ["generate", "comment", "redo", "layout", "add-slide", "overflow", "propose-style", "approve", "move"];
const SLIDE_KINDS = new Set(["comment", "redo", "layout", "add-slide", "overflow", "move"]);
const TEXT_KINDS = new Set(["comment", "redo", "add-slide"]);
// S10/S11: what a `propose-style` request asks for: a new theme, an improvement, or an answer.
const THEME_MODES = ["new", "improve", "comment"];
const THEME_KINDS = new Set(["propose-style"]);
// A theme name is a CSS file stem in the deck's themes dir, never a path (S11).
const THEME_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// S1: a reference file the studio uploaded under the deck, relative to the deck dir, never a path
// out of it. The server also reuses this pattern before it touches the filesystem.
export const REFERENCE = /^references\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const isText = (value) => typeof value === "string";

// Validates a POST api/requests body; returns `{ problems, fields }` with only known keys in `fields`.
export function validateRequest(input, layouts) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { problems: ["$: must be an object"] };
  const problems = [];
  const { kind } = input;
  if (!REQUEST_KINDS.includes(kind)) {
    problems.push(`$.kind: must be one of ${REQUEST_KINDS.join(", ")}`);
  }
  if (input.slideId === undefined) {
    if (SLIDE_KINDS.has(kind)) problems.push("$.slideId: required");
  } else if (!isText(input.slideId) || !SLIDE_ID.test(input.slideId)) {
    problems.push(`$.slideId: must match ${SLIDE_ID.source}, got ${JSON.stringify(input.slideId)}`);
  }
  if (input.text === undefined) {
    if (TEXT_KINDS.has(kind)) problems.push("$.text: required");
  } else if (!isText(input.text) || input.text.trim() === "") {
    problems.push("$.text: must be a non-empty string");
  }
  // S10/S11: a theme request says what to do (`mode`, default `new`) and, except for a brand-new
  // theme, which theme it targets. Commenting on a theme is a request with text, like a comment.
  const mode = input.mode ?? "new";
  if (THEME_KINDS.has(kind)) {
    if (!THEME_MODES.includes(mode)) problems.push(`$.mode: must be one of ${THEME_MODES.join(", ")}`);
    if (mode !== "new" && input.theme === undefined) problems.push("$.theme: required");
    if (mode === "comment" && input.text === undefined) problems.push("$.text: required");
  } else if (input.mode !== undefined) {
    problems.push(`$.mode: must be one of ${THEME_MODES.join(", ")}`);
  }
  if (input.theme !== undefined && (!isText(input.theme) || !THEME_NAME.test(input.theme))) {
    problems.push(`$.theme: must match ${THEME_NAME.source}, got ${JSON.stringify(input.theme)}`);
  }
  // S1: an optional reference the agent must read before writing the CSS. State stays pure here; the
  // server checks that the file actually exists, where the deck paths are known.
  if (input.reference !== undefined && (!isText(input.reference) || !REFERENCE.test(input.reference))) {
    problems.push(`$.reference: must match ${REFERENCE.source}, got ${JSON.stringify(input.reference)}`);
  }
  for (const key of ["selector", "excerpt"]) {
    if (input[key] !== undefined && !isText(input[key])) problems.push(`$.${key}: must be a string`);
  }
  if ((input.layout !== undefined || kind === "layout") && !layouts.has(input.layout)) {
    problems.push(`$.layout: must be one of ${[...layouts].join(", ")}`);
  }
  if (problems.length) return { problems };
  const fields = { kind };
  for (const key of ["slideId", "text", "selector", "excerpt", "layout", "theme", "reference"]) {
    if (input[key] !== undefined) fields[key] = input[key];
  }
  if (THEME_KINDS.has(kind)) fields.mode = mode;
  return { problems: [], fields };
}

// Marks the given ids resolved; an unknown id cancels the whole change (S9). With `reply`, every listed
// id also carries the agent's answer, even one that was already resolved (S8).
export function resolveRequests(paths, ids, { reply } = {}) {
  const doc = readRequests(paths);
  const known = new Set(doc.requests.map((request) => request.id));
  const unknown = ids.find((id) => !known.has(id));
  if (unknown) return { unknown };
  const resolvedAt = new Date().toISOString();
  for (const request of doc.requests) {
    if (!ids.includes(request.id)) continue;
    if (reply !== undefined) {
      request.reply = reply;
      request.repliedAt = resolvedAt;
    }
    if (request.status === "resolved") continue;
    request.status = "resolved";
    request.resolvedAt = resolvedAt;
  }
  writeRequests(paths, doc);
  return { resolved: ids };
}

// S8: `decks studio reply` answers one request without resolving it. An unknown id writes nothing.
export function replyToRequest(paths, id, text) {
  const doc = readRequests(paths);
  const request = doc.requests.find((entry) => entry.id === id);
  if (!request) return { unknown: id };
  request.reply = text;
  request.repliedAt = new Date().toISOString();
  writeRequests(paths, doc);
  return { replied: id };
}
