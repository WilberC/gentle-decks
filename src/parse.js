import fs from "node:fs";
import path from "node:path";

// Slide splitting and container parsing. See FORMAT.md for the format contract.

export function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: md.slice(m[0].length) };
}

export function splitSlides(body) {
  const parts = body.split(/^\s*-{3,}\s*$/m);
  return parts.map((s) => s.replace(/^\s*\n+|\n+\s*$/g, "")).filter((s) => s.length > 0);
}

const DIRECTIVE = /^([A-Za-z][\w-]*):\s*(.*)$/;

export function parseSlide(raw) {
  const lines = raw.split(/\r?\n/);
  const directives = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    const kv = line.match(DIRECTIVE);
    if (!kv) break;
    if (kv[2].trim() !== "") directives[kv[1]] = kv[2].trim();
  }
  const body = lines.slice(i).join("\n").replace(/^\s*\n+/, "");
  return { directives, body };
}

export const SLIDE_ID = /^[a-z][a-z0-9-]*$/;

// Gives every slide a stable `id`: its `id:` directive, else `slide-N`.
// Invalid or duplicate ids throw with the slide number.
export function assignIds(slides) {
  const seen = new Set();
  return slides.map((slide, i) => {
    const id = slide.directives.id ?? `slide-${i + 1}`;
    if (!SLIDE_ID.test(id)) throw new Error(`Invalid slide id "${id}" on slide ${i + 1}`);
    if (seen.has(id)) throw new Error(`Duplicate slide id "${id}" on slide ${i + 1}`);
    seen.add(id);
    return { ...slide, id };
  });
}

const OPEN = /^:::\s*([\w-]+)\s*(.*)$/;
const CLOSE = /^:::\s*$/;

export function parseAttrs(str) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*("([^"]*)"|\S+)/g;
  let m;
  while ((m = re.exec(str))) attrs[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return attrs;
}

// Builds a tree: { type: "chunk", text } | { type: "container", name, mods, attrs, children }
export function parseContainers(body) {
  const lines = body.split(/\r?\n/);
  const root = { type: "root", children: [] };
  const stack = [root];
  for (const line of lines) {
    const open = line.match(OPEN);
    if (open) {
      // Quoted attribute values may contain spaces: strip `key=value` spans first, then the
      // remaining bare words are the modifiers.
      const attrs = {};
      const rest = open[2].replace(/([\w-]+)\s*=\s*("([^"]*)"|\S+)/g, (m, key, value, quoted) => {
        attrs[key] = quoted !== undefined ? quoted : value;
        return " ";
      });
      const mods = rest.trim().split(/\s+/).filter(Boolean);
      const node = {
        type: "container",
        name: open[1],
        mods,
        attrs,
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }
    if (CLOSE.test(line) && stack.length > 1) {
      stack.pop();
      continue;
    }
    const top = stack[stack.length - 1];
    const last = top.children[top.children.length - 1];
    if (last && last.type === "chunk") last.text += "\n" + line;
    else top.children.push({ type: "chunk", text: line });
  }
  if (stack.length !== 1) {
    throw new Error(`Unclosed container ":::${stack[stack.length - 1].name}"`);
  }
  return root;
}
