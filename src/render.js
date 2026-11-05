import { marked } from "marked";
import { parseContainers } from "./parse.js";

// Container names the renderer understands: also the layout values a `layout` request may pick.
export const CONTAINER_NAMES = new Set([
  "grid-2", "grid-3", "grid-4", "split", "steps", "card", "step",
  "term", "bars", "stat", "pills", "figure",
]);

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Motion vocabulary (S1): `animate:` on a slide, `animate=` on a container, `transition:` deck-wide.
export const ANIMATE_PROFILES = new Set(["fade-up", "fade", "rise", "none"]);
export const TRANSITIONS = new Set(["fade", "slide", "none"]);
export const DEFAULT_TRANSITION = "fade";

// Stagger slots; children beyond the last slot share its delay instead of animating together.
const STAGGER_STEPS = 16;
const STAGGER_RULES = Array.from(
  { length: STAGGER_STEPS },
  (_, i) => `.slide[data-animate].active > *:nth-child(${i + 1}) { --i: ${i}; }`,
).join("\n");

// Motion CSS lives in the base renderer, never in a theme, so every theme gets it for free and the
// self-contained export travels with it (S3). Entrance animations only use opacity/transform, so
// they never move layout or steal focus, and print/reduced motion show the final state.
export const BASE_CSS = `
/* motion: entrance animations and deck transitions (inlined in the single-file export) */
.deck { --enter-duration: .5s; --enter-stagger: 80ms; }
@keyframes deck-enter-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-enter-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes deck-enter-rise { from { opacity: 0; transform: translateY(34px) scale(.985); } to { opacity: 1; transform: none; } }

/* A slide with animate: staggers its direct children; re-adding .active replays the entrance. */
.slide[data-animate].active > *:not([data-animate]) {
  animation-duration: var(--enter-duration);
  animation-timing-function: cubic-bezier(.22, .61, .36, 1);
  animation-fill-mode: both;
  animation-delay: calc(var(--i, 0) * var(--enter-stagger));
}
.slide[data-animate="fade"].active > *:not([data-animate]) { animation-name: deck-enter-fade; }
.slide[data-animate="fade-up"].active > *:not([data-animate]) { animation-name: deck-enter-fade-up; }
.slide[data-animate="rise"].active > *:not([data-animate]) { animation-name: deck-enter-rise; }
${STAGGER_RULES}
.slide[data-animate].active > *:nth-child(n + ${STAGGER_STEPS + 1}) { --i: ${STAGGER_STEPS}; }

/* Container markers animate their own block and opt out of the slide stagger. */
.slide.active [data-animate="fade"],
.slide.active [data-animate="fade-up"],
.slide.active [data-animate="rise"] {
  animation-duration: var(--enter-duration);
  animation-timing-function: cubic-bezier(.22, .61, .36, 1);
  animation-fill-mode: both;
}
.slide.active [data-animate="fade"] { animation-name: deck-enter-fade; }
.slide.active [data-animate="fade-up"] { animation-name: deck-enter-fade-up; }
.slide.active [data-animate="rise"] { animation-name: deck-enter-rise; }

/* Deck transitions: fade is the crossfade, slide enters with vertical movement, none is instant. */
.deck.transition-fade .slide { transition: opacity .45s ease, transform .45s ease; }
.deck.transition-slide .slide { transform: translateY(48px); transition: opacity .5s ease, transform .5s cubic-bezier(.22, .61, .36, 1); }
.deck.transition-slide .slide.active { transform: none; }
.deck.transition-none .slide { transition: none; }

/* motion: reduced motion and print always show the final state */
@media (prefers-reduced-motion: reduce) {
  .slide[data-animate].active > *:not([data-animate]),
  .slide.active [data-animate="fade"],
  .slide.active [data-animate="fade-up"],
  .slide.active [data-animate="rise"],
  .deck .slide { animation: none !important; transition: none !important; }
}
@media print {
  .slide[data-animate].active > *:not([data-animate]),
  .slide.active [data-animate="fade"],
  .slide.active [data-animate="fade-up"],
  .slide.active [data-animate="rise"] { animation: none !important; opacity: 1 !important; transform: none !important; }
  .deck .slide { opacity: 1 !important; transform: none !important; transition: none !important; }
}
`;

