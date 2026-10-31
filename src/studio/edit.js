// Inline text edit of one slide (S10): replace a unique `before` inside that slide's markdown body,
// leaving every other byte of the deck (other slides, directives, frontmatter) untouched.
import fs from "node:fs";
import { parseSlide } from "../parse.js";
import { writeAtomic } from "./state.js";

const SEPARATOR_LINE = /^[ \t]*-{3,}[ \t]*$/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

// [start, end) offsets of every non-empty slide block in the full deck text.
function slideRanges(text) {
  const front = text.match(FRONTMATTER);
  const first = front ? front[0].length : 0;
  const ranges = [];
  let start = first;
  let offset = first;
  for (const line of text.slice(first).split("\n")) {
    if (SEPARATOR_LINE.test(line.replace(/\r$/, ""))) {
      ranges.push([start, offset]);
      start = offset + line.length + 1;
    }
    offset += line.length + 1;
  }
  ranges.push([start, text.length]);
  return ranges.filter(([from, to]) => text.slice(from, to).trim() !== "");
}

// Offset where the slide body starts, so directive lines are never edited.
function bodyOffset(raw) {
  let offset = 0;
  for (const line of raw.split("\n")) {
    const plain = line.replace(/\r$/, "");
    if (plain.trim() === "") return offset;
    if (!/^([A-Za-z][\w-]*):\s*(.*)$/.test(plain)) return offset;
    offset += line.length + 1;
  }
  return offset;
}

// Returns { status: "ok" } | { status: "not-found" } | { status: "ambiguous" }; writes only on ok.
export function editSlideText(paths, id, before, after) {
  let text;
  try {
    text = fs.readFileSync(paths.deck, "utf8");
  } catch {
    return { status: "not-found" };
  }
  const slides = slideRanges(text).map(([from, to], index) => {
    // The block starts right after the `---` separator, so drop the blank line splitSlides trims.
    const raw = text.slice(from, to).replace(/^\s+/, "");
    const lead = text.slice(from, to).length - raw.length;
    return {
      id: parseSlide(raw).directives.id ?? `slide-${index + 1}`,
      from,
      to,
      body: from + lead + bodyOffset(raw),
    };
  });
  const target = slides.find((slide) => slide.id === id);
  if (!target) return { status: "not-found" };

  const region = text.slice(target.body, target.to);
  let hits = 0;
  let at = -1;
  for (let i = region.indexOf(before); i !== -1; i = region.indexOf(before, i + before.length)) {
    hits += 1;
    if (at < 0) at = i;
    if (hits > 1) break;
  }
  if (hits === 0) return { status: "not-found" };
  if (hits > 1) return { status: "ambiguous" };

  const cut = target.body + at;
  writeAtomic(paths.deck, text.slice(0, cut) + after + text.slice(cut + before.length));
  return { status: "ok" };
}
