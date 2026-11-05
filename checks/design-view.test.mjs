// Design view integration (S1): the gentle-design canvas is a separate loopback app the agent opens,
// so the studio stores its URL, reports whether it still answers as the canvas, and never embeds it.
// Run: node --test checks/design-view.test.mjs
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-design-view-"));
  scratch.push(dir);
  return dir;
};
// An empty user themes dir, so themes in the developer's ~/.config never leak into the checks.
const NO_USER_THEMES = tmp();
const ENV = { ...process.env, GENTLE_DECKS_THEMES: NO_USER_THEMES };

after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

const PLAN = {
  version: 1,
  title: "Design view deck",
  goal: "Keep the studio the home",
  lang: "en",
  theme: "gentleman-cute",
  slides: [{ id: "cover", title: "Design view deck", points: ["One deck"] }],
};
const ONE_SLIDE = "---\ntitle: One\n---\n\nid: cover\n\n# Cover\n\n- one\n";

function makeDeck() {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(PLAN, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, `${path.basename(dir)}.md`), ONE_SLIDE);
  return dir;
}

const canvasFile = (dir) => path.join(dir, ".studio-canvas");

function stopStudio(studio) {
  if (studio.child.exitCode === null && studio.child.signalCode === null) studio.child.kill("SIGKILL");
  return studio.exited;
}

