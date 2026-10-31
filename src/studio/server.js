// Studio HTTP server (S5-S12): every route lives under `/<token>/`, loopback only, and non-GET
// requests must be same-origin JSON. The UI assets in `studio/` are written by the UI task (L4).
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { CONTAINER_NAMES } from "../render.js";
import { validatePlan } from "../plan.js";
import { listThemes } from "../theme.js";
import { artboardHtml, presentHtml } from "./build.js";
import { editSlideText } from "./edit.js";
import {
  deckRev,
  openRequests,
  readDeck,
  readPlanDocument,
  readRequests,
  slideStates,
  studioPaths,
  validateRequest,
  writeAtomic,
  writeRequests,
} from "./state.js";

export const MAX_BODY = 1024 * 1024;
const LOOPBACK = "127.0.0.1";
const POLL_MS = 250;
const HEARTBEAT_MS = 15000;
const SLIDE_ROUTE = /^slides\/([a-z][a-z0-9-]*)\.html$/;
const TEXT_ROUTE = /^api\/slides\/([a-z][a-z0-9-]*)\/text$/;
const ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const STUDIO_DIR = path.join(ROOT, "studio");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(`${JSON.stringify(value)}\n`);
};

const notFound = (req, res) => {
  req.resume();
  json(res, 404, { error: "not-found" });
};

// Reads a JSON body, draining oversized payloads so the client still gets its 413.
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      chunks.length = 0;
      continue;
    }
    chunks.push(chunk);
  }
  if (size > MAX_BODY) return { tooLarge: true };
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { invalid: true };
  }
}

const newRequestId = () => crypto.randomBytes(6).toString("hex");

// File fingerprints used to decide whether to report a change; the rev is only computed on a change.
const PRESENT_CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";

// sha256 over deck-local theme names and contents, so the UI repaints on theme-only edits (F2).
function themesRev(paths) {
  const hash = crypto.createHash("sha256");
  try {
    for (const name of fs.readdirSync(paths.themes).sort()) {
      if (!name.endsWith(".css")) continue;
      hash.update(`${name}\0`);
      hash.update(fs.readFileSync(path.join(paths.themes, name)));
      hash.update("\0");
    }
  } catch {
    // no deck themes
  }
  return hash.digest("hex");
}

function fingerprint(paths) {
  const parts = [];
  for (const file of [paths.plan, paths.deck, paths.requests]) {
    try {
      const stat = fs.statSync(file);
      parts.push(`${stat.size}:${stat.mtimeMs}`);
    } catch {
      parts.push("-");
    }
  }
  try {
    for (const name of fs.readdirSync(paths.themes).sort()) {
      try {
        const stat = fs.statSync(path.join(paths.themes, name));
        parts.push(`${name}:${stat.size}:${stat.mtimeMs}`);
      } catch {}
    }
  } catch {}
  return parts.join("|");
}