// Inline color tokens: [[class|text]] -> <span class="class">text</span>
function tokens(s) {
  return s.replace(/\[\[([\w-]+)\|([^\]]*)\]\]/g, (_, cls, text) => `<span class="${cls}">${text}</span>`);
}

function md(text) {
  const html = marked.parse(tokens(text));
  return postProcess(html);
}

function postProcess(html) {
  return html
    .replace(/<blockquote>\s*<p>([\s\S]*?)<\/p>\s*<\/blockquote>/g, '<p class="quote">$1</p>')
    .replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-wrap"><table>$1</table></div>')
    // Cited resources survive every export: external links open in a new tab instead of
    // navigating away from (or being blocked by) the presentation sandbox.
    .replace(/<a href="(https?:[^"]*)"/g, '<a target="_blank" rel="noopener noreferrer" href="$1"');
}

function stripSingleP(html) {
  return html.replace(/^<p>([\s\S]*?)<\/p>\s*$/, "$1");
}

function renderNode(node, slideNo) {
  if (node.type === "chunk") {
    if (node.text.trim() === "") return "";
    return md(node.text);
  }
  return renderContainer(node, slideNo);
}

// `animate=` on a container marks that block only; `animate=none` opts it out of the slide stagger.
function animateAttr(attrs, slideNo) {
  if (attrs.animate === undefined) return "";
  if (!ANIMATE_PROFILES.has(attrs.animate)) {
    throw new Error(`Unknown animate profile "${attrs.animate}" on slide ${slideNo}`);
  }
  return ` data-animate="${esc(attrs.animate)}"`;
}

function renderContainer(node, slideNo) {
  if (!CONTAINER_NAMES.has(node.name)) {
    throw new Error(`Unknown container ":::${node.name}" on slide ${slideNo}`);
  }
  const inner = node.children.map((c) => renderNode(c, slideNo)).join("\n");
  const mods = node.mods.join(" ");
  const animate = animateAttr(node.attrs, slideNo);
  switch (node.name) {
    case "grid-2":
    case "grid-3":
    case "grid-4":
    case "split":
    case "steps":
      return `<div class="${node.name}${mods ? " " + mods : ""}"${animate}>\n${inner}\n</div>`;
    case "card": {
      const cls = ["card", ...node.mods].join(" ");
      const icon = node.attrs.icon ? `<span class="icon">${esc(node.attrs.icon)}</span>\n` : "";
      return `<div class="${cls}"${animate}>\n${icon}${inner}\n</div>`;
    }
    case "step": {
      const cls = ["step", ...node.mods].join(" ");
      const num = node.attrs.num ? `<b>${esc(node.attrs.num)}</b>\n` : "";
      const title = node.attrs.title ? `<span>${esc(node.attrs.title)}</span>\n` : "";
      return `<div class="${cls}"${animate}>\n${num}${title}<small>${stripSingleP(inner)}</small>\n</div>`;
    }
    case "figure": {
      // S8: images are first-class slide content: `::: figure src=path alt=... caption=...`.
      // Builds are self-contained, so the src is embedded as a data URI after rendering (S9).
      const src = node.attrs.src;
      if (!src) throw new Error(`figure needs a src= attribute on slide ${slideNo}`);
      const cls = ["figure", ...node.mods].join(" ");
      const alt = node.attrs.alt ?? "";
      const cap = node.attrs.caption ? `\n<figcaption>${stripSingleP(md(node.attrs.caption))}</figcaption>` : "";
      return `<figure class="${cls}"${animate}>\n<img src="${esc(src)}" alt="${esc(alt)}">${cap}\n</figure>`;
    }
    case "stat": {
      const big = node.attrs.big ?? "";
      const small = node.attrs.small ? `<small>${esc(node.attrs.small)}</small>` : "";
      return `<span class="stat"${animate}>${esc(big)}${small}</span>`;
    }
    case "term": {
      const lines = node.children
        .filter((c) => c.type === "chunk")
        .map((c) => c.text)
        .join("\n")
        .split(/\r?\n/);
      const pre = lines.map((l) => esc(l)).join("\n");
      return (
        `<div class="term"${animate}>\n<div class="bar"><i></i><i></i><i></i></div>\n` +
        `<pre>${tokens(pre)}</pre>\n</div>`
      );
    }
    case "bars": {
      const rows = node.children
        .filter((c) => c.type === "chunk")
        .flatMap((c) => c.text.split(/\r?\n/))
        .map((line) => line.replace(/^\s*-\s*/, "").trim())
        .filter(Boolean)
        .map((item) => {
          const [label, pct, tone = "mid"] = item.split("|").map((p) => p.trim());
          return (
            `<div class="bar-row"><span class="label">${esc(label)}</span>` +
            `<div class="bar-track"><div class="bar-fill ${esc(tone)}" style="width:${esc(pct)}%">${esc(pct)}%</div></div></div>`
          );
        })
        .join("\n");
      return `<div class="bars"${animate}>\n${rows}\n</div>`;
    }
    case "pills": {
      const pills = node.children
        .filter((c) => c.type === "chunk")
        .flatMap((c) => c.text.split(/\r?\n/))
        .map((line) => line.replace(/^\s*-\s*/, "").trim())
        .filter(Boolean)
        .map((p) => `<span class="pill">${esc(p)}</span>`)
        .join("\n");
      return `<p${animate}>${pills}</p>`;
    }
    default:
      throw new Error(`Unhandled container "${node.name}"`);
  }
}

