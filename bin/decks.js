#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitSlides, parseSlide, assignIds } from "../src/parse.js";
import { renderDeck } from "../src/render.js";
import { renderDesign, SLIDES_DIR } from "../src/design.js";
import { readPlan, scaffoldDeck } from "../src/plan.js";

const USAGE = [
  "usage: decks <deck.md> (-o <out.html> | --design <dir>)",
  "       decks plan check <plan.json>",
  "       decks plan scaffold <plan.json> -o <deck.md>",
].join("\n");

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);

function usage() {
  console.error(USAGE);
  process.exit(2);
}

function flagValue(flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function loadPlan(file) {
  const { plan, problems } = readPlan(fs.readFileSync(file, "utf8"));
  if (problems) {
    for (const p of problems) console.error(`plan.json: ${p}`);
    process.exit(1);
  }
  return plan;
}

function planCommand() {
  const [, sub, file] = args;
  if (!file || file.startsWith("-")) usage();
  if (sub === "check") {
    const plan = loadPlan(file);
    console.log(`ok: ${plan.slides.length} slides`);
    return;
  }
  if (sub !== "scaffold") usage();
  const out = flagValue("-o");
  if (!out) usage();
  const plan = loadPlan(file);
  const target = path.resolve(out);
  if (fs.existsSync(target)) {
    console.error(`refusing to overwrite ${out}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, scaffoldDeck(plan));
  console.log(`${plan.slides.length} slides -> ${target}`);
}

function buildCommand() {
  const outFile = flagValue("-o");
  const designDir = flagValue("--design");
  const input = args.find((a, k) => !a.startsWith("-") && !["-o", "--design"].includes(args[k - 1]));
  if (!input || (outFile === undefined) === (designDir === undefined) || !(outFile || designDir)) usage();

  const md = fs.readFileSync(input, "utf8");
  const { meta, body } = parseFrontmatter(md);
  const parsed = splitSlides(body).map(parseSlide);
  const theme = meta.theme || "gentleman-cute";
  const themeCss = fs.readFileSync(path.join(root, "themes", `${theme}.css`), "utf8");

  try {
    const slides = assignIds(parsed);
    if (designDir) {
      const files = renderDesign({ meta, slides }, themeCss);
      const dir = path.resolve(designDir);
      const slidesDir = path.join(dir, SLIDES_DIR);
      fs.mkdirSync(slidesDir, { recursive: true });
      // Drop artboards of slides that no longer exist; keep canvas files (comments.json, screenshots).
      for (const name of fs.readdirSync(slidesDir)) {
        if (name.endsWith(".html") && !files.has(`${SLIDES_DIR}/${name}`)) fs.rmSync(path.join(slidesDir, name));
      }
      for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);
      console.log(`${slides.length} slides -> ${dir}`);
    } else {
      const navJs = fs.readFileSync(path.join(root, "src", "deck-nav.js"), "utf8");
      const html = renderDeck({ meta, slides }, themeCss, navJs);
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(outFile, html);
      console.log(`${slides.length} slides -> ${path.resolve(outFile)}`);
    }
  } catch (err) {
    console.error(`build failed: ${err.message}`);
    process.exit(1);
  }
}

if (args[0] === "plan") planCommand();
else buildCommand();
