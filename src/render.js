import { marked } from "marked";
import { parseContainers } from "./parse.js";

// Container names the renderer understands: also the layout values a `layout` request may pick.
export const CONTAINER_NAMES = new Set([
  "grid-2", "grid-3", "grid-4", "split", "steps", "card", "step",
  "term", "bars", "stat", "pills",
]);

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    .replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-wrap"><table>$1</table></div>');
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

function renderContainer(node, slideNo) {
  if (!CONTAINER_NAMES.has(node.name)) {
    throw new Error(`Unknown container ":::${node.name}" on slide ${slideNo}`);
  }
  const inner = node.children.map((c) => renderNode(c, slideNo)).join("\n");
  const mods = node.mods.join(" ");
  switch (node.name) {
    case "grid-2":
    case "grid-3":
    case "grid-4":
    case "split":
    case "steps":
      return `<div class="${node.name}${mods ? " " + mods : ""}">\n${inner}\n</div>`;
    case "card": {
      const cls = ["card", ...node.mods].join(" ");
      const icon = node.attrs.icon ? `<span class="icon">${esc(node.attrs.icon)}</span>\n` : "";
      return `<div class="${cls}">\n${icon}${inner}\n</div>`;
    }
    case "step": {
      const cls = ["step", ...node.mods].join(" ");
      const num = node.attrs.num ? `<b>${esc(node.attrs.num)}</b>\n` : "";
      const title = node.attrs.title ? `<span>${esc(node.attrs.title)}</span>\n` : "";
      return `<div class="${cls}">\n${num}${title}<small>${stripSingleP(inner)}</small>\n</div>`;
    }
    case "stat": {
      const big = node.attrs.big ?? "";
      const small = node.attrs.small ? `<small>${esc(node.attrs.small)}</small>` : "";
      return `<span class="stat">${esc(big)}${small}</span>`;
    }
    case "term": {
      const lines = node.children
        .filter((c) => c.type === "chunk")
        .map((c) => c.text)
        .join("\n")
        .split(/\r?\n/);
      const pre = lines.map((l) => esc(l)).join("\n");
      return (
        `<div class="term">\n<div class="bar"><i></i><i></i><i></i></div>\n` +
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
      return `<div class="bars">\n${rows}\n</div>`;
    }
    case "pills": {
      const pills = node.children
        .filter((c) => c.type === "chunk")
        .flatMap((c) => c.text.split(/\r?\n/))
        .map((line) => line.replace(/^\s*-\s*/, "").trim())
        .filter(Boolean)
        .map((p) => `<span class="pill">${esc(p)}</span>`)
        .join("\n");
      return `<p>${pills}</p>`;
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
  const petals = classes.includes("cover") ? `<div class="petals" aria-hidden="true"></div>\n` : "";
  const kicker = directives.kicker ? `<div class="kicker">${tokens(directives.kicker)}</div>\n` : "";
  const root = parseContainers(body);
  const bodyHtml = root.children.map((c) => renderNode(c, slideNo)).join("\n");
  const withLead = injectLead(bodyHtml, directives.lead);
  return `<section class="${classes.join(" ")}"${attrs}>\n${petals}${kicker}${withLead}\n</section>`;
}

export { esc };

export function renderDeck({ meta, slides }, themeCss, navJs) {
  const sections = slides.map((s, i) => renderSlide(s, i, slides.length)).join("\n");
  return `<!doctype html>
<html lang="${meta.lang ?? "es"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title ?? "Deck")}</title>
<style>
${themeCss}</style>
</head>
<body>
<div class="deck">
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
