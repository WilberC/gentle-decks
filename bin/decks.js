#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitSlides, parseSlide } from "../src/parse.js";
import { renderDeck } from "../src/render.js";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("-"));
const outFlag = args.indexOf("-o");

if (!input || outFlag === -1 || !args[outFlag + 1]) {
  console.error("usage: decks <deck.md> -o <out.html>");
  process.exit(2);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const md = fs.readFileSync(input, "utf8");
const { meta, body } = parseFrontmatter(md);
const slides = splitSlides(body).map(parseSlide);

const theme = meta.theme || "gentleman-cute";
const themeCss = fs.readFileSync(path.join(root, "themes", `${theme}.css`), "utf8");
const navJs = fs.readFileSync(path.join(root, "src", "deck-nav.js"), "utf8");

try {
  const html = renderDeck({ meta, slides }, themeCss, navJs);
  fs.mkdirSync(path.dirname(path.resolve(args[outFlag + 1])), { recursive: true });
  fs.writeFileSync(args[outFlag + 1], html);
  console.log(`${slides.length} slides -> ${path.resolve(args[outFlag + 1])}`);
} catch (err) {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
}
