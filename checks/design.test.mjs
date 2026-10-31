// Design mode: one gentle-design artboard per slide. Run: node --test checks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const SAMPLE = path.resolve("decks/sample/gentle-decks.md");

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "decks-design-"));

const DECK = `---
title: Tiny deck
brief: Two slides for the design-mode test
theme: gentleman-cute
---

class: cover

# Hello [[grad|world]]

---

kicker: Two

## Second **slide**

::: card
Body
:::
`;

function writeDeck(dir, body = DECK) {
  const file = path.join(dir, "deck.md");
  fs.writeFileSync(file, body);
  return file;
}

test("writes one artboard per slide and a design.json manifest", () => {
  const dir = tmp();
  const out = path.join(dir, "design", "tiny");
  const r = run(writeDeck(dir), "--design", out);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, `2 slides -> ${out}\n`);
  assert.deepEqual(fs.readdirSync(out).sort(), ["01-slide.html", "02-slide.html", "design.json"]);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "design.json"), "utf8"));
  assert.deepEqual(manifest, {
    title: "Tiny deck",
    brief: "Two slides for the design-mode test",
    artboards: [
      { file: "01-slide.html", title: "01 · Hello world", tradeoff: "", width: 1600, height: 900 },
      { file: "02-slide.html", title: "02 · Second slide", tradeoff: "", width: 1600, height: 900 },
    ],
  });
});

test("each artboard is a self-contained static slide", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  assert.equal(run(writeDeck(dir), "--design", out).code, 0);
  const html = fs.readFileSync(path.join(out, "02-slide.html"), "utf8");
  assert.equal((html.match(/<section class="slide/g) || []).length, 1);
  assert.match(html, /<section class="slide active" data-slide="2">/);
  assert.match(html, /<h2>Second <strong>slide<\/strong><\/h2>/);
  assert.match(html, /<div class="card">/);
  assert.match(html, /<style>[\s\S]*\.slide[\s\S]*<\/style>/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.match(html, /<div class="counter">2 \/ 2<\/div>/);
  const cover = fs.readFileSync(path.join(out, "01-slide.html"), "utf8");
  assert.match(cover, /<section class="slide cover active" data-slide="1">/);
});

test("design output is byte-identical across builds", () => {
  const dir = tmp();
  const deck = writeDeck(dir);
  const out = path.join(dir, "d");
  run(deck, "--design", out);
  const first = fs.readdirSync(out).map((f) => fs.readFileSync(path.join(out, f), "utf8"));
  run(deck, "--design", out);
  const second = fs.readdirSync(out).map((f) => fs.readFileSync(path.join(out, f), "utf8"));
  assert.deepEqual(second, first);
});

test("removes stale slide artboards and keeps canvas files", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "07-slide.html"), "stale");
  fs.writeFileSync(path.join(out, "comments.json"), '{"version":1,"comments":[]}');
  assert.equal(run(writeDeck(dir), "--design", out).code, 0);
  assert.deepEqual(fs.readdirSync(out).sort(), ["01-slide.html", "02-slide.html", "comments.json", "design.json"]);
  assert.equal(fs.readFileSync(path.join(out, "comments.json"), "utf8"), '{"version":1,"comments":[]}');
});

test("unknown container fails with the slide number and writes nothing", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  const deck = writeDeck(dir, "---\ntitle: t\n---\nkicker: x\n\n::: nope\nbody\n:::\n");
  const r = run(deck, "--design", out);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, 'build failed: Unknown container ":::nope" on slide 1\n');
  assert.equal(fs.existsSync(out), false);
});

test("-o still writes the single navigable deck unchanged", () => {
  const dir = tmp();
  const out = path.join(dir, "deck.html");
  const r = run(SAMPLE, "-o", out);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `8 slides -> ${out}\n`);
  const committed = fs.readFileSync("decks/sample/gentle-decks.html", "utf8");
  assert.equal(fs.readFileSync(out, "utf8"), committed);
});

test("missing output target prints usage and exits 2", () => {
  const r = run(SAMPLE);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "usage: decks <deck.md> (-o <out.html> | --design <dir>)\n");
});