export function createStudioServer({ dir, studioDir = STUDIO_DIR }) {
  const paths = studioPaths(dir);
  const token = crypto.randomBytes(24).toString("base64url");
  const prefix = `/${token}/`;

  const server = http.createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(res, 500, { error: "server", message: err.message });
    });
  });

  const port = () => server.address()?.port;

  function serveFile(res, file) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return json(res, 404, { error: "not-found" });
    }
    if (!stat.isFile()) return json(res, 404, { error: "not-found" });
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(fs.readFileSync(file));
  }

  function serveArtboard(res, url, id) {
    const plan = readPlanDocument(paths);
    let html;
    try {
      html = artboardHtml(paths, plan.problems ? undefined : plan.plan, id, url.searchParams.get("theme") ?? undefined);
    } catch (err) {
      return json(res, 422, { error: "build", message: err.message });
    }
    if (html === null) return json(res, 404, { error: "not-found" });
    const withInspector = html.replace(/<\/body>/i, `<script src="/${token}/assets/inspector.js"></script>\n</body>`);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Opaque origin; only the studio's own assets may run inside the artboard (F3).
      "Content-Security-Policy": `sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src http://${LOOPBACK}:${port()}/${token}/assets/; img-src data:`,
    });
    res.end(withInspector);
  }

  function servePresent(res) {
    let html;
    try {
      html = presentHtml(paths);
    } catch (err) {
      return json(res, 422, { error: "build", message: err.message });
    }
    if (html === null) return json(res, 404, { error: "not-found" });
    // Deck markdown may carry raw HTML: run it in an opaque origin with no network (F1).
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": PRESENT_CSP,
    });
    res.end(html);
  }

  function serveState(res) {
    const plan = readPlanDocument(paths);
    if (plan.problems) return json(res, 500, { error: "plan", problems: plan.problems });
    const deck = readDeck(paths);
    return json(res, 200, {
      rev: deckRev(paths),
      plan: plan.plan,
      themes: listThemes(paths.dir),
      deck: { exists: Boolean(deck), slides: slideStates(plan.plan, deck) },
      requests: openRequests(paths),
    });
  }

  // S11: `event: change` whenever the deck state changes, plus a comment heartbeat.
  function serveEvents(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();
    let last = fingerprint(paths);
    const poll = setInterval(() => {
      const next = fingerprint(paths);
      if (next === last) return;
      last = next;
      res.write(`event: change\ndata: ${JSON.stringify({ rev: deckRev(paths), themes: themesRev(paths) })}\n\n`);
    }, POLL_MS);
    const beat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_MS);
    const stop = () => {
      clearInterval(poll);
      clearInterval(beat);
    };
    req.on("close", stop);
    res.on("close", stop);
  }

  async function putPlan(req, res) {
    const body = await readJson(req);
    if (body.tooLarge) return json(res, 413, { error: "too-large" });
    if (body.invalid) return json(res, 422, { error: "invalid", problems: ["$: invalid JSON"] });
    const value = body.value && typeof body.value === "object" ? body.value : {};
    const rev = deckRev(paths);
    if (value.rev !== rev) return json(res, 409, { error: "stale", rev });
    const problems = validatePlan(value.plan);
    if (problems.length) return json(res, 422, { error: "invalid", problems });
    writeAtomic(paths.plan, `${JSON.stringify(value.plan, null, 2)}\n`);
    return json(res, 200, { rev: deckRev(paths) });
  }

  // S9: validates and appends one request, prints the bridge line, and dedupes open overflow reports.
  async function postRequest(req, res) {
    const body = await readJson(req);
    if (body.tooLarge) return json(res, 413, { error: "too-large" });
    if (body.invalid) return json(res, 422, { error: "invalid", problems: ["$: invalid JSON"] });
    const { problems, fields } = validateRequest(body.value, CONTAINER_NAMES);
    if (problems.length) return json(res, 422, { error: "invalid", problems });
    if (fields.kind === "overflow") {
      const duplicate = openRequests(paths).find((r) => r.kind === "overflow" && r.slideId === fields.slideId);
      if (duplicate) return json(res, 200, { request: duplicate, ignored: true });
    }
    const request = {
      id: newRequestId(),
      ...fields,
      status: "open",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    const doc = readRequests(paths);
    doc.requests.push(request);
    writeRequests(paths, doc);
    process.stdout.write(`request ${request.id} ${request.kind} ${request.slideId ?? "-"}\n`);
    return json(res, 200, { request });
  }

  async function putText(req, res, id) {
    const body = await readJson(req);
    if (body.tooLarge) return json(res, 413, { error: "too-large" });
    if (body.invalid) return json(res, 422, { error: "invalid", problems: ["$: invalid JSON"] });
    const value = body.value && typeof body.value === "object" ? body.value : {};
    const rev = deckRev(paths);
    if (value.rev !== rev) return json(res, 409, { error: "stale", rev });
    const before = typeof value.before === "string" ? value.before.trim() : "";
    if (typeof value.after === "string" && /[\r\n]/.test(value.after) && before && !/[\r\n]/.test(before)) {
      // A newline could inject directives or slide separators (F4); the inspector sends one line.
      return json(res, 422, { error: "invalid", problems: ["$.after: must be a single-line string"] });
    }
    if (!before || /[\r\n]/.test(before) || typeof value.after !== "string") {
      return json(res, 422, {
        error: "invalid",
        problems: ["$.before: must be a non-empty single-line string", "$.after: must be a string"],
      });
    }
    const result = editSlideText(paths, id, before, value.after);
    if (result.status === "ok") return json(res, 200, { rev: deckRev(paths) });
    if (result.status === "ambiguous") return json(res, 409, { error: "ambiguous" });
    return json(res, 404, { error: "not-found" });
  }

  async function dispatch(req, res) {
    // DNS-rebinding guard: only the loopback names on our own port are allowed.
    const host = req.headers.host;
    if (host !== `${LOOPBACK}:${port()}` && host !== `localhost:${port()}`) {
      req.resume();
      return json(res, 403, { error: "forbidden" });
    }
    if (req.method !== "GET") {
      if (req.headers.origin !== `http://${LOOPBACK}:${port()}`) {
        req.resume();
        return json(res, 403, { error: "forbidden" });
      }
      const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (type !== "application/json") {
        req.resume();
        return json(res, 415, { error: "unsupported-media-type" });
      }
    }

    const url = new URL(req.url, `http://${LOOPBACK}`);
    let route;
    try {
      route = decodeURIComponent(url.pathname);
    } catch {
      return notFound(req, res);
    }
    if (!route.startsWith(prefix)) return notFound(req, res);
    route = route.slice(prefix.length);

    if (req.method === "GET") {
      if (route === "") return serveFile(res, path.join(studioDir, "index.html"));
      if (route.startsWith("assets/")) {
        const file = route.slice("assets/".length);
        if (!ASSET.test(file)) return notFound(req, res);
        return serveFile(res, path.join(studioDir, file));
      }
      if (route === "api/state") return serveState(res);
      if (route === "api/events") return serveEvents(req, res);
      if (route === "present") return servePresent(res);
      const slide = route.match(SLIDE_ROUTE);
      if (slide) return serveArtboard(res, url, slide[1]);
    }
    if (req.method === "PUT" && route === "api/plan") return putPlan(req, res);
    if (req.method === "POST" && route === "api/requests") return postRequest(req, res);
    const text = route.match(TEXT_ROUTE);
    if (req.method === "PUT" && text) return putText(req, res, text[1]);
    return notFound(req, res);
  }

  return { server, token, paths };
}

// Starts the server on the loopback interface and resolves with the URL printed by the CLI.
export function startStudio({ dir, port = 0, host = LOOPBACK, studioDir }) {
  const studio = createStudioServer({ dir, studioDir });
  return new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(port, host, () => {
      studio.server.off("error", reject);
      const actual = studio.server.address().port;
      resolve({ ...studio, port: actual, url: `http://${host}:${actual}/${studio.token}/` });
    });
  });
}
