// Studio server, HTTP API, and CLI bridge (S4-S12, S14). Run: node --test checks/
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffoldDeck } from "../src/plan.js";

const CLI = path.resolve("bin/decks.js");
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-studio-"));
  scratch.push(dir);
  return dir;
};
// An empty user themes dir, so themes in the developer's ~/.config never leak into the checks.
const NO_USER_THEMES = tmp();
const ENV = { ...process.env, GENTLE_DECKS_THEMES: NO_USER_THEMES };
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: ENV });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

// Every deck dir lives outside the worktree and is removed when the file is done.
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

const PLAN = {
  version: 1,
  title: "Studio deck",
  goal: "Ship the studio",
  lang: "en",
  theme: "gentleman-cute",
  slides: [
    { id: "cover", title: "Studio deck", points: ["One deck"] },
    { id: "second", title: "Second slide", points: ["Two points"], layout: "grid-2" },
    { id: "third", title: "Third slide", points: [] },
  ],
};

const DECK_THEME = "/* deck-local theme */\n:root { --studio-marker: deck-local; }\n";

const deckFile = (dir) => path.join(dir, `${path.basename(dir)}.md`);

function makeDeck({ plan = PLAN, deck, themes = {}, requests } = {}) {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
  if (deck !== undefined) fs.writeFileSync(deckFile(dir), deck);
  for (const [name, css] of Object.entries(themes)) {
    fs.mkdirSync(path.join(dir, "themes"), { recursive: true });
    fs.writeFileSync(path.join(dir, "themes", `${name}.css`), css);
  }
  if (requests !== undefined) {
    fs.writeFileSync(
      path.join(dir, "requests.json"),
      typeof requests === "string" ? requests : JSON.stringify(requests, null, 2) + "\n",
    );
  }
  return dir;
}

async function waitFor(predicate, ms = 4000, label = "condition") {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timeout waiting for ${label}`);
}

function stopStudio(studio) {
  if (studio.child.exitCode === null && studio.child.signalCode === null) studio.child.kill("SIGKILL");
  return studio.exited;
}

// Starts `decks studio <dir> --port 0` and resolves on the printed URL line.
function startStudio(dir, env = ENV) {
  const child = spawn(process.execPath, [CLI, "studio", dir, "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`studio did not print its URL in 10s. stderr: ${stderr}`)),
      10000,
    );
    const check = () => {
      const m = stdout.match(/^studio: (http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]+)\/)$/m);
      if (!m) return false;
      clearTimeout(timer);
      resolve({
        child,
        exited,
        line: m[0],
        base: m[1],
        port: Number(m[2]),
        token: m[3],
        origin: `http://127.0.0.1:${m[2]}`,
        stdout: () => stdout,
        stderr: () => stderr,
      });
      return true;
    };
    child.stdout.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`studio exited (${code}): ${stderr}`));
    });
  });
}

async function call(studio, route, init = {}) {
  const res = await fetch(studio.base + route, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body, text };
}

