// Theme contract. Run: node --test checks/
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const SAMPLE = path.resolve("decks/sample/gentle-decks.md");
// User themes come from GENTLE_DECKS_THEMES, else $XDG_CONFIG_HOME, else ~/.config.
// Every run gets an explicit, empty location unless a test passes its own env.
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-theme-"));
  scratch.push(dir);
  return dir;
};
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});
const ENV = { ...process.env, GENTLE_DECKS_THEMES: tmp() };
const runEnv = (env, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const run = (...args) => runEnv(ENV, ...args);

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

const USER_THEME = (marker) => `/* user theme */\n:root { --user-marker: ${marker}; }\n`;
const DECK = (theme) => `---\ntitle: User\ntheme: ${theme}\n---\n\n# Hi\n`;

test("a deck builds with a theme from GENTLE_DECKS_THEMES", () => {
  const userDir = tmp();
  fs.writeFileSync(path.join(userDir, "mine.css"), USER_THEME("from-env"));
  const dir = tmp();
  const deck = path.join(dir, "deck.md");
  fs.writeFileSync(deck, DECK("mine"));
  const out = path.join(dir, "out.html");
  const env = { ...process.env, GENTLE_DECKS_THEMES: userDir };
  assert.deepEqual(runEnv(env, deck, "-o", out), { code: 0, stdout: `1 slides -> ${out}\n`, stderr: "" });
  assert.match(fs.readFileSync(out, "utf8"), /--user-marker: from-env/);
});

test("user themes default to $XDG_CONFIG_HOME/gentle-decks/themes, then ~/.config", () => {
  const config = tmp();
  fs.mkdirSync(path.join(config, "gentle-decks", "themes"), { recursive: true });
  fs.writeFileSync(path.join(config, "gentle-decks", "themes", "mine.css"), USER_THEME("from-xdg"));
  const home = tmp();
  fs.mkdirSync(path.join(home, ".config", "gentle-decks", "themes"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config", "gentle-decks", "themes", "mine.css"), USER_THEME("from-home"));
  const dir = tmp();
  const deck = path.join(dir, "deck.md");
  fs.writeFileSync(deck, DECK("mine"));
  const base = { ...process.env, HOME: home, USERPROFILE: home };
  delete base.GENTLE_DECKS_THEMES;

  const xdgOut = path.join(dir, "xdg.html");
  assert.equal(runEnv({ ...base, XDG_CONFIG_HOME: config }, deck, "-o", xdgOut).code, 0);
  assert.match(fs.readFileSync(xdgOut, "utf8"), /--user-marker: from-xdg/);

  const homeEnv = { ...base };
  delete homeEnv.XDG_CONFIG_HOME;
  const homeOut = path.join(dir, "home.html");
  assert.equal(runEnv(homeEnv, deck, "-o", homeOut).code, 0);
  assert.match(fs.readFileSync(homeOut, "utf8"), /--user-marker: from-home/);
});

test("deck themes shadow user themes, and user themes shadow bundled ones", () => {
  const userDir = tmp();
  fs.writeFileSync(path.join(userDir, "gentleman-cute.css"), USER_THEME("user-shadows-repo"));
  fs.writeFileSync(path.join(userDir, "both.css"), USER_THEME("user-loses"));
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "themes"));
  fs.writeFileSync(path.join(dir, "themes", "both.css"), "/* deck wins */\n:root { --deck-marker: deck; }\n");
  const deck = path.join(dir, "deck.md");
  const env = { ...process.env, GENTLE_DECKS_THEMES: userDir };

  fs.writeFileSync(deck, DECK("gentleman-cute"));
  const repoOut = path.join(dir, "repo.html");
  assert.equal(runEnv(env, deck, "-o", repoOut).code, 0);
  assert.match(fs.readFileSync(repoOut, "utf8"), /--user-marker: user-shadows-repo/);

  fs.writeFileSync(deck, DECK("both"));
  const deckOut = path.join(dir, "deck.html");
  assert.equal(runEnv(env, deck, "-o", deckOut).code, 0);
  const html = fs.readFileSync(deckOut, "utf8");
  assert.match(html, /--deck-marker: deck/);
  assert.doesNotMatch(html, /user-loses/);
});

test("theme check finds a user theme by name", () => {
  const userDir = tmp();
  const env = { ...process.env, GENTLE_DECKS_THEMES: userDir };
  fs.copyFileSync(path.resolve("themes", "gentleman-cute.css"), path.join(userDir, "mine.css"));
  assert.deepEqual(runEnv(env, "theme", "check", "mine"), { code: 0, stdout: "ok: mine\n", stderr: "" });

  fs.writeFileSync(path.join(userDir, "partial.css"), ".deck { }\n");
  const r = runEnv(env, "theme", "check", "partial");
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /^missing selectors in partial: \.slide, /);
});
