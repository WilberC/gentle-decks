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

id: second
kicker: Two

## Second **slide**

::: figure src=images/dot.png alt="Un punto" caption="Fuente: ejemplo"
:::

::: card
Body
:::
`;

function writeDeck(dir, body = DECK) {
  const file = path.join(dir, "deck.md");
  fs.writeFileSync(file, body);
  return file;
}

test("figure renders an img with caption and fails without src (S8)", () => {
  const dir = tmp();
  const out = path.join(dir, "design", "tiny");
  const r = run(writeDeck(dir), "--design", out);
  assert.equal(r.code, 0, r.stderr);
  const html = fs.readFileSync(path.join(out, "slides", "second.html"), "utf8");
  assert.match(html, /<figure class="figure">/);
  assert.match(html, /<img src="images\/dot\.png" alt="Un punto">/);
  assert.match(html, /<figcaption>Fuente: ejemplo<\/figcaption>/);

  const bad = DECK.replace('src=images/dot.png alt="Un punto" caption="Fuente: ejemplo"', 'alt="Un punto"');
  const r2 = run(writeDeck(tmp(), bad), "-o", path.join(tmp(), "out.html"));
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /build failed:.*figure.*src.*slide 2/s);
});

test("writes one artboard per slide and a design.json manifest", () => {
  const dir = tmp();
  const out = path.join(dir, "design", "tiny");
  const r = run(writeDeck(dir), "--design", out);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, `2 slides -> ${out}\n`);
  assert.deepEqual(fs.readdirSync(out).sort(), ["design.json", "slides"]);
  assert.deepEqual(fs.readdirSync(path.join(out, "slides")).sort(), ["second.html", "slide-1.html"]);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "design.json"), "utf8"));
  assert.deepEqual(manifest, {
    title: "Tiny deck",
    brief: "Two slides for the design-mode test",
    artboards: [
      { file: "slides/slide-1.html", title: "01 · Hello world", tradeoff: "", width: 1600, height: 900 },
      { file: "slides/second.html", title: "02 · Second slide", tradeoff: "", width: 1600, height: 900 },
    ],
  });
});

test("each artboard is a self-contained static slide", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  assert.equal(run(writeDeck(dir), "--design", out).code, 0);
  const html = fs.readFileSync(path.join(out, "slides", "second.html"), "utf8");
  assert.equal((html.match(/<section class="slide/g) || []).length, 1);
  assert.match(html, /<section class="slide active" data-slide="2" data-slide-id="second">/);
  assert.match(html, /<h2>Second <strong>slide<\/strong><\/h2>/);
  assert.match(html, /<div class="card">/);
  assert.match(html, /<style>[\s\S]*\.slide[\s\S]*<\/style>/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.match(html, /<div class="counter">2 \/ 2<\/div>/);
  const cover = fs.readFileSync(path.join(out, "slides", "slide-1.html"), "utf8");
  assert.match(cover, /<section class="slide cover active" data-slide="1" data-slide-id="slide-1">/);
});

test("design output is byte-identical across builds", () => {
  const dir = tmp();
  const deck = writeDeck(dir);
  const out = path.join(dir, "d");
  run(deck, "--design", out);
  const snapshot = () =>
    fs.readdirSync(out, { recursive: true }).sort()
      .filter((f) => fs.statSync(path.join(out, f)).isFile())
      .map((f) => [f, fs.readFileSync(path.join(out, f), "utf8")]);
  const first = snapshot();
  run(deck, "--design", out);
  const second = snapshot();
  assert.deepEqual(second, first);
});

test("removes stale slide artboards and keeps canvas files", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  fs.mkdirSync(path.join(out, "slides"), { recursive: true });
  fs.writeFileSync(path.join(out, "slides", "gone.html"), "stale");
  fs.writeFileSync(path.join(out, "slides", "notes.txt"), "keep");
  fs.writeFileSync(path.join(out, "comments.json"), '{"version":1,"comments":[]}');
  assert.equal(run(writeDeck(dir), "--design", out).code, 0);
  assert.deepEqual(fs.readdirSync(out).sort(), ["comments.json", "design.json", "slides"]);
  assert.deepEqual(fs.readdirSync(path.join(out, "slides")).sort(), ["notes.txt", "second.html", "slide-1.html"]);
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

test("reordering slides keeps each slide's file name", () => {
  const dir = tmp();
  const out = path.join(dir, "d");
  const [front, a, b] = DECK.split("\n---\n\n");
  assert.equal(run(writeDeck(dir, `${front}\n---\n\n${b}\n---\n\nid: cover\n${a}`), "--design", out).code, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "design.json"), "utf8"));
  assert.deepEqual(manifest.artboards.map((x) => [x.file, x.title]), [
    ["slides/second.html", "01 · Second slide"],
    ["slides/cover.html", "02 · Hello world"],
  ]);
});

for (const [name, deck, message] of [
  ["duplicate", "---\ntitle: t\n---\nid: same\n\n## A\n\n---\n\nid: same\n\n## B\n", 'Duplicate slide id "same" on slide 2'],
  ["invalid", "---\ntitle: t\n---\nid: Bad_Id\n\n## A\n", 'Invalid slide id "Bad_Id" on slide 1'],
  ["collides with default", "---\ntitle: t\n---\n## A\n\n---\n\nid: slide-1\n\n## B\n", 'Duplicate slide id "slide-1" on slide 2'],
]) {
  for (const mode of ["--design", "-o"]) {
    test(`${name} slide id fails the build (${mode}) and writes nothing`, () => {
      const dir = tmp();
      const out = path.join(dir, mode === "-o" ? "deck.html" : "d");
      const r = run(writeDeck(dir, deck), mode, out);
      assert.equal(r.code, 1);
      assert.equal(r.stdout, "");
      assert.equal(r.stderr, `build failed: ${message}\n`);
      assert.equal(fs.existsSync(out), false);
    });
  }
}

test("-o still writes the single navigable deck unchanged", () => {
  const dir = tmp();
  const out = path.join(dir, "deck.html");
  const r = run(SAMPLE, "-o", out);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, `8 slides -> ${out}\n`);
  const committed = fs.readFileSync("decks/sample/gentle-decks.html", "utf8");
  assert.equal(fs.readFileSync(out, "utf8"), committed);
});

test("external links open in a new tab so exports keep cited resources (S9b)", () => {
  const dir = tmp();
  const deck = DECK.replace("Body", "Fuente: [Python docs](https://docs.python.org/3/)");
  const out = path.join(dir, "out.html");
  const r = run(writeDeck(dir, deck), "-o", out);
  assert.equal(r.code, 0, r.stderr);
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /<a target="_blank" rel="noopener noreferrer" href="https:\/\/docs\.python\.org\/3\/">/);
});

test("missing output target prints usage and exits 2", () => {
  const r = run(SAMPLE);
  assert.equal(r.code, 2);
  assert.equal(r.stdout, "");
  assert.equal(
    r.stderr,
    "usage: decks <deck.md> (-o <out.html> | --design <dir>)\n" +
      "       decks plan check <plan.json>\n" +
      "       decks plan scaffold <plan.json> -o <deck.md>\n" +
      "       decks theme check <name|path.css>\n" +
      "       decks studio <deck-dir> [--port N]\n" +
      "       decks studio stop <deck-dir>\n" +
      "       decks studio requests <deck-dir>\n" +
      "       decks studio reply <deck-dir> <id> <text>\n" +
      "       decks studio resolve <deck-dir> <id...> [--reply <text>]\n",
  );
});