const send = (studio, method, route, payload) =>
  call(studio, route, {
    method,
    headers: { Origin: studio.origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// Raw request, so the test can set a foreign Host header.
function rawRequest(studio, { method = "GET", route = "api/state", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: studio.port,
        method,
        path: `/${studio.token}/${route}`,
        headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const sortedThemes = (themes) => themes.map((t) => [t.name, t.source]);

test("studio prints exactly one tokenized URL and 404s outside it (S5)", async (t) => {
  const studio = await startStudio(makeDeck());
  t.after(() => stopStudio(studio));

  assert.match(studio.line, /^studio: http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{32}\/$/);
  assert.equal(studio.token.length, 32);
  assert.equal(studio.stdout().trimEnd().split("\n").length, 1);

  const origin = `http://127.0.0.1:${studio.port}`;
  assert.equal((await fetch(`${origin}/`)).status, 404);
  assert.equal((await fetch(`${origin}/${"a".repeat(32)}/api/state`)).status, 404);
  assert.equal((await fetch(`${origin}/${studio.token}`)).status, 404);
  assert.equal((await fetch(`${origin}/${studio.token}/api/nope`)).status, 404);
  assert.equal((await call(studio, "api/state")).status, 200);
});

test("studio keeps the same URL across restarts for the same deck (S2)", async (t) => {
  const dir = makeDeck();
  const first = await startStudio(dir);
  t.after(() => stopStudio(first));
  assert.equal(first.token.length, 32);
  assert.equal(fs.readFileSync(path.join(dir, ".studio-token"), "utf8").trim(), first.token);

  await stopStudio(first);
  const second = await startStudio(dir);
  t.after(() => stopStudio(second));
  assert.equal(second.token, first.token, "the persisted token must survive a restart");

  // A corrupt token file is replaced, not trusted.
  fs.writeFileSync(path.join(dir, ".studio-token"), "bad token with spaces/!");
  await stopStudio(second);
  const third = await startStudio(dir);
  t.after(() => stopStudio(third));
  assert.match(third.token, /^[A-Za-z0-9_-]{32}$/);
});

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("-o embeds local images so the exported file is self-contained (S9)", () => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  fs.writeFileSync(path.join(dir, "dot.png"), Buffer.from(PNG_1PX, "base64"));
  const deckFile = path.join(dir, `${path.basename(dir)}.md`);
  fs.writeFileSync(deckFile, scaffoldDeck(PLAN).replace("## Second slide", "## Second slide\n\n![dot](dot.png)"));
  const out = path.join(dir, "out.html");
  const build = spawnSync(process.execPath, [CLI, deckFile, "-o", out], { encoding: "utf8", env: ENV });
  assert.equal(build.status, 0, build.stderr);
  const html = fs.readFileSync(out, "utf8");
  assert.ok(html.includes(`data:image/png;base64,${PNG_1PX}`));
  assert.ok(!html.includes('src="dot.png"'));
});

test("export serves a self-contained download with embedded images (S3, S9)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  fs.mkdirSync(path.join(dir, "images"));
  fs.writeFileSync(path.join(dir, "images", "dot.png"), Buffer.from(PNG_1PX, "base64"));
  const deckFile = path.join(dir, `${path.basename(dir)}.md`);
  fs.writeFileSync(deckFile, scaffoldDeck(PLAN).replace("## Second slide", "## Second slide\n\n![dot](images/dot.png)"));
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const slug = path.basename(dir);
  const res = await fetch(`${studio.base}export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), new RegExp(`attachment; filename="${slug}\\.html"`));
  const html = await res.text();
  assert.ok(html.includes(`data:image/png;base64,${PNG_1PX}`), "local image must be embedded");
  assert.ok(!html.includes('src="images/dot.png"'), "no external references may remain");
});

test("export follows the established plan order even when the markdown was written out of order (S18)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  // The agent wrote the markdown with the slides in a different order than plan.json.
  const deckFile = path.join(dir, `${path.basename(dir)}.md`);
  const chunks = scaffoldDeck(PLAN).split("\n---\n").filter((chunk) => chunk.trim() !== "");
  const [head, ...slides] = chunks;
  fs.writeFileSync(deckFile, [head, ...slides.slice().reverse()].join("\n---\n\n"));
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const html = await (await fetch(`${studio.base}export`)).text();
  const at = (marker) => html.indexOf(marker);
  assert.ok(at("One deck") < at("Second slide"), `plan order required: ${at("One deck")} < ${at("Second slide")}`);
  assert.ok(at("Second slide") < at("Third slide"), `plan order required: ${at("Second slide")} < ${at("Third slide")}`);
});

test("export refuses when the deck is not written yet (S3)", async (t) => {
  const studio = await startStudio(makeDeck());
  t.after(() => stopStudio(studio));
  const res = await fetch(`${studio.base}export`);
  assert.equal(res.status, 404);
});

test("studio refuses a deck dir without plan.json (S5)", () => {
  const dir = tmp();
  const r = run("studio", dir, "--port", "0");
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, `studio: ${path.join(dir, "plan.json")} not found\n`);
});

test("artboards serve deck images embedded so the sandbox CSP renders them (S8, S9)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  fs.mkdirSync(path.join(dir, "images"));
  fs.writeFileSync(path.join(dir, "images", "dot.png"), Buffer.from(PNG_1PX, "base64"));
  const deckFile = path.join(dir, `${path.basename(dir)}.md`);
  fs.writeFileSync(deckFile, scaffoldDeck(PLAN).replace("## Second slide", "## Second slide\n\n::: figure src=images/dot.png alt=dot\n:::"));
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const res = await fetch(`${studio.base}slides/second.html`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(`data:image/png;base64,${PNG_1PX}`), "artboard image must be a data URI");
});

test("studio stop terminates the server and clears the pid file (S15)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  assert.equal(fs.readFileSync(path.join(dir, ".studio-pid"), "utf8").trim(), String(studio.child.pid));

  const r = run("studio", "stop", dir);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /stopped/);
  assert.ok(!fs.existsSync(path.join(dir, ".studio-pid")), "pid file must be removed");
  const exit = await Promise.race([studio.exited, new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000))]);
  assert.notEqual(exit, "timeout", "the studio process must exit after stop");
});

test("studio stop fails cleanly when no studio is running (S15)", () => {
  const r = run("studio", "stop", makeDeck());
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not running/);
  assert.equal(r.stdout, "");
});

test("POST api/requests accepts an approve request without slide scope (S15)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const res = await send(studio, "POST", "api/requests", { kind: "approve" });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8")).requests[0].kind, "approve");
});

test("POST api/requests accepts a move request with selector and excerpt (S8a)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const res = await send(studio, "POST", "api/requests", {
    kind: "move",
    slideId: "second",
    selector: ".slide > div.grid-2 > p:nth-of-type(1)",
    excerpt: "Un punto",
  });
  assert.equal(res.status, 200);
  const req = JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8")).requests[0];
  assert.equal(req.kind, "move");
  assert.equal(req.selector, ".slide > div.grid-2 > p:nth-of-type(1)");
  const bad = await send(studio, "POST", "api/requests", { kind: "move", excerpt: "sin slide" });
  assert.equal(bad.status, 422);
});

test("non-GET and Host guards reject cross-origin, wrong type, and big bodies (S5)", async (t) => {
  const studio = await startStudio(makeDeck());
  t.after(() => stopStudio(studio));

  // DNS-rebinding guard: Host must be 127.0.0.1 or localhost on the studio port.
  const foreignHost = await rawRequest(studio, { headers: { Host: `evil.example:${studio.port}` } });
  assert.equal(foreignHost.status, 403);
  const localhostHost = await rawRequest(studio, { headers: { Host: `localhost:${studio.port}` } });
  assert.equal(localhostHost.status, 200);
  const noPortHost = await rawRequest(studio, { headers: { Host: "127.0.0.1" } });
  assert.equal(noPortHost.status, 403);

  const body = JSON.stringify({ kind: "generate" });
  const noOrigin = await call(studio, "api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(noOrigin.status, 403);
  const foreignOrigin = await call(studio, "api/requests", {
    method: "POST",
    headers: { Origin: "http://evil.example", "Content-Type": "application/json" },
    body,
  });
  assert.equal(foreignOrigin.status, 403);
  const localhostOrigin = await call(studio, "api/requests", {
    method: "POST",
    headers: { Origin: `http://localhost:${studio.port}`, "Content-Type": "application/json" },
    body,
  });
  assert.equal(localhostOrigin.status, 403);

  const wrongType = await call(studio, "api/requests", {
    method: "POST",
    headers: { Origin: studio.origin, "Content-Type": "text/plain" },
    body,
  });
  assert.equal(wrongType.status, 415);

  const accepted = await call(studio, "api/requests", {
    method: "POST",
    headers: { Origin: studio.origin, "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  assert.equal(accepted.status, 200);

  const oversized = await call(studio, "api/requests", {
    method: "POST",
    headers: { Origin: studio.origin, "Content-Type": "application/json" },
    body: `"${"x".repeat(1024 * 1024 + 1)}"`,
  });
  assert.equal(oversized.status, 413);
});

test("api/state reports rev, themes, slide statuses, and open requests (S6)", async (t) => {
  const dir = makeDeck({
    themes: { studio: DECK_THEME },
    requests: {
      version: 1,
      requests: [
        { id: "open1", kind: "comment", slideId: "second", text: "Open", status: "open", createdAt: "2024-01-01T00:00:00.000Z", resolvedAt: null },
        { id: "done1", kind: "comment", slideId: "second", text: "Done", status: "resolved", createdAt: "2024-01-01T00:00:00.000Z", resolvedAt: "2024-01-02T00:00:00.000Z" },
      ],
    },
  });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const empty = await call(studio, "api/state");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.plan, PLAN);
  assert.match(empty.body.rev, /^[a-f0-9]{64}\.(none|[a-f0-9]{64})$/);
  assert.equal(empty.body.slug, path.basename(dir));
  assert.deepEqual(
    empty.body.deck.slides.map((s) => [s.id, s.index, s.status, s.title]),
    [
      ["cover", 0, "pending", "Studio deck"],
      ["second", 1, "pending", "Second slide"],
      ["third", 2, "pending", "Third slide"],
    ],
  );
  assert.equal(empty.body.deck.exists, false);
  assert.deepEqual(sortedThemes(empty.body.themes), [
    ["studio", "deck"],
    ["fair-test", "repo"],
    ["fair-test-gentle", "repo"],
    ["gentleman-cute", "repo"],
  ]);
  assert.deepEqual(empty.body.requests.map((r) => r.id), ["open1"]);

  // The plan scaffold is the draft baseline: unchanged scaffold bodies are drafts.
  fs.writeFileSync(deckFile(dir), scaffoldDeck(PLAN));
  const scaffolded = await call(studio, "api/state");
  assert.equal(scaffolded.body.deck.exists, true);
  assert.notEqual(scaffolded.body.rev, empty.body.rev);
  assert.deepEqual(scaffolded.body.deck.slides.map((s) => s.status), ["draft", "draft", "draft"]);

  // A changed body is ready; a plan slide missing from the deck is pending; a deck-only slide is ready.
  const mixedDeck = scaffoldDeck(PLAN)
    .replace("- Two points", "- Two **edited** points")
    .replace(/\n---\n\nid: third\n\n## Third slide\n$/, "\n---\n\nid: extra\n\n## Extra slide\n");
  fs.writeFileSync(deckFile(dir), mixedDeck);
  const mixed = await call(studio, "api/state");
  assert.deepEqual(
    mixed.body.deck.slides.map((s) => [s.id, s.index, s.status, s.title]),
    [
      ["cover", 0, "draft", "Studio deck"],
      ["second", 1, "ready", "Second slide"],
      ["third", 2, "pending", "Third slide"],
      ["extra", 3, "ready", "Extra slide"],
    ],
  );
});

test("PUT api/plan persists a validated plan and 409s a stale rev (S7)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const { rev } = (await call(studio, "api/state")).body;
  const renamed = { ...PLAN, title: "Renamed deck" };
  const ok = await send(studio, "PUT", "api/plan", { rev, plan: renamed });
  assert.equal(ok.status, 200);
  assert.notEqual(ok.body.rev, rev);
  assert.equal(
    fs.readFileSync(path.join(dir, "plan.json"), "utf8"),
    JSON.stringify(renamed, null, 2) + "\n",
  );
  assert.equal((await call(studio, "api/state")).body.rev, ok.body.rev);

  const stale = await send(studio, "PUT", "api/plan", { rev, plan: { ...PLAN, title: "Other" } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body, { error: "stale", rev: ok.body.rev });

  const invalid = await send(studio, "PUT", "api/plan", { rev: ok.body.rev, plan: { title: "" } });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error, "invalid");
  assert.ok(invalid.body.problems.includes("$.slides: must be a non-empty array"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8")).title, "Renamed deck");
});

test("slides/<id>.html renders artboards with CSP, inspector, and ?theme override (S8)", async (t) => {
  const dir = makeDeck({ themes: { studio: DECK_THEME } });
  fs.writeFileSync(deckFile(dir), scaffoldDeck(PLAN));
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const res = await fetch(`${studio.base}slides/second.html`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(
    res.headers.get("content-security-policy"),
    `sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src ${studio.base}assets/; img-src data:`,
  );
  const html = await res.text();
  assert.match(html, /<section class="slide active" data-slide="2" data-slide-id="second">/);
  assert.match(html, /<h2>Second slide<\/h2>/);
  assert.match(html, new RegExp(`<script src="/${studio.token}/assets/inspector.js"></script>`));
  assert.match(html, /--bg: #060407/);
  assert.doesNotMatch(html, /--studio-marker: deck-local/);

  const themed = await (await fetch(`${studio.base}slides/second.html?theme=studio`)).text();
  assert.match(themed, /--studio-marker: deck-local/);
  assert.doesNotMatch(themed, /--bg: #060407/);

  // Plan slides that the deck lacks render from the plan scaffold.
  const partial = scaffoldDeck(PLAN).replace(/\n---\n\nid: third\n\n## Third slide\n$/, "\n");
  fs.writeFileSync(deckFile(dir), partial);
  const pending = await (await fetch(`${studio.base}slides/third.html`)).text();
  assert.match(pending, /data-slide-id="third"/);
  assert.match(pending, /<h2>Third slide<\/h2>/);
  assert.match(pending, /<div class="counter">3 \/ 3<\/div>/);

  assert.equal((await call(studio, "slides/ghost.html")).status, 404);
  const missingTheme = await call(studio, "slides/second.html?theme=nope");
  assert.equal(missingTheme.status, 422);
  assert.deepEqual(missingTheme.body, { error: "build", message: "theme not found: nope" });
});

test("slide build errors answer 422 build JSON (S8)", async (t) => {
  const dir = makeDeck({
    deck: "---\ntitle: Studio deck\ntheme: gentleman-cute\n---\n\nid: cover\nclass: cover\n\n# Studio deck\n\n---\n\nid: second\n\n::: nope\nbody\n:::\n",
  });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const res = await call(studio, "slides/second.html");
  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: "build", message: 'Unknown container ":::nope" on slide 2' });
});

test("POST api/requests validates, appends, prints a line, and dedupes overflow (S9)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const comment = await send(studio, "POST", "api/requests", {
    kind: "comment",
    slideId: "second",
    text: "Tighten this line",
    selector: ".slide > h2",
    excerpt: "Second slide",
  });
  assert.equal(comment.status, 200);
  assert.match(comment.body.request.id, /^[a-z0-9]{8,}$/);
  assert.deepEqual(
    { kind: comment.body.request.kind, slideId: comment.body.request.slideId, text: comment.body.request.text, status: comment.body.request.status, resolvedAt: comment.body.request.resolvedAt },
    { kind: "comment", slideId: "second", text: "Tighten this line", status: "open", resolvedAt: null },
  );
  assert.match(comment.body.request.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const commentId = comment.body.request.id;
  await waitFor(
    () => studio.stdout().includes(`request ${commentId} comment second\n`),
    4000,
    "request stdout line",
  );

  const generate = await send(studio, "POST", "api/requests", { kind: "generate", text: "Generate it" });
  assert.equal(generate.status, 200);
  await waitFor(
    () => studio.stdout().includes(`request ${generate.body.request.id} generate -\n`),
    4000,
    "generate stdout line",
  );

  const doc = JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8"));
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.requests.map((r) => r.id), [commentId, generate.body.request.id]);
  assert.deepEqual(Object.keys(doc.requests[0]), [
    "id", "kind", "slideId", "text", "selector", "excerpt", "status", "createdAt", "resolvedAt",
  ]);

  const invalid = [
    [{ kind: "nope" }, /^\$\.kind: /],
    [{ kind: "comment", slideId: "second" }, /^\$\.text: /],
    [{ kind: "comment", text: "No slide" }, /^\$\.slideId: /],
    [{ kind: "layout", slideId: "second", layout: "grid-9" }, /^\$\.layout: /],
    [{ kind: "layout", slideId: "second" }, /^\$\.layout: /],
    [{ kind: "add-slide", text: "Idea" }, /^\$\.slideId: /],
    [{ kind: "overflow" }, /^\$\.slideId: /],
    [{ kind: "comment", slideId: "Bad_Id", text: "x" }, /^\$\.slideId: /],
  ];
  for (const [payload, problem] of invalid) {
    const res = await send(studio, "POST", "api/requests", payload);
    assert.equal(res.status, 422, JSON.stringify(payload));
    assert.equal(res.body.error, "invalid");
    assert.ok(
      res.body.problems.some((p) => problem.test(p)),
      `${JSON.stringify(payload)} -> ${JSON.stringify(res.body.problems)}`,
    );
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8")).requests.length, 2);

  const layout = await send(studio, "POST", "api/requests", { kind: "layout", slideId: "second", layout: "grid-3" });
  assert.equal(layout.status, 200);
  assert.equal(layout.body.request.layout, "grid-3");

  const overflow = await send(studio, "POST", "api/requests", { kind: "overflow", slideId: "second" });
  assert.equal(overflow.status, 200);
  assert.equal(overflow.body.request.ignored, undefined);
  const duplicate = await send(studio, "POST", "api/requests", { kind: "overflow", slideId: "second" });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.ignored, true);
  assert.equal(duplicate.body.request.id, overflow.body.request.id);
  const otherSlide = await send(studio, "POST", "api/requests", { kind: "overflow", slideId: "third" });
  assert.equal(otherSlide.status, 200);
  assert.equal(otherSlide.body.ignored, undefined);

  const after = JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8"));
  assert.deepEqual(
    after.requests.filter((r) => r.kind === "overflow").map((r) => r.slideId),
    ["second", "third"],
  );
  assert.equal(studio.stdout().split(`overflow second`).length - 1, 1);

  // Only open duplicates are deduped.
  assert.equal(run("studio", "resolve", dir, overflow.body.request.id).code, 0);
  const reopened = await send(studio, "POST", "api/requests", { kind: "overflow", slideId: "second" });
  assert.equal(reopened.body.ignored, undefined);
});

test("POST api/requests accepts propose-style and validates its mode and theme (S10, S11)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const file = path.join(dir, "requests.json");

  // S10: a brand-new theme for this deck, with optional instructions from the user.
  const fresh = await send(studio, "POST", "api/requests", { kind: "propose-style", mode: "new", text: "Cold lab colors" });
  assert.equal(fresh.status, 200);
  assert.deepEqual(
    {
      kind: fresh.body.request.kind,
      mode: fresh.body.request.mode,
      theme: fresh.body.request.theme,
      text: fresh.body.request.text,
      status: fresh.body.request.status,
    },
    { kind: "propose-style", mode: "new", theme: undefined, text: "Cold lab colors", status: "open" },
  );
  await waitFor(
    () => studio.stdout().includes(`request ${fresh.body.request.id} propose-style -\n`),
    4000,
    "propose-style stdout line",
  );

  // `mode` defaults to "new", so the button works without sending it.
  const implicit = await send(studio, "POST", "api/requests", { kind: "propose-style" });
  assert.equal(implicit.status, 200);
  assert.equal(implicit.body.request.mode, "new");

  // S11: theme-level requests name the theme they target.
  const improve = await send(studio, "POST", "api/requests", { kind: "propose-style", mode: "improve", theme: "studio" });
  assert.equal(improve.status, 200);
  assert.equal(improve.body.request.theme, "studio");
  assert.equal(improve.body.request.mode, "improve");
  const comment = await send(studio, "POST", "api/requests", {
    kind: "propose-style",
    mode: "comment",
    theme: "studio",
    text: "More contrast on the title",
  });
  assert.equal(comment.status, 200);
  assert.equal(comment.body.request.text, "More contrast on the title");

  const before = fs.readFileSync(file);
  const invalid = [
    [{ kind: "propose-style", mode: "nope" }, /^\$\.mode: /],
    [{ kind: "propose-style", mode: "improve" }, /^\$\.theme: /],
    [{ kind: "propose-style", mode: "comment", theme: "studio" }, /^\$\.text: /],
    [{ kind: "propose-style", mode: "improve", theme: "two words" }, /^\$\.theme: /],
    [{ kind: "propose-style", mode: "improve", theme: "../etc/passwd" }, /^\$\.theme: /],
    [{ kind: "propose-style", text: "" }, /^\$\.text: /],
  ];
  for (const [payload, problem] of invalid) {
    const res = await send(studio, "POST", "api/requests", payload);
    assert.equal(res.status, 422, JSON.stringify(payload));
    assert.equal(res.body.error, "invalid");
    assert.ok(
      res.body.problems.some((p) => problem.test(p)),
      `${JSON.stringify(payload)} -> ${JSON.stringify(res.body.problems)}`,
    );
  }
  // The invalid payloads wrote nothing; the valid ones were appended in order.
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(doc.requests.map((r) => r.mode), ["new", "new", "improve", "comment"]);
  assert.ok(before.length > 0);
});

test("studio requests and resolve CLI read and update requests.json (S9)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  assert.deepEqual(run("studio", "requests", dir), { code: 0, stdout: "[]\n", stderr: "" });

  const first = await send(studio, "POST", "api/requests", { kind: "comment", slideId: "second", text: "Tighten" });
  const second = await send(studio, "POST", "api/requests", { kind: "redo", slideId: "third", text: "Warmer tone" });
  const open = run("studio", "requests", dir);
  assert.equal(open.code, 0);
  assert.equal(open.stderr, "");
  assert.deepEqual(JSON.parse(open.stdout), [first.body.request, second.body.request]);

  assert.deepEqual(run("studio", "resolve", dir, first.body.request.id), {
    code: 0,
    stdout: `resolved ${first.body.request.id}\n`,
    stderr: "",
  });
  assert.deepEqual(JSON.parse(run("studio", "requests", dir).stdout), [second.body.request]);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8"));
  assert.equal(doc.requests[0].status, "resolved");
  assert.match(doc.requests[0].resolvedAt, /^\d{4}-\d\d-\d\dT/);

  const before = fs.readFileSync(path.join(dir, "requests.json"), "utf8");
  assert.deepEqual(run("studio", "resolve", dir, second.body.request.id, "nope"), {
    code: 1,
    stdout: "",
    stderr: "unknown request nope\n",
  });
  assert.equal(fs.readFileSync(path.join(dir, "requests.json"), "utf8"), before);
});

// ---- Agent replies and the resolved feed (S8) ----

test("api/state lists the 50 most recently resolved requests, newest first (S8)", async (t) => {
  const resolved = Array.from({ length: 60 }, (_, i) => ({
    id: `done${String(i).padStart(2, "0")}`,
    kind: "comment",
    slideId: "second",
    text: `Resolved ${i}`,
    status: "resolved",
    createdAt: "2024-01-01T00:00:00.000Z",
    resolvedAt: new Date(Date.UTC(2024, 0, 2, 0, i)).toISOString(),
  }));
  const open = [
    { id: "open1", kind: "comment", slideId: "second", text: "Open", status: "open", createdAt: "2024-01-01T00:00:00.000Z", resolvedAt: null },
    { id: "open2", kind: "redo", slideId: "third", text: "Open too", status: "open", createdAt: "2024-01-01T00:00:00.000Z", resolvedAt: null },
  ];
  // Open requests sit first and last in the file: the split is by status, not by position.
  const dir = makeDeck({ requests: { version: 1, requests: [open[0], ...resolved, open[1]] } });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const state = (await call(studio, "api/state")).body;
  assert.deepEqual(state.requests.map((r) => r.id), ["open1", "open2"]);
  const expected = resolved.slice().reverse().slice(0, 50).map((r) => r.id);
  assert.equal(expected.length, 50);
  assert.deepEqual(state.resolved.map((r) => r.id), expected);
  assert.deepEqual(state.resolved[0], resolved[59]);
  assert.ok(state.resolved.every((r) => r.status === "resolved"));
});

test("studio reply stores an agent reply without resolving (S8)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const file = path.join(dir, "requests.json");
  const created = await send(studio, "POST", "api/requests", { kind: "comment", slideId: "second", text: "Tighten" });
  const { id } = created.body.request;

  assert.deepEqual(run("studio", "reply", dir, id, "Tightened the second slide"), {
    code: 0,
    stdout: `replied ${id}\n`,
    stderr: "",
  });
  const stored = JSON.parse(fs.readFileSync(file, "utf8")).requests.find((r) => r.id === id);
  assert.equal(stored.reply, "Tightened the second slide");
  assert.match(stored.repliedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(stored.status, "open");
  assert.equal(stored.resolvedAt, null);

  const state = (await call(studio, "api/state")).body;
  assert.deepEqual(state.requests.map((r) => [r.id, r.reply]), [[id, "Tightened the second slide"]]);
  assert.deepEqual(state.resolved, []);

  // A 2000-character reply is the accepted boundary; empty, blank, and longer ones fail untouched.
  assert.equal(run("studio", "reply", dir, id, "y".repeat(2000)).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).requests[0].reply.length, 2000);
  const before = fs.readFileSync(file);
  for (const text of ["", "   ", "z".repeat(2001)]) {
    assert.deepEqual(run("studio", "reply", dir, id, text), { code: 1, stdout: "", stderr: "invalid reply\n" });
    assert.deepEqual(fs.readFileSync(file), before);
  }
  assert.deepEqual(run("studio", "reply", dir, "nope", "text"), { code: 1, stdout: "", stderr: "unknown request nope\n" });
  assert.deepEqual(fs.readFileSync(file), before);
});

test("studio resolve --reply resolves every id with the reply (S8)", async (t) => {
  const dir = makeDeck({ deck: scaffoldDeck(PLAN) });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const file = path.join(dir, "requests.json");
  const a = (await send(studio, "POST", "api/requests", { kind: "comment", slideId: "second", text: "One" })).body.request.id;
  const b = (await send(studio, "POST", "api/requests", { kind: "redo", slideId: "third", text: "Two" })).body.request.id;
  const c = (await send(studio, "POST", "api/requests", { kind: "comment", slideId: "third", text: "Three" })).body.request.id;

  assert.deepEqual(run("studio", "resolve", dir, a, b, "--reply", "Tighter and warmer"), {
    code: 0,
    stdout: `resolved ${a}\nresolved ${b}\n`,
    stderr: "",
  });
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const request of doc.requests.filter((r) => r.id === a || r.id === b)) {
    assert.equal(request.status, "resolved");
    assert.equal(request.reply, "Tighter and warmer");
    assert.match(request.repliedAt, /^\d{4}-\d\d-\d\dT/);
    assert.match(request.resolvedAt, /^\d{4}-\d\d-\d\dT/);
  }
  const untouched = doc.requests.find((r) => r.id === c);
  assert.equal(untouched.status, "open");
  assert.equal(untouched.reply, undefined);

  const state = (await call(studio, "api/state")).body;
  assert.deepEqual(state.requests.map((r) => r.id), [c]);
  assert.deepEqual(state.resolved.map((r) => r.id).sort(), [a, b].sort());
  assert.ok(state.resolved.every((r) => r.reply === "Tighter and warmer"));

  // An unknown id cancels the whole command; an invalid reply fails before anything is written.
  const before = fs.readFileSync(file);
  assert.deepEqual(run("studio", "resolve", dir, c, "nope", "--reply", "Nope"), {
    code: 1,
    stdout: "",
    stderr: "unknown request nope\n",
  });
  assert.deepEqual(fs.readFileSync(file), before);
  for (const text of ["", "w".repeat(2001)]) {
    assert.deepEqual(run("studio", "resolve", dir, c, "--reply", text), {
      code: 1,
      stdout: "",
      stderr: "invalid reply\n",
    });
    assert.deepEqual(fs.readFileSync(file), before);
  }
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).requests.find((r) => r.id === c).status, "open");
});

