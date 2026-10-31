#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitSlides, parseSlide } from "../src/parse.js";
import { renderDeck } from "../src/render.js";
import { renderDesign, SLIDE_FILE } from "../src/design.js";

const USAGE = "usage: decks <deck.md> (-o <out.html> | --design <dir>)";

const args = process.argv.slice(2);
const flagValue = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
const outFile = flagValue("-o");
const designDir = flagValue("--design");
const input = args.find((a, k) => !a.startsWith("-") && !["-o", "--design"].includes(args[k - 1]));

if (!input || (outFile === undefined) === (designDir === undefined) || !(outFile || designDir)) {
  console.error(USAGE);
  process.exit(2);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const md = fs.readFileSync(input, "utf8");
const { meta, body } = parseFrontmatter(md);
const slides = splitSlides(body).map(parseSlide);

const theme = meta.theme || "gentleman-cute";
const themeCss = fs.readFileSync(path.join(root, "themes", `${theme}.css`), "utf8");

try {
  if (designDir) {
    const files = renderDesign({ meta, slides }, themeCss);
    const dir = path.resolve(designDir);
    fs.mkdirSync(dir, { recursive: true });
    // Drop slide artboards left over from a longer deck; keep canvas files (comments.json, screenshots).
    for (const name of fs.readdirSync(dir)) {
      if (SLIDE_FILE.test(name) && !files.has(name)) fs.rmSync(path.join(dir, name));
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
