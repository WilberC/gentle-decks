// Motion (S1-S3): per-slide/per-block entrance animations, deck transitions, and the
// animation CSS travelling inside the single-file export.
// Run: node --test checks/*.test.mjs
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE_CSS } from "../src/render.js";
import { presentHtml } from "../src/studio/build.js";
import { studioPaths } from "../src/studio/state.js";

const CLI = path.resolve("bin/decks.js");
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-motion-"));
  scratch.push(dir);
  return dir;
};
// User themes come from GENTLE_DECKS_THEMES, else $XDG_CONFIG_HOME, else ~/.config. Every run
// gets an explicit, empty location so the developer's own themes never leak into the checks.
// presentHtml resolves themes in-process, so the process env is pointed there too.
const NO_USER_THEMES = tmp();
const PREV_THEMES = process.env.GENTLE_DECKS_THEMES;
process.env.GENTLE_DECKS_THEMES = NO_USER_THEMES;
after(() => {
  if (PREV_THEMES === undefined) delete process.env.GENTLE_DECKS_THEMES;
  else process.env.GENTLE_DECKS_THEMES = PREV_THEMES;
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});
const ENV = { ...process.env, GENTLE_DECKS_THEMES: NO_USER_THEMES };
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: ENV });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

// Writes the deck outside the worktree, builds it with `-o`, and returns every observation.
function build(markdown) {
  const dir = tmp();
  const file = path.join(dir, "deck.md");
  fs.writeFileSync(file, markdown);
  const out = path.join(dir, "deck.html");
  const r = run(file, "-o", out);
  return { dir, file, out, code: r.code, stdout: r.stdout, stderr: r.stderr, html: r.code === 0 ? fs.readFileSync(out, "utf8") : "" };
}

const sections = (html) => html.match(/<section[^>]*>/g) ?? [];

const MOTION_DECK = `---
title: Motion
theme: gentleman-cute
---

animate: fade-up
kicker: Uno

# Primera

::: card accent animate=rise
Cuerpo
:::

---

## Segunda
`;

test("slide animate directive and container animate attr reach the HTML (S1)", () => {
  const { html } = build(MOTION_DECK);
  // The slide marker names its profile; the container marker choreographs that block alone.
  assert.match(html, /<section class="slide active" data-animate="fade-up">/);
  assert.match(html, /<div class="card accent" data-animate="rise">/);
  // Direct children are staggered through --i, scoped to .active so it replays on every visit.
  assert.match(html, /\.slide\[data-animate="fade-up"\]\.active > \*:not\(\[data-animate\]\)/);
  assert.match(html, /--i: 0;/);
  assert.match(html, /:nth-child\(2\) \{ --i: 1; \}/);
  // A block with its own marker is excluded from the slide stagger: no double animation.
  assert.match(html, /\.slide\[data-animate\]\.active > \*:not\(\[data-animate\]\)/);
  // A slide without the directive stays static.
  assert.match(html, /<section class="slide">\n<h2>Segunda<\/h2>/);
});

test("animate: none opts the slide out and leaves it static (S1)", () => {
  const { html } = build(MOTION_DECK.replace("animate: fade-up", "animate: none"));
  const tags = sections(html);
  assert.equal(tags.length, 2);
  for (const tag of tags) assert.doesNotMatch(tag, /data-animate/);
});

test("an unknown animate profile fails the build with the slide number (S1)", () => {
  const { code, stderr, dir } = build(MOTION_DECK.replace("animate: fade-up", "animate: spiral"));
  assert.equal(code, 1);
  assert.match(stderr, /build failed: Unknown animate profile "spiral" on slide 1/);
  assert.deepEqual(fs.readdirSync(dir), ["deck.md"]);
});

test("front-matter transition selects the deck class and defaults to fade (S1)", () => {
  const deck = (transition) =>
    `---\ntitle: T\ntheme: gentleman-cute${transition ? `\ntransition: ${transition}` : ""}\n---\n\n# Uno\n`;
  assert.match(build(deck()).html, /<div class="deck transition-fade">/);
  assert.match(build(deck("fade")).html, /<div class="deck transition-fade">/);
  assert.match(build(deck("slide")).html, /<div class="deck transition-slide">/);
  assert.match(build(deck("none")).html, /<div class="deck transition-none">/);
  // Each pattern is rendered by the base styles, outside the bundled themes.
  const css = BASE_CSS;
  assert.match(css, /\.deck\.transition-fade \.slide \{/);
  assert.match(css, /\.deck\.transition-slide \.slide \{/);
  assert.match(css, /\.deck\.transition-none \.slide \{/);
});

test("an unknown transition fails the build", () => {
  const { code, stderr } = build(`---\ntitle: T\ntransition: zoom\n---\n\n# Uno\n`);
  assert.equal(code, 1);
  assert.match(stderr, /build failed: Unknown transition "zoom"/);
});

test("reduced motion and print keep the final state in the built deck (S1, S3)", () => {
  const { html } = build(MOTION_DECK);
  assert.ok(html.includes(BASE_CSS), "the base motion CSS travels in the deck file");
  const reduced = BASE_CSS.slice(BASE_CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.slide\[data-animate\]\.active > \*:not\(\[data-animate\]\)/);
  assert.match(reduced, /animation: none/);
  assert.match(reduced, /transition: none/);
  const print = BASE_CSS.slice(BASE_CSS.indexOf("@media print"));
  assert.match(print, /animation: none/);
  assert.match(print, /opacity: 1/);
  assert.match(print, /transform: none/);
});

test("the self-contained studio build keeps the animation CSS in one file (S3/T4)", async () => {
  const dir = tmp();
  const deckDir = path.join(dir, "motion");
  fs.mkdirSync(deckDir);
  fs.writeFileSync(path.join(deckDir, "motion.md"), MOTION_DECK);
  const html = await presentHtml(studioPaths(deckDir));
  assert.match(html, /<section class="slide active" data-animate="fade-up">/);
  assert.match(html, /@keyframes deck-enter-rise/);
  assert.match(html, /\.slide\[data-animate="rise"\]\.active/);
  assert.ok(html.includes(BASE_CSS), "one file: the animation CSS is inlined");
  assert.equal((html.match(/<style>/g) || []).length, 1);
  assert.match(html, /function show\(n\)/, "navigation JS stays inlined");
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
});

test("a deck with no motion declarations renders static slides (backward compat)", () => {
  const { html } = build(
    `---\ntitle: Plain\ntheme: gentleman-cute\n---\n\nkicker: Uno\n\n# Uno\n\n::: card accent icon=⚡\nCuerpo\n:::\n\n---\n\n## Dos\n`,
  );
  for (const tag of sections(html)) assert.doesNotMatch(tag, /data-animate/);
  // Containers keep the class/attribute shape they had before the motion vocabulary.
  assert.match(html, /<div class="card accent">\n<span class="icon">⚡<\/span>/);
  assert.doesNotMatch(html, /<div class="card accent" data-animate/);
  // Motion CSS is an unavoidable base addition, but no slide opts into it.
  assert.match(BASE_CSS, /@keyframes deck-enter-fade-up/);
  assert.match(html, /<div class="deck transition-fade">/);
});
