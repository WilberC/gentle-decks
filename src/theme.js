// Theme lookup and the theme contract: selectors every theme must style.
// See themes/CONTRACT.md and FORMAT.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const THEME_SELECTORS = [
  // deck frame
  ".deck", ".slide", ".slide.active", ".cover", ".kicker", ".lead", ".quote", ".table-wrap",
  ".brand", ".counter", ".progress", ".hint", ".touch-nav", ".petals",
  // layout containers
  ".grid-2", ".grid-3", ".grid-4", ".split", ".steps",
  // components
  ".card", ".card.accent", ".icon", ".step", ".step.hl", ".step.bad",
  ".term", ".bars", ".bar-row", ".bar-track", ".bar-fill.good", ".bar-fill.mid", ".bar-fill.bad",
  ".stat", ".pill",
  // inline color tokens
  ".pink", ".gold", ".mint", ".blue", ".rose", ".peach", ".red", ".muted", ".dim", ".grad",
];

export const THEME_NAME = /^[a-z0-9][a-z0-9-]*$/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Selectors from THEME_SELECTORS that never appear as a whole selector token in the CSS.
export function missingSelectors(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return THEME_SELECTORS.filter((sel) => !new RegExp(`${escapeRe(sel)}(?![\\w-])`).test(code));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_THEMES_DIR = path.join(ROOT, "themes");

// Theme names in a themes directory, sorted so listings are deterministic.
function themeNames(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".css"))
    .map((name) => name.slice(0, -4))
    .filter((name) => THEME_NAME.test(name))
    .sort();
}

// The deck may ship proposed themes in `<deck dir>/themes/`; they shadow repo themes.
export const deckThemesDir = (deckDir) => (deckDir ? path.join(deckDir, "themes") : null);

export function listThemes(deckDir) {
  const local = themeNames(deckThemesDir(deckDir) ?? "");
  const shadowed = new Set(local);
  return [
    ...local.map((name) => ({ name, source: "deck" })),
    ...themeNames(REPO_THEMES_DIR).filter((name) => !shadowed.has(name)).map((name) => ({ name, source: "repo" })),
  ];
}

// Resolves a theme for a deck: deck-local first, then the repo. Returns null when missing.
export function findTheme(name, deckDir) {
  if (!THEME_NAME.test(name)) return null;
  for (const dir of [deckThemesDir(deckDir), REPO_THEMES_DIR]) {
    if (!dir) continue;
    const file = path.join(dir, `${name}.css`);
    if (!fs.existsSync(file)) continue;
    return { name, file, source: dir === REPO_THEMES_DIR ? "repo" : "deck", css: fs.readFileSync(file, "utf8") };
  }
  return null;
}
