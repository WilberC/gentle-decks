// S4: `decks pdf` prints the self-contained deck to PDF with headless Chrome over the DevTools
// protocol (Page.printToPDF), so the static deliverable never goes through the browser print dialog.
// The deck HTML is the same composition the studio export serves (build.js), and the page size comes
// from the theme's `@page` rule (`preferCSSPageSize`), which keeps one slide per 1600x900 page.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { presentHtml } from "./studio/build.js";
import { writeAtomic } from "./studio/state.js";

// Probed in order when neither BROWSER nor CHROME_PATH is set.
export const CHROME_CANDIDATES = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const LAUNCH_TIMEOUT = 15000;
const CALL_TIMEOUT = 60000;
const SETTLE_TIMEOUT = 10000;

const exists = (file) => {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

// Chrome lookup: BROWSER, then CHROME_PATH, then the well-known installs. A source that is set but
// missing stops the probe instead of being skipped, so a typo never silently picks another browser.
export function findChrome(env = process.env) {
  const tried = [];
  for (const name of ["BROWSER", "CHROME_PATH"]) {
    const value = env[name];
    tried.push({ source: name, file: value });
    if (value && exists(value)) return { file: value, tried };
  }
  if (env.BROWSER || env.CHROME_PATH) return { file: null, tried };
  for (const file of CHROME_CANDIDATES) {
    tried.push({ source: null, file });
    if (exists(file)) return { file, tried };
  }
  return { file: null, tried };
}

// Why no browser was picked, naming every source tried so the fix is obvious.
export function chromeProblem(tried) {
  const lines = tried.map(({ source, file }) => {
    if (source && !file) return `  ${source} (not set)`;
    if (source) return `  ${source}=${file} (not found)`;
    return `  ${file} (not found)`;
  });
  return [
    "no Chrome found: set BROWSER or CHROME_PATH to a Chrome/Chromium binary",
    ...lines,
  ].join("\n");
}

// Chrome writes "DevTools listening on ws://..." to stderr once it picks a debugging port.
function devtoolsEndpoint(child, timeout = LAUNCH_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const finish = (settle) => {
      clearTimeout(timer);
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Chrome did not expose a DevTools endpoint"))),
      timeout,
    );
    child.on("error", (err) => finish(() => reject(new Error(`could not start Chrome: ${err.message}`))));
    child.on("exit", (code) => finish(() => reject(new Error(`Chrome exited early (${code})`))));
    child.stderr.on("data", (data) => {
      buf += data;
      const found = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) finish(() => resolve(found[1]));
    });
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error("could not connect to the Chrome DevTools endpoint")));
  });
}

// Minimal CDP client: one request/response map per page socket (the same shape checks/ui-smoke.mjs
// drives by hand, with errors and timeouts promoted to exceptions).
function session(ws) {
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const done = message.id ? pending.get(message.id) : undefined;
    if (!done) return;
    pending.delete(message.id);
    if (message.error) done.reject(new Error(`${done.method}: ${message.error.message}`));
    else done.resolve(message.result ?? {});
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome did not answer ${method}`));
      }, CALL_TIMEOUT);
      pending.set(id, {
        method,
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

// Images are already data URIs and fonts are bundled, but decoding still takes a turn: print only
// after the document is complete and every image decoded, or a page can come out blank.
const SETTLE = `(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
  return document.readyState;
})()`;

async function settle(send, timeout = SETTLE_TIMEOUT) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const { result } = await send("Runtime.evaluate", { expression: SETTLE, awaitPromise: true, returnByValue: true });
    if (result?.value === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// The HTML is handed to the page as its document instead of a file on disk: snap-confined Chromium
// cannot read /tmp, and the built deck is self-contained, so nothing needs a base URL (S4/S9).
export async function printPdf(html, target, { chrome } = {}) {
  if (typeof WebSocket !== "function") {
    throw new Error(`PDF export needs Node.js 22 or newer (built-in WebSocket); running ${process.version}`);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decks-pdf-profile-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let ws;
  try {
    const endpoint = new URL(await devtoolsEndpoint(child));
    const targets = await (await fetch(`http://${endpoint.hostname}:${endpoint.port}/json`)).json();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("Chrome opened no page to print");
    ws = await connect(page.webSocketDebuggerUrl);
    const send = session(ws);
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");
    await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    await settle(send);
    const { data } = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
    const pdf = Buffer.from(data ?? "", "base64");
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Chrome returned no PDF data");
    writeAtomic(target, pdf);
    return target;
  } finally {
    try {
      ws?.close();
    } catch {}
    child.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
}

// `decks pdf <deck.md> [-o <out.pdf>]`: the deck in plan.json order, images embedded, written next
// to the markdown as `<deck>.pdf` unless an output path is given.
export async function deckPdf({ deck, out, env = process.env }) {
  const file = path.resolve(deck);
  if (!exists(file)) throw new Error(`${deck}: deck not found`);
  const dir = path.dirname(file);
  const slug = path.basename(file, path.extname(file));
  // The deck paths the studio reads, for any deck file name (the studio names the deck after its dir).
  const paths = { dir, slug, deck: file, plan: path.join(dir, "plan.json") };
  const html = await presentHtml(paths);
  if (html === null) throw new Error(`${deck}: deck not found`);
  const target = path.resolve(out ?? path.join(dir, `${slug}.pdf`));
  const chrome = findChrome(env);
  if (!chrome.file) throw new Error(chromeProblem(chrome.tried));
  return printPdf(html, target, { chrome: chrome.file });
}
