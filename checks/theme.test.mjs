// Theme contract. Run: node --test checks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
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

test("theme without a name prints usage and exits 2", () => {
  const r = run("theme", "check");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /decks theme check <name\|path\.css>/);
});