test("a reply write streams an SSE change event (S8)", async (t) => {
  const dir = makeDeck({
    requests: {
      version: 1,
      requests: [
        { id: "open1", kind: "comment", slideId: "second", text: "Open", status: "open", createdAt: "2024-01-01T00:00:00.000Z", resolvedAt: null },
      ],
    },
  });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const res = await fetch(studio.base + "api/events");
  const reader = res.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  setTimeout(() => run("studio", "reply", dir, "open1", "Answered by the agent"), 150);

  let text = "";
  const deadline = Date.now() + 6000;
  while (!text.includes("event: change") && Date.now() < deadline) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`SSE timeout, got: ${JSON.stringify(text.slice(-200))}`)),
        Math.max(1, deadline - Date.now()),
      );
    });
    const chunk = await Promise.race([reader.read(), timeout]);
    clearTimeout(timer);
    if (chunk.done) break;
    text += new TextDecoder().decode(chunk.value, { stream: true });
  }
  assert.match(text, /event: change/);
  assert.ok(
    JSON.parse(fs.readFileSync(path.join(dir, "requests.json"), "utf8")).requests[0].reply === "Answered by the agent",
    "the reply CLI must write requests.json",
  );
  assert.equal((await call(studio, "api/state")).body.requests[0].reply, "Answered by the agent");
});

