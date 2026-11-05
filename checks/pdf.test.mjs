// `decks pdf` (S4): the static deliverable comes from the CLI, not from the browser print dialog.
// Run: node --test checks/*.test.mjs   (needs Chrome/Chromium; set BROWSER or CHROME_PATH to choose)
// The PDF producing tests skip on hosts without a Chromium-based browser; the failure paths always run.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
// User themes come from GENTLE_DECKS_THEMES, else $XDG_CONFIG_HOME, else ~/.config. Every run gets
// an explicit, empty location so the developer's own themes never leak into a test.
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-pdf-"));
  scratch.push(dir);
  return dir;
};
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});
const ENV = { ...process.env, GENTLE_DECKS_THEMES: tmp() };
const runEnv = (env, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env, timeout: 120000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const run = (...args) => runEnv(ENV, ...args);

// Mirrors the CLI probe (src/pdf.js): a browser is only needed to run the PDF assertions.
const BROWSER_CANDIDATES = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const browser = [process.env.BROWSER, process.env.CHROME_PATH, ...BROWSER_CANDIDATES].find(
  (file) => file && fs.existsSync(file),
);
const needsBrowser = browser ? {} : { skip: "no Chromium-based browser found (set BROWSER)" };

const DECK = `---
title: Pdf fixture
theme: gentleman-cute
brand: decks
---

kicker: Uno
# Primera diapositiva

---

kicker: Dos
## Segunda diapositiva
`;

function makeDeck() {
  const dir = tmp();
  const file = path.join(dir, "pdf-probe.md");
  fs.writeFileSync(file, DECK);
  return { dir, file };
}

const header = (file) => fs.readFileSync(file).subarray(0, 5).toString("latin1");

test("pdf writes <deck>.pdf next to the deck markdown", needsBrowser, () => {
  const { dir, file } = makeDeck();
  const r = run("pdf", file);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  const out = path.join(dir, "pdf-probe.pdf");
  assert.equal(r.stdout, `pdf -> ${out}\n`);
  assert.equal(header(out), "%PDF-");
  assert.ok(fs.statSync(out).size > 1000, `pdf too small: ${fs.statSync(out).size} bytes`);
});

test("pdf -o writes the PDF at the given path", needsBrowser, () => {
  const { dir, file } = makeDeck();
  const out = path.join(dir, "nested", "deck.pdf");
  const r = run("pdf", file, "-o", out);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `pdf -> ${out}\n`);
  assert.equal(header(out), "%PDF-");
});

test("pdf fails clearly, and writes nothing, when no Chrome can be found", () => {
  const { dir, file } = makeDeck();
  const env = { ...ENV, BROWSER: "/nonexistent/chrome" };
  delete env.CHROME_PATH;
  const r = runEnv(env, "pdf", file);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  // The message names every source it tried, so a typo in BROWSER is not a silent mystery.
  assert.match(r.stderr, /^pdf: no Chrome found/);
  assert.match(r.stderr, /BROWSER=\/nonexistent\/chrome/);
  assert.match(r.stderr, /CHROME_PATH/);
  assert.deepEqual(fs.readdirSync(dir), ["pdf-probe.md"]);
});

test("pdf without a deck prints usage and exits 2", () => {
  const r = run("pdf");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /decks pdf <deck\.md>/);
});
