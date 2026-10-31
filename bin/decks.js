#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitSlides, parseSlide, assignIds } from "../src/parse.js";
import { renderDeck } from "../src/render.js";
import { renderDesign, SLIDES_DIR } from "../src/design.js";
import { readPlan, scaffoldDeck } from "../src/plan.js";
import { missingSelectors, findTheme, THEME_NAME } from "../src/theme.js";
import { openRequests, resolveRequests, studioPaths } from "../src/studio/state.js";
import { startStudio } from "../src/studio/server.js";

const USAGE = [
  "usage: decks <deck.md> (-o <out.html> | --design <dir>)",
  "       decks plan check <plan.json>",
  "       decks plan scaffold <plan.json> -o <deck.md>",
  "       decks theme check <name|path.css>",
  "       decks studio <deck-dir> [--port N]",
  "       decks studio requests <deck-dir>",
  "       decks studio resolve <deck-dir> <id...>",
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

// A deck resolves its theme next to itself first (`<deck dir>/themes/<name>.css`), then in the repo.
function deckTheme(themeName, deckDir) {
  const theme = findTheme(themeName, deckDir);
  if (!theme) throw new Error(`theme not found: ${themeName}`);
  return theme.css;
}

function buildCommand() {
  const outFile = flagValue("-o");
  const designDir = flagValue("--design");
  const input = args.find((a, k) => !a.startsWith("-") && !["-o", "--design"].includes(args[k - 1]));
  if (!input || (outFile === undefined) === (designDir === undefined) || !(outFile || designDir)) usage();

  const md = fs.readFileSync(input, "utf8");
  const { meta, body } = parseFrontmatter(md);
  const parsed = splitSlides(body).map(parseSlide);

  try {
    const slides = assignIds(parsed);
    const themeCss = deckTheme(meta.theme || "gentleman-cute", path.dirname(path.resolve(input)));
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

function themeCommand() {
  const [, sub, name] = args;
  if (sub !== "check" || !name) usage();
  // `theme check` accepts a theme name or a CSS file path.
  const asPath = /\.css$/i.test(name);
  if (!asPath && !THEME_NAME.test(name)) {
    console.error(`invalid theme name ${JSON.stringify(name)}`);
    process.exit(1);
  }
  const file = asPath ? path.resolve(name) : path.join(root, "themes", `${name}.css`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.error(`theme not found: ${asPath ? name : `themes/${name}.css`}`);
    process.exit(1);
  }
  const missing = missingSelectors(fs.readFileSync(file, "utf8"));
  if (missing.length) {
    console.error(`missing selectors in ${name}: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`ok: ${name}`);
}

function main() {
  if (args[0] === "plan") return planCommand();
  if (args[0] === "theme") return themeCommand();
  if (args[0] !== "studio") return buildCommand();

  const sub = args[1];
  if (sub !== "requests" && sub !== "resolve") return studioServerCommand(sub);
  const dir = args[2];
  if (!dir || dir.startsWith("-")) usage();
  try {
    if (sub === "requests") {
      console.log(JSON.stringify(openRequests(studioPaths(dir)), null, 2));
      return;
    }
    const ids = args.slice(3);
    if (!ids.length) usage();
    const { unknown } = resolveRequests(studioPaths(dir), ids);
    if (unknown) {
      console.error(`unknown request ${unknown}`);
      process.exit(1);
    }
    for (const id of ids) console.log(`resolved ${id}`);
  } catch (err) {
    console.error(`studio: ${err.message}`);
    process.exit(1);
  }
}

function studioServerCommand(dir) {
  if (!dir || dir.startsWith("-")) usage();
  const planFile = path.join(dir, "plan.json");
  if (!fs.existsSync(planFile)) {
    console.error(`studio: ${planFile} not found`);
    process.exit(1);
  }
  const portFlag = flagValue("--port");
  let port = 0;
  if (portFlag !== undefined) {
    port = Number(portFlag);
    if (!Number.isInteger(port) || port < 0 || port > 65535) usage();
  }
  startStudio({ dir, port }).then(
    (studio) => console.log(`studio: ${studio.url}`),
    (err) => {
      console.error(`studio: ${err.message}`);
      process.exit(1);
    },
  );
}

main();
