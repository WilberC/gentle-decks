// Self-contained builds: every <img> becomes a data URI, so exports and PDF
// prints never carry broken external references (S9). Sources that cannot be
// read are left untouched rather than failing the build.
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const IMG_SRC = /<img\b[^>]*\bsrc="([^"]+)"/g;

async function toDataUri(src, baseDir) {
  try {
    if (/^(https?:)?\/\//.test(src)) {
      const res = await fetch(src.startsWith("//") ? `https:${src}` : src, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const type = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${type};base64,${buf.toString("base64")}`;
    }
    const file = path.resolve(baseDir, decodeURIComponent(src.split("?")[0].split("#")[0]));
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) return null;
    return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}

// Replaces every readable image source with a data URI. Duplicate sources are
// fetched once; a source that fails keeps its original value.
export async function embedImages(html, baseDir) {
  const sources = new Set();
  for (const match of html.matchAll(IMG_SRC)) sources.add(match[1]);
  if (!sources.size) return html;
  const embedded = new Map();
  await Promise.all(
    [...sources].map(async (src) => embedded.set(src, await toDataUri(src, baseDir))),
  );
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (m, pre, src, post) => {
    const uri = embedded.get(src);
    return uri ? `${pre}${uri}${post}` : m;
  });
}