test("PUT api/slides/<id>/text edits one slide only (S10)", async (t) => {
  const deck = `---
title: Studio deck
theme: gentleman-cute
---

id: cover
class: cover

# Studio deck

- One deck

---

id: second
kicker: Two

## Second slide

Body line about [[pink|color]].

repeated words and repeated words.
`;
  const dir = makeDeck({ deck });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const { rev } = (await call(studio, "api/state")).body;
  const ok = await send(studio, "PUT", "api/slides/second/text", {
    rev,
    before: "Body line about",
    after: "Edited line about",
  });
  assert.equal(ok.status, 200);
  assert.match(ok.body.rev, /^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  const updated = fs.readFileSync(deckFile(dir), "utf8");
  assert.equal(updated, deck.replace("Body line about", "Edited line about"));
  assert.equal((await call(studio, "api/state")).body.rev, ok.body.rev);

  const notFound = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "Absent text", after: "x" });
  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.body, { error: "not-found" });
  assert.equal(fs.readFileSync(deckFile(dir), "utf8"), updated);

  // Other slides are never searched, and directives are never edited.
  const otherSlide = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "One deck", after: "x" });
  assert.equal(otherSlide.status, 404);
  const directive = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "Two", after: "x" });
  assert.equal(directive.status, 404);
  const unknownSlide = await send(studio, "PUT", "api/slides/ghost/text", { rev: ok.body.rev, before: "x", after: "y" });
  assert.equal(unknownSlide.status, 404);
  assert.equal(fs.readFileSync(deckFile(dir), "utf8"), updated);

  const ambiguous = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "repeated words", after: "x" });
  assert.equal(ambiguous.status, 409);
  assert.deepEqual(ambiguous.body, { error: "ambiguous" });
  assert.equal(fs.readFileSync(deckFile(dir), "utf8"), updated);

  const multiline = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "Edited\nline", after: "x" });
  assert.equal(multiline.status, 422);
  const empty = await send(studio, "PUT", "api/slides/second/text", { rev: ok.body.rev, before: "   ", after: "x" });
  assert.equal(empty.status, 422);

  const current = (await call(studio, "api/state")).body.rev;
  const stale = await send(studio, "PUT", "api/slides/second/text", { rev, before: "Edited line about", after: "x" });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body, { error: "stale", rev: current });
  assert.equal(fs.readFileSync(deckFile(dir), "utf8"), updated);
});

