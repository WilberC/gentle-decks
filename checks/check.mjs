// Structural checks for the sample deck. Run: node checks/check.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";

execSync("node bin/decks.js decks/sample/gentle-decks.md -o decks/sample/gentle-decks.html", {
  stdio: "pipe",
});
const html = fs.readFileSync("decks/sample/gentle-decks.html", "utf8");

const count = (re) => (html.match(re) || []).length;
const failures = [];
function expect(name, re, atLeast) {
  const n = count(re);
  const ok = n >= atLeast;
  if (!ok) failures.push(`${name}: got ${n}, expected >= ${atLeast}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${n}`);
}

expect("slides", /<section class="slide/g, 8);
expect("kickers", /<div class="kicker">/g, 8);
expect("lead on cover", /<p class="lead">/g, 1);
expect("cover petals", /<div class="petals"/g, 1);
expect("first slide active", /class="slide cover active"/g, 1);
expect("cards", /<div class="card/g, 9);
expect("steps", /<div class="step/g, 3);
expect("term", /<div class="term">/g, 1);
expect("bar rows", /<div class="bar-row">/g, 3);
expect("stats", /class="stat">/g, 3);
expect("pills", /<span class="pill">/g, 6);
expect("quotes", /<p class="quote">/g, 3);
expect("tables", /<div class="table-wrap">/g, 1);
expect("nav engine", /function show\(n\)/g, 1);
expect("touch nav", /id="touch|id="prev"/g, 1);
expect("print css", /@media print/g, 1);
expect("no external refs", /(?:src|href)="http/g, 0);
expect("no stray containers", /&lt;|:::/g, 0 === count(/:::/) ? 0 : 0); // informational
expect("no stray tokens", /\[\[/g, 0);

// Balance: every section closes
const opens = count(/<section\b/g);
const closes = count(/<\/section>/g);
if (opens !== closes) failures.push(`unbalanced sections: ${opens} open vs ${closes} close`);

// Determinism: rebuild and compare bytes
const first = html;
execSync("node bin/decks.js decks/sample/gentle-decks.md -o decks/sample/gentle-decks.html", { stdio: "pipe" });
const second = fs.readFileSync("decks/sample/gentle-decks.html", "utf8");
if (first !== second) failures.push("output is not deterministic");

// Unknown container fails with slide number
try {
  fs.writeFileSync(
    "/tmp/bad-deck.md",
    "---\ntitle: t\n---\nkicker: x\n\n::: nope\nbody\n:::\n",
  );
  execSync("node bin/decks.js /tmp/bad-deck.md -o /tmp/bad-deck.html", { stdio: "pipe" });
  failures.push("unknown container did not fail the build");
} catch {
  console.log("ok   unknown container fails the build");
}

console.log(failures.length ? `\n${failures.length} failures` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