// Starts `decks studio <dir> --port 0` and resolves on the printed URL line.
function startStudio(dir) {
  const child = spawn(process.execPath, [CLI, "studio", dir, "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: ENV,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`studio did not print its URL in 10s. stderr: ${stderr}`)), 10000);
    const check = () => {
      const m = stdout.match(/^studio: (http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]+)\/)$/m);
      if (!m) return false;
      clearTimeout(timer);
      resolve({
        child,
        exited,
        base: m[1],
        port: Number(m[2]),
        origin: `http://127.0.0.1:${m[2]}`,
        token: m[3],
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
  return { status: res.status, body, text };
}

const send = (studio, method, route, payload) =>
  call(studio, route, {
    method,
    headers: { Origin: studio.origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// A loopback page shaped like the gentle-design canvas: the probe accepts it only when it carries
// the canvas page markers, so any other local page is reported as "not the canvas".
async function startPage(markers) {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head>${markers}</head><body></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

const CANVAS_PAGE = '<title>Gentle Design</title><script id="gd-config" type="application/json">{}</script>';
const OTHER_PAGE = '<title>Otra página local</title><div id="otra"></div>';
const canvasUrl = (port, slug = "demo") => `http://127.0.0.1:${port}/tok3n/d/${slug}/`;

// A port nothing listens on, for the "canvas was closed" case.
async function closedPort() {
  const page = await startPage(CANVAS_PAGE);
  const port = page.port;
  await page.close();
  return port;
}

test("api/state reports no canvas link until one is saved (S1)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  const state = await call(studio, "api/state");
  assert.equal(state.status, 200);
  assert.equal(state.body.canvas, null);
  // Reading the state never creates the canvas file.
  assert.equal(fs.existsSync(canvasFile(dir)), false);

  const probe = await call(studio, "api/canvas");
  assert.equal(probe.status, 200);
  assert.deepEqual(probe.body, { url: null, running: false });
});

test("a loopback canvas URL is stored, normalized and reported by api/state (S1)", async (t) => {
  const page = await startPage(CANVAS_PAGE);
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(async () => {
    await stopStudio(studio);
    await page.close();
  });

  const url = canvasUrl(page.port);
  // The agent's chat message may carry a fragment or query: only the canvas origin and path are kept.
  const saved = await send(studio, "PUT", "api/canvas", { url: `${url}?from=chat#artboard` });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { url, running: true });
  assert.equal(fs.readFileSync(canvasFile(dir), "utf8"), `${url}\n`);

  const state = await call(studio, "api/state");
  assert.deepEqual(state.body.canvas, { url });

  // Saving another URL replaces the stored one instead of appending.
  const second = `http://127.0.0.1:${page.port}/other-token/`;
  assert.equal((await send(studio, "PUT", "api/canvas", { url: second })).status, 200);
  assert.equal(fs.readFileSync(canvasFile(dir), "utf8"), `${second}\n`);
  assert.deepEqual((await call(studio, "api/state")).body.canvas, { url: second });
});

test("invalid canvas URLs are rejected and write nothing (S1)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const port = await closedPort();
  const problems = [
    "$.url: must be a loopback http(s) URL with the canvas token path, such as http://127.0.0.1:1234/<token>/",
  ];
  for (const url of [
    "https://example.com/tok3n/",
    "file:///etc/passwd",
    `http://127.0.0.1:${port}`, // no token path
    `http://127.0.0.1:${port}/`,
    `http://user:pw@127.0.0.1:${port}/tok3n/`,
    "127.0.0.1:1234/tok3n/",
    "",
    1234,
  ]) {
    const r = await send(studio, "PUT", "api/canvas", { url });
    assert.equal(r.status, 422, JSON.stringify(url));
    assert.deepEqual(r.body, { error: "invalid", problems }, JSON.stringify(url));
    assert.equal(fs.existsSync(canvasFile(dir)), false, JSON.stringify(url));
  }
  assert.deepEqual((await call(studio, "api/state")).body.canvas, null);
});

test("api/canvas reports whether the saved link still answers as the canvas (S1)", async (t) => {
  const page = await startPage(CANVAS_PAGE);
  const other = await startPage(OTHER_PAGE);
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(async () => {
    await stopStudio(studio);
    await page.close();
    await other.close();
  });

  const url = canvasUrl(page.port);
  await send(studio, "PUT", "api/canvas", { url });
  assert.deepEqual((await call(studio, "api/canvas")).body, { url, running: true });

  // A loopback page that is not the canvas is never offered as one.
  const otherUrl = `http://127.0.0.1:${other.port}/tok3n/`;
  const savedOther = await send(studio, "PUT", "api/canvas", { url: otherUrl });
  assert.equal(savedOther.status, 200);
  assert.deepEqual(savedOther.body, { url: otherUrl, running: false });
  assert.deepEqual((await call(studio, "api/canvas")).body, { url: otherUrl, running: false });

  // The canvas closed: the link is still reported, but never as running, and the studio keeps
  // serving the deck (the page the user comes back to).
  await page.close();
  await send(studio, "PUT", "api/canvas", { url });
  assert.deepEqual((await call(studio, "api/canvas")).body, { url, running: false });
  assert.equal((await call(studio, "api/state")).status, 200);
  assert.equal((await call(studio, "slides/cover.html")).status, 200);
});

test("a corrupt canvas file is ignored, never trusted (S1)", async (t) => {
  const dir = makeDeck();
  fs.writeFileSync(canvasFile(dir), "not a url\n");
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));

  assert.deepEqual((await call(studio, "api/state")).body.canvas, null);
  assert.deepEqual((await call(studio, "api/canvas")).body, { url: null, running: false });

  // A file naming a non-loopback origin is corrupt too, never a link the studio would offer.
  fs.writeFileSync(canvasFile(dir), "https://evil.example/tok3n/\n");
  assert.deepEqual((await call(studio, "api/state")).body.canvas, null);
});

test("saving the canvas URL needs same-origin JSON, like every other write (S5)", async (t) => {
  const dir = makeDeck();
  const studio = await startStudio(dir);
  t.after(() => stopStudio(studio));
  const url = `http://127.0.0.1:${await closedPort()}/tok3n/`;

  const noOrigin = await call(studio, "api/canvas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  assert.equal(noOrigin.status, 403);
  const foreign = await call(studio, "api/canvas", {
    method: "PUT",
    headers: { Origin: "http://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  assert.equal(foreign.status, 403);
  const form = await call(studio, "api/canvas", {
    method: "PUT",
    headers: { Origin: studio.origin, "Content-Type": "text/plain" },
    body: JSON.stringify({ url }),
  });
  assert.equal(form.status, 415);
  assert.equal(fs.existsSync(canvasFile(dir)), false);
});