function injectLead(bodyHtml, lead) {
  if (!lead) return bodyHtml;
  const leadHtml = `<p class="lead">${tokens(lead)}</p>`;
  const m = bodyHtml.match(/<\/h[12]>/);
  if (m) {
    const at = m.index + m[0].length;
    return bodyHtml.slice(0, at) + "\n" + leadHtml + bodyHtml.slice(at);
  }
  return leadHtml + "\n" + bodyHtml;
}

// `active` marks the slide visible on load; `attrs` adds raw attributes to the <section>.
export function renderSlide(slide, index, total, { active = index === 0, attrs = "" } = {}) {
  const { directives, body } = slide;
  const slideNo = index + 1;
  const classes = ["slide", ...(directives.class ? directives.class.split(/\s+/) : [])];
  if (active) classes.push("active");
  let animate = "";
  if (directives.animate !== undefined && directives.animate !== "none") {
    if (!ANIMATE_PROFILES.has(directives.animate)) {
      throw new Error(`Unknown animate profile "${directives.animate}" on slide ${slideNo}`);
    }
    animate = ` data-animate="${esc(directives.animate)}"`;
  }
  const petals = classes.includes("cover") ? `<div class="petals" aria-hidden="true"></div>\n` : "";
  const kicker = directives.kicker ? `<div class="kicker">${tokens(directives.kicker)}</div>\n` : "";
  const root = parseContainers(body);
  const bodyHtml = root.children.map((c) => renderNode(c, slideNo)).join("\n");
  const withLead = injectLead(bodyHtml, directives.lead);
  return `<section class="${classes.join(" ")}"${animate}${attrs}>\n${petals}${kicker}${withLead}\n</section>`;
}

// Deck-wide transition: `fade` (default) is the theme crossfade, `slide` adds vertical movement,
// `none` removes it. Unknown values fail the build instead of silently falling back.
function deckTransition(value) {
  if (value === undefined || value === "") return DEFAULT_TRANSITION;
  if (!TRANSITIONS.has(value)) throw new Error(`Unknown transition "${value}"`);
  return value;
}

export { esc };

export function renderDeck({ meta, slides }, themeCss, navJs) {
  const sections = slides.map((s, i) => renderSlide(s, i, slides.length)).join("\n");
  const transition = deckTransition(meta.transition);
  return `<!doctype html>
<html lang="${meta.lang ?? "es"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title ?? "Deck")}</title>
<style>
${themeCss}${BASE_CSS}</style>
</head>
<body>
<div class="deck transition-${transition}">
${sections}
</div>
<div class="brand"><b>${esc(meta.brand ?? "decks")}</b> · ${esc(meta.title ?? "")}</div>
<div class="counter" id="counter"></div>
<div class="progress" id="progress"></div>
<div class="hint" id="hint">← → navigate · F fullscreen · P export PDF</div>
<nav class="touch-nav" aria-label="Navigation">
<button type="button" id="prev" aria-label="Previous">‹</button>
<button type="button" id="next" aria-label="Next">›</button>
</nav>
<script>
${navJs}</script>
</body>
</html>
`;
}
