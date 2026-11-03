// Theme lookup and the theme contract: selectors every theme must style.
// See themes/CONTRACT.md and FORMAT.md.
import fs from "node:fs";
import os from "node:os";
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
  ".stat", ".pill", ".figure",
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

// The deck may ship proposed themes in `<deck dir>/themes/`; they shadow user and repo themes.
export const deckThemesDir = (deckDir) => (deckDir ? path.join(deckDir, "themes") : null);

// Themes the user keeps for every deck: $GENTLE_DECKS_THEMES, else
// $XDG_CONFIG_HOME/gentle-decks/themes, else ~/.config/gentle-decks/themes.
export function userThemesDir(env = process.env) {
  if (env.GENTLE_DECKS_THEMES) return path.resolve(env.GENTLE_DECKS_THEMES);
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(config, "gentle-decks", "themes");
}

// Theme directories in lookup order; earlier sources shadow later ones by name.
export function themeSources(deckDir) {
  const sources = [];
  const deck = deckThemesDir(deckDir);
  if (deck) sources.push({ dir: deck, source: "deck" });
  sources.push({ dir: userThemesDir(), source: "user" }, { dir: REPO_THEMES_DIR, source: "repo" });
  return sources;
}

export function listThemes(deckDir) {
  const seen = new Set();
  const themes = [];
  for (const { dir, source } of themeSources(deckDir)) {
    for (const name of themeNames(dir)) {
      if (seen.has(name)) continue;
      seen.add(name);
      themes.push({ name, source });
    }
  }
  return themes;
}

// Resolves a theme: deck-local first, then the user's themes, then the repo. Returns null when missing.
export function findTheme(name, deckDir) {
  if (!THEME_NAME.test(name)) return null;
  for (const { dir, source } of themeSources(deckDir)) {
    const file = path.join(dir, `${name}.css`);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    return { name, file, source, css: fs.readFileSync(file, "utf8") };
  }
  return null;
}