test("api/events streams a change event after a file write (S11)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const controller = new AbortController();
  t.after(() => controller.abort());
  const res = await fetch(`${studio.base}api/events`, { signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/event-stream/);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ ...PLAN, title: "Live deck" }, null, 2) + "\n");
  const expected = (await call(studio, "api/state")).body.rev;

  const deadline = Date.now() + 6000;
  while (!text.includes(`data: {"rev":${JSON.stringify(expected)},`) && Date.now() < deadline) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`SSE timeout, got: ${JSON.stringify(text.slice(-200))}`)), Math.max(1, deadline - Date.now()));
    });
    const chunk = await Promise.race([reader.read(), timeout]);
    clearTimeout(timer);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  assert.match(text, /^event: change\n/);
  assert.ok(text.includes(`data: {"rev":${JSON.stringify(expected)},"themes":"`), `got: ${JSON.stringify(text)}`);
  await reader.cancel();
});

test("GET present returns the navigable deck or 404 (S12)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  assert.equal((await call(studio, "present")).status, 404);
  fs.writeFileSync(deckFile(dir), scaffoldDeck(PLAN));
  const res = await call(studio, "present");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.match(res.text, /function show\(n\)/);
  assert.equal((res.text.match(/<section class="slide/g) || []).length, 3);
  assert.match(res.text, /<title>Studio deck<\/title>/);
  assert.match(res.text, /id="counter"/);
});

test("studio serves the inspector asset and 404s unknown assets (S5, L4)", async (t) => {
  const studio = await startStudio(makeDeck({ deck: scaffoldDeck(PLAN) }));
  t.after(() => stopStudio(studio));

  const asset = await call(studio, "assets/inspector.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /^text\/javascript/);
  for (const marker of ["gd:ready", "gd:pick", "gd:edit", "gd:mode"]) {
    assert.ok(asset.text.includes(marker), `inspector is missing ${marker}`);
  }
  assert.equal((await call(studio, "assets/app.js")).status, 404);
  assert.equal((await call(studio, "assets/..%2fpackage.json")).status, 404);
  assert.equal((await call(studio, "assets/../package.json")).status, 404);
});

test("a deck can ship its own themes and a missing theme fails the build (S4)", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "themes"));
  fs.writeFileSync(path.join(dir, "themes", "local.css"), DECK_THEME);
  const deck = deckFile(dir);
  fs.writeFileSync(deck, "---\ntitle: Local\ntheme: local\n---\n\n# Hi\n");

  const out = path.join(dir, "out.html");
  const ok = run(deck, "-o", out);
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(fs.readFileSync(out, "utf8"), /--studio-marker: deck-local/);

  const design = path.join(dir, "design");
  assert.equal(run(deck, "--design", design).code, 0);
  assert.match(fs.readFileSync(path.join(design, "slides", "slide-1.html"), "utf8"), /--studio-marker: deck-local/);

  // Deck-local themes shadow repo themes with the same name.
  fs.writeFileSync(path.join(dir, "themes", "gentleman-cute.css"), ".deck { --shadow: deck-theme; }\n");
  fs.writeFileSync(deck, "---\ntitle: Local\ntheme: gentleman-cute\n---\n\n# Hi\n");
  const shadowed = path.join(dir, "shadowed.html");
  assert.equal(run(deck, "-o", shadowed).code, 0);
  const shadowHtml = fs.readFileSync(shadowed, "utf8");
  assert.match(shadowHtml, /--shadow: deck-theme/);
  assert.doesNotMatch(shadowHtml, /--bg: #060407/);

  fs.writeFileSync(deck, "---\ntitle: Local\ntheme: nope\n---\n\n# Hi\n");
  const missingOut = path.join(dir, "missing.html");
  assert.deepEqual(run(deck, "-o", missingOut), {
    code: 1,
    stdout: "",
    stderr: "build failed: theme not found: nope\n",
  });
  assert.equal(fs.existsSync(missingOut), false);
  const missingDesign = path.join(dir, "missing-design");
  assert.deepEqual(run(deck, "--design", missingDesign), {
    code: 1,
    stdout: "",
    stderr: "build failed: theme not found: nope\n",
  });
  assert.equal(fs.existsSync(missingDesign), false);
});

test("theme check accepts a CSS path (S4)", () => {
  assert.deepEqual(run("theme", "check", "themes/gentleman-cute.css"), {
    code: 0,
    stdout: "ok: themes/gentleman-cute.css\n",
    stderr: "",
  });
  const dir = tmp();
  const partial = path.join(dir, "partial.css");
  fs.writeFileSync(partial, ".deck { }\n");
  const r = run("theme", "check", partial);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.ok(r.stderr.startsWith(`missing selectors in ${partial}: .slide, .slide.active, `), r.stderr);
  const missing = path.join(dir, "nope.css");
  assert.deepEqual(run("theme", "check", missing), {
    code: 1,
    stdout: "",
    stderr: `theme not found: ${missing}\n`,
  });
});

test("studio commands without arguments print usage and exit 2 (S14)", () => {
  for (const args of [
    ["studio"],
    ["studio", "requests"],
    ["studio", "resolve", "."],
    ["studio", "reply"],
    ["studio", "reply", "."],
    ["studio", "resolve", ".", "id", "--reply"],
  ]) {
    const r = run(...args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^usage: decks <deck\.md> \(-o <out\.html> \| --design <dir>\)\n/);
    assert.match(r.stderr, /decks studio <deck-dir> \[--port N\]/);
    assert.match(r.stderr, /decks studio reply <deck-dir> <id> <text>/);
    assert.match(r.stderr, /decks studio resolve <deck-dir> <id\.\.\.> \[--reply <text>\]/);
  }
});

// ---- Security hardening ----

const ONE_SLIDE = `---\ntitle: T\n---\n\nid: cover\n\n# Cover\n\n- one\n`;

test("present is sandboxed like the artboards and keeps the -o bytes (F1)", async (t) => {
  const dir = makeDeck({ deck: ONE_SLIDE });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const r = await call(studio, "present");
  assert.equal(r.status, 200);
  assert.equal(
    r.headers.get("content-security-policy"),
    "sandbox allow-scripts allow-popups; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
  );
  const out = path.join(dir, "out.html");
  const built = spawnSync(process.execPath, [CLI, deckFile(dir), "-o", out], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(r.text, fs.readFileSync(out, "utf8"));
});

test("artboard scripts are limited to the studio assets path (F3)", async (t) => {
  const studio = await startStudio(makeDeck({ deck: ONE_SLIDE }));
  t.after(() => stopStudio(studio));
  const r = await call(studio, "slides/cover.html");
  assert.equal(
    r.headers.get("content-security-policy"),
    `sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src ${studio.base}assets/; img-src data:`,
  );
});

test("api/events carries a themes fingerprint that changes with deck themes (F2)", async (t) => {
  const dir = makeDeck({ deck: ONE_SLIDE });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const res = await fetch(studio.base + "api/events");
  const reader = res.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  setTimeout(() => {
    fs.mkdirSync(path.join(dir, "themes"));
    fs.writeFileSync(path.join(dir, "themes", "t.css"), "/* t */");
  }, 100);
  let text = "";
  const end = Date.now() + 4000;
  while (Date.now() < end && !text.includes("event: change")) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  const data = JSON.parse(text.split("event: change\ndata: ")[1].split("\n")[0]);
  assert.equal(data.rev, (await call(studio, "api/state")).body.rev);
  assert.match(data.themes, /^[0-9a-f]{64}$/);
});

test("text edits reject a multi-line after and leave the deck unchanged (F4)", async (t) => {
  const dir = makeDeck({ deck: ONE_SLIDE });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const before = fs.readFileSync(deckFile(dir));
  const rev = (await call(studio, "api/state")).body.rev;
  const r = await send(studio, "PUT", "api/slides/cover/text", { rev, before: "one", after: "x\n\n---\n\nid: evil" });
  assert.equal(r.status, 422);
  assert.deepEqual(r.body, { error: "invalid", problems: ["$.after: must be a single-line string"] });
  assert.deepEqual(fs.readFileSync(deckFile(dir)), before);
});

test("studio routes reject traversal on assets, slides, text, and theme (S5)", async (t) => {
  const studio = await startStudio(makeDeck({ deck: ONE_SLIDE }));
  t.after(() => stopStudio(studio));
  for (const p of ["assets/../plan.json", "assets/..%2f..%2fplan.json", "assets//etc/passwd", "slides/..%2fplan.html", "slides/../../etc/passwd.html"]) {
    assert.equal((await call(studio, p)).status, 404, p);
  }
  for (const theme of ["../../etc/passwd", "..%2f..%2fetc%2fpasswd", "/etc/passwd"]) {
    const r = await call(studio, `slides/cover.html?theme=${theme}`);
    assert.equal(r.status, 422, theme);
    assert.equal(r.body.error, "build");
  }
  assert.equal((await send(studio, "PUT", "api/slides/..%2f..%2fplan/text", { rev: "x", before: "a", after: "b" })).status, 404);
});

test("failed text edits leave the deck byte-identical (S10)", async (t) => {
  const deck = `---\ntitle: T\n---\n\nid: cover\n\n# Cover\n\n- dup dup\n\n---\n\nid: two\nlayout: grid-2\n\n## Two\n\n- other\n`;
  const dir = makeDeck({ deck });
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const before = fs.readFileSync(deckFile(dir));
  const rev = (await call(studio, "api/state")).body.rev;
  for (const body of [
    { rev, before: "other", after: "x" },
    { rev, before: "layout: grid-2", after: "x" },
    { rev, before: "", after: "x" },
    { rev: "stale", before: "dup", after: "x" },
  ]) {
    const r = await send(studio, "PUT", "api/slides/cover/text", body);
    assert.notEqual(r.status, 200, JSON.stringify(body));
    assert.deepEqual(fs.readFileSync(deckFile(dir)), before);
  }
});

test("the studio lists user themes between deck and bundled themes and repaints on their edits", async (t) => {
  const userDir = tmp();
  fs.writeFileSync(path.join(userDir, "mine.css"), "/* user theme */\n");
  fs.writeFileSync(path.join(userDir, "studio.css"), "/* shadowed by the deck */\n");
  const dir = makeDeck({ deck: ONE_SLIDE, themes: { studio: DECK_THEME } });
  const studio = await startStudio(dir, { ...process.env, GENTLE_DECKS_THEMES: userDir });
  t.after(() => stopStudio(studio));

  const state = await call(studio, "api/state");
  assert.deepEqual(sortedThemes(state.body.themes), [
    ["studio", "deck"],
    ["mine", "user"],
    ["fair-test", "repo"],
    ["fair-test-gentle", "repo"],
    ["gentleman-cute", "repo"],
  ]);

  const res = await fetch(studio.base + "api/events");
  const reader = res.body.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  setTimeout(() => fs.writeFileSync(path.join(userDir, "mine.css"), "/* user theme, edited */\n"), 100);
  let text = "";
  const end = Date.now() + 4000;
  while (Date.now() < end && !text.includes("event: change")) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  assert.ok(text.includes("event: change"), "a user theme edit did not reach api/events");
});
