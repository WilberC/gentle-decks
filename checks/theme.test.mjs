// Theme contract. Run: node --test checks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const SAMPLE = path.resolve("decks/sample/gentle-decks.md");
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

test("the bundled theme satisfies the contract", () => {
  assert.deepEqual(run("theme", "check", "gentleman-cute"), { code: 0, stdout: "ok: gentleman-cute\n", stderr: "" });
});

test("a theme missing selectors is rejected with the list", () => {
  const file = path.resolve("themes", "zz-test-partial.css");
  fs.writeFileSync(file, ".deck { } .slide { } .slide.active { } .card { }\n/* .kicker in a comment does not count */\n");
  try {
    const r = run("theme", "check", "zz-test-partial");
    assert.equal(r.code, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^missing selectors in zz-test-partial: \.cover, \.kicker, \.lead, /);
    assert.doesNotMatch(r.stderr, /\.deck,|\.slide,|\.card,/);
  } finally {
    fs.rmSync(file);
  }
});

test("an unknown theme fails with its expected path", () => {
  assert.deepEqual(run("theme", "check", "nope"), {
    code: 1, stdout: "", stderr: "theme not found: themes/nope.css\n",
  });
});

test("theme names cannot escape the themes directory", () => {
  assert.deepEqual(run("theme", "check", "../package"), {
    code: 1, stdout: "", stderr: 'invalid theme name "../package"\n',
  });
});

test("the contract document lists every checked selector", async () => {
  const { THEME_SELECTORS } = await import("../src/theme.js");
  const doc = fs.readFileSync("themes/CONTRACT.md", "utf8");
  for (const sel of THEME_SELECTORS) assert.ok(doc.includes(`\`${sel}\``), `${sel} missing from CONTRACT.md`);
});

test("the fair test deck themes satisfy the contract and build the sample deck", () => {
  for (const [name, ground] of [
    ["fair-test", "--ground: #ffffff"],
    ["fair-test-gentle", "--ground: #140a12"],
  ]) {
    assert.deepEqual(run("theme", "check", name), { code: 0, stdout: `ok: ${name}\n`, stderr: "" });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-theme-"));
    try {
      // The sample deck, copied out of the worktree with its theme swapped.
      const deck = path.join(dir, "gentle-decks.md");
      const source = fs.readFileSync(SAMPLE, "utf8").replace(/^theme: .*$/m, `theme: ${name}`);
      assert.match(source, new RegExp(`^theme: ${name}$`, "m"));
      fs.writeFileSync(deck, source);

      const out = path.join(dir, "out.html");
      const r = run(deck, "-o", out);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(r.stderr, "");
      assert.equal(r.stdout, `8 slides -> ${out}\n`);

      const html = fs.readFileSync(out, "utf8");
      assert.ok(html.includes(ground), `${name} was not inlined into the deck`);
      assert.doesNotMatch(html, /(?:src|href)\s*=\s*"[^"]*http/i);
      assert.doesNotMatch(html, /url\(\s*["']?(?:https?:)?\/\//i);
      assert.doesNotMatch(html, /@import/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("theme without a name prints usage and exits 2", () => {
  const r = run("theme", "check");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /decks theme check <name\|path\.css>/);
});
