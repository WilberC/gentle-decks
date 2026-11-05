// Renders what the studio serves: one static slide artboard (S8) and the full navigable deck (S12).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, splitSlides, parseSlide, assignIds } from "../parse.js";
import { renderDesign, SLIDES_DIR } from "../design.js";
import { renderDeck } from "../render.js";
import { embedImages } from "../embed.js";
import { scaffoldDeck } from "../plan.js";
import { findTheme } from "../theme.js";
import { readPlanDocument, readDeck } from "./state.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NAV_JS = fs.readFileSync(path.join(ROOT, "src", "deck-nav.js"), "utf8");
const DEFAULT_THEME = "gentleman-cute";

function themeCss(name, dir) {
  const theme = findTheme(name, dir);
  if (!theme) throw new Error(`theme not found: ${name}`);
  return theme.css;
}

// The deck to render for `id`: the deck itself, or the plan scaffold when the deck lacks that slide.
function sourceFor(paths, plan, id) {
  const deck = readDeck(paths);
  if (deck && !deck.error && deck.slides.some((slide) => slide.id === id)) {
    return { meta: deck.meta, slides: deck.slides };
  }
  if (plan?.slides.some((slide) => slide.id === id)) {
    const scaffold = parseFrontmatter(scaffoldDeck(plan));
    return { meta: scaffold.meta, slides: assignIds(splitSlides(scaffold.body).map(parseSlide)) };
  }
  if (deck?.error) throw new Error(deck.error);
  return null;
}

// S18: the established plan.json order rules the export; deck slides missing from the plan
// keep their deck order after the planned ones (stable sort).
function orderSlides(slides, plan) {
  const ids = (plan?.slides ?? []).map((s) => s.id);
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...slides].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : ids.length;
    const rb = rank.has(b.id) ? rank.get(b.id) : ids.length;
    return ra - rb;
  });
}

// The artboard of one slide, rendered exactly like `--design` renders it. Null when the id is unknown.
export async function artboardHtml(paths, plan, id, themeName) {
  const source = sourceFor(paths, plan, id);
  if (!source) return null;
  const css = themeCss(themeName || source.meta.theme || DEFAULT_THEME, paths.dir);
  const html = renderDesign(source, css).get(`${SLIDES_DIR}/${id}.html`) ?? null;
  // Images become data URIs: the artboard sandbox CSP only allows inline images (S9).
  return html === null ? null : embedImages(html, paths.dir);
}

// The full navigable deck (same as `-o`), in the established plan order. Null when the deck
// does not exist yet.
export async function presentHtml(paths) {
  const deck = readDeck(paths);
  if (!deck) return null;
  if (deck.error) throw new Error(deck.error);
  const plan = readPlanDocument(paths);
  const slides = plan.problems ? deck.slides : orderSlides(deck.slides, plan.plan);
  const css = themeCss(deck.meta.theme || DEFAULT_THEME, paths.dir);
  // Images are embedded, so the presentation and every export are self-contained (S9).
  return embedImages(renderDeck({ meta: deck.meta, slides }, css, NAV_JS), paths.dir);
}
