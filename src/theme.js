// Theme contract: selectors every theme in themes/ must style. See themes/CONTRACT.md.

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
