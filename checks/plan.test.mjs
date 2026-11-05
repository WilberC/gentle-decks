// plan.json: validation and deck scaffolding. Run: node --test checks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "decks-plan-"));

const PLAN = {
  version: 1,
  title: "Por qué empezar con Python",
  topic: "Python para principiantes",
  audience: "Estudiantes sin experiencia",
  goal: "Confianza para dar sus primeros pasos",
  lang: "es",
  theme: "gentleman-cute",
  slides: [
    { id: "cover", title: "Por qué empezar con Python", points: ["Una primera lengua para pensar con código"] },
    { id: "first-win", title: "La primera victoria llega rápido", points: ["Sintaxis clara", "Algo visible desde el primer día"], notes: "Keep it short", layout: "grid-2" },
    { id: "community", title: "La comunidad ayuda", points: [] },
  ],
};

function writePlan(dir, plan) {
  const file = path.join(dir, "plan.json");
  fs.writeFileSync(file, typeof plan === "string" ? plan : JSON.stringify(plan, null, 2));
  return file;
}

test("plan check accepts a valid plan", () => {
  const r = run("plan", "check", writePlan(tmp(), PLAN));
  assert.deepEqual(r, { code: 0, stdout: "ok: 3 slides\n", stderr: "" });
});

test("plan check accepts the minimal plan", () => {
  const r = run("plan", "check", writePlan(tmp(), { title: "T", slides: [{ id: "a", title: "A" }] }));
  assert.deepEqual(r, { code: 0, stdout: "ok: 1 slides\n", stderr: "" });
});

test("plan check reports every problem with its path", () => {
  const bad = {
    version: 2,
    title: "",
    lang: 3,
    slides: [
      { id: "Bad_Id", title: "A" },
      { id: "dup", title: "" },
      { id: "dup", title: "Two\nlines", points: ["ok", 4] },
      { id: "x", title: "X", points: ["---"], layout: 1 },
      "nope",
    ],
  };
  const r = run("plan", "check", writePlan(tmp(), bad));
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.equal(
    r.stderr,
    [
      "plan.json: $.version: must be 1",
      "plan.json: $.title: must be a non-empty single-line string",
      "plan.json: $.lang: must be a string",
      'plan.json: $.slides[0].id: must match ^[a-z][a-z0-9-]*$, got "Bad_Id"',
      "plan.json: $.slides[1].title: must be a non-empty single-line string",
      'plan.json: $.slides[2].id: duplicate id "dup"',
      "plan.json: $.slides[2].title: must be a non-empty single-line string",
      "plan.json: $.slides[2].points[1]: must be a single-line string",
      "plan.json: $.slides[3].points[0]: must not start with --- or :::",
      "plan.json: $.slides[3].layout: must be a string",
      "plan.json: $.slides[4]: must be an object",
      "",
    ].join("\n"),
  );
});

test("plan check rejects missing slides and invalid JSON", () => {
  assert.deepEqual(run("plan", "check", writePlan(tmp(), { title: "T" })), {
    code: 1, stdout: "", stderr: "plan.json: $.slides: must be a non-empty array\n",
  });
  assert.deepEqual(run("plan", "check", writePlan(tmp(), "{oops")), {
    code: 1, stdout: "", stderr: "plan.json: $: invalid JSON\n",
  });
});

test("plan scaffold writes a buildable deck from the plan", () => {
  const dir = tmp();
  const deck = path.join(dir, "out", "deck.md");
  const r = run("plan", "scaffold", writePlan(dir, PLAN), "-o", deck);
  assert.deepEqual(r, { code: 0, stdout: `3 slides -> ${deck}\n`, stderr: "" });
  assert.equal(
    fs.readFileSync(deck, "utf8"),
    `---
title: Por qué empezar con Python
brief: Confianza para dar sus primeros pasos
theme: gentleman-cute
lang: es
---

id: cover
class: cover

# Por qué empezar con Python

- Una primera lengua para pensar con código

---

id: first-win
layout: grid-2

## La primera victoria llega rápido

- Sintaxis clara
- Algo visible desde el primer día

---

id: community

## La comunidad ayuda
`,
  );
  const design = path.join(dir, "design");
  assert.equal(run(deck, "--design", design).code, 0);
  assert.deepEqual(fs.readdirSync(path.join(design, "slides")).sort(), ["community.html", "cover.html", "first-win.html"]);
});

test("plan scaffold refuses to overwrite and rejects invalid plans", () => {
  const dir = tmp();
  const deck = path.join(dir, "deck.md");
  fs.writeFileSync(deck, "mine");
  assert.deepEqual(run("plan", "scaffold", writePlan(dir, PLAN), "-o", deck), {
    code: 1, stdout: "", stderr: `refusing to overwrite ${deck}\n`,
  });
  assert.equal(fs.readFileSync(deck, "utf8"), "mine");
  const other = path.join(dir, "other.md");
  assert.deepEqual(run("plan", "scaffold", writePlan(dir, { title: "T" }), "-o", other), {
    code: 1, stdout: "", stderr: "plan.json: $.slides: must be a non-empty array\n",
  });
  assert.equal(fs.existsSync(other), false);
});

test("plan commands without arguments print usage and exit 2", () => {
  for (const args of [["plan"], ["plan", "check"], ["plan", "scaffold", "p.json"], ["plan", "nope", "p.json"]]) {
    const r = run(...args);
    assert.equal(r.code, 2, args.join(" "));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^usage: decks <deck\.md> \(-o <out\.html> \| --design <dir>\) \[--theme <name|\.css>\]\n/);
  }
});
