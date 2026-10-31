import { esc, renderSlide } from "./render.js";

// Design mode: one static gentle-design artboard per slide plus design.json,
// so the canvas previews every slide and its comments name the slide file.

export const SLIDE_WIDTH = 1600;
export const SLIDE_HEIGHT = 900;
export const SLIDE_FILE = /^\d{2,}-slide\.html$/;

export const slideFile = (index) => `${String(index + 1).padStart(2, "0")}-slide.html`;

// Plain text of the first heading, else the kicker, else "Slide N".
export function slideTitle({ directives, body }, index) {
  const heading = body.split(/\r?\n/).find((line) => /^#{1,3}\s/.test(line));
  const raw = heading ? heading.replace(/^#{1,3}\s+/, "") : directives.kicker || `Slide ${index + 1}`;
  const text = raw
    .replace(/\[\[[\w-]+\|([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || `Slide ${index + 1}`;
}

function renderArtboard(meta, slide, index, total, themeCss) {
  const section = renderSlide(slide, index, total, { active: true, attrs: ` data-slide="${index + 1}"` });
  return `<!doctype html>
<html lang="${meta.lang ?? "es"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${SLIDE_WIDTH}">
<title>${esc(`${meta.title ?? "Deck"} · ${index + 1}`)}</title>
<style>
${themeCss}</style>
</head>
<body>
<div class="deck">
${section}
</div>
<div class="brand"><b>${esc(meta.brand ?? "decks")}</b> · ${esc(meta.title ?? "")}</div>
<div class="counter">${index + 1} / ${total}</div>
</body>
</html>
`;
}

// Returns { files: Map<name, content> } without touching the disk, so a
// failing slide aborts the build before anything is written.
export function renderDesign({ meta, slides }, themeCss) {
  const files = new Map();
  const artboards = slides.map((slide, i) => {
    const file = slideFile(i);
    files.set(file, renderArtboard(meta, slide, i, slides.length, themeCss));
    const num = String(i + 1).padStart(2, "0");
    return { file, title: `${num} · ${slideTitle(slide, i)}`, tradeoff: "", width: SLIDE_WIDTH, height: SLIDE_HEIGHT };
  });
  const manifest = { title: meta.title ?? "Deck", brief: meta.brief ?? "", artboards };
  files.set("design.json", JSON.stringify(manifest, null, 2) + "\n");
  return files;
}
