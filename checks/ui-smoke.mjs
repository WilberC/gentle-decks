// Browser smoke test of the studio UI over the DevTools protocol (no dependencies).
// Run: npm run smoke:ui   (needs Microsoft Edge, Chrome or Chromium; set BROWSER to override)
// Starts its own studio on a temp deck, drives Plan -> Grid -> Editor, and checks the files on disk.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("bin/decks.js");
const CANDIDATES = [
  process.env.BROWSER,
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const EDGE = CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) {
  console.log("skip: no Chromium-based browser found (set BROWSER)");
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "decks-smoke-"));
const deckDir = path.join(work, "python-intro");
fs.mkdirSync(deckDir);
const format = fs.readFileSync("FORMAT.md", "utf8");
fs.writeFileSync(path.join(deckDir, "plan.json"), format.split("## Plan file")[1].split("```json")[1].split("```")[0].trimStart());
const studio = spawn(process.execPath, [CLI, "studio", deckDir], { stdio: ["ignore", "pipe", "inherit"] });
const url = await new Promise((resolve, reject) => {
  let out = "";
  studio.stdout.on("data", (d) => {
    out += d;
    const m = out.match(/^studio: (\S+)/m);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(new Error("studio did not start")), 10000);
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edge-"));
const browser = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1440,1000", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  browser.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(new Error("no devtools url")), 15000);
});
const port = new URL(wsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
const until = async (expr, what, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(expr)) return;
    await sleep(150);
  }
  throw new Error(`timeout: ${what}`);
};
const plan = () => JSON.parse(fs.readFileSync(path.join(deckDir, "plan.json"), "utf8"));
const requests = () => {
  try { return JSON.parse(fs.readFileSync(path.join(deckDir, "requests.json"), "utf8")).requests; } catch { return []; }
};
const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const answerDialog = async (text) => {
  await until(`document.getElementById("dialog").open`, "dialog open");
  await js(`document.getElementById("dialog-text").value = ${JSON.stringify(text)}; document.getElementById("dialog-ok").click(); true`);
};

try {
  await send("Page.enable");
  {
  await send("Page.navigate", { url: `${url}#plan` });
  await until(`!!document.querySelector(".cards .card")`, "plan cards");

  // Edit a title (debounced save).
  await js(`(() => { const t = document.querySelector(".card .title"); t.focus(); t.value = "Por qué Python"; t.dispatchEvent(new Event("input")); t.blur(); return true; })()`);
  await sleep(1200);
  check("edit title saves plan.json", plan().slides[0].title === "Por qué Python", plan().slides[0].title);

  // Add a slide after the last one.
  const before = plan().slides.length;
  await js(`[...document.querySelectorAll(".gap .pill-btn")].filter(b => b.textContent.includes("Add")).pop().click(); true`);
  await answerDialog("Próximos pasos con Python");
  await until(`document.querySelectorAll(".cards .card").length === ${before + 1}`, "card added");
  const added = plan().slides.at(-1);
  check("add slide appends with derived id", plan().slides.length === before + 1 && added.id === "proximos-pasos-con-python", JSON.stringify(added));

  // Move it up.
  await js(`document.querySelectorAll(".cards .card")[${before}].querySelector('[title="Move up"]').click(); true`);
  await sleep(600);
  check("move up reorders", plan().slides[before - 1].id === "proximos-pasos-con-python", plan().slides.map((s) => s.id).join(","));

  // Merge slide 1 into 2 (first gap merge button merges 1 and 2).
  const ids0 = plan().slides.map((s) => s.id);
  await js(`document.querySelector(".gap .pill-btn:nth-child(2)").click(); true`);
  await sleep(600);
  const merged = plan().slides;
  check("merge keeps first id and joins titles", merged.length === ids0.length - 1 && merged[0].id === ids0[0] && merged[0].title.includes(" · "), merged[0].title);

  // Comment on a plan slide.
  await js(`document.querySelector('.card [title="Comment"]').click(); true`);
  await answerDialog("Hazlo más visual");
  await sleep(500);
  const c = requests().find((r) => r.kind === "comment" && r.text === "Hazlo más visual");
  check("plan comment posts a request", !!c, c ? c.slideId : "missing");

  // Theme selection + generate.
  await js(`document.querySelector(".theme").click(); true`);
  await sleep(600);
  check("theme click sets plan.theme", plan().theme === "gentleman-cute", plan().theme);
  await js(`document.querySelector(".plan-foot .btn").click(); true`);
  await sleep(800);
  check("generate posts a request and opens the grid", requests().some((r) => r.kind === "generate") && (await js(`document.querySelector('.tabs [aria-current="page"]').dataset.stage`)) === "grid");

  }
  // Agent writes the deck after "generate".
  {
    execFileSync(process.execPath, [CLI, "plan", "scaffold", path.join(deckDir, "plan.json"), "-o", path.join(deckDir, path.basename(deckDir) + ".md")]);
    await until(`document.querySelectorAll(".grid .frame").length >= 2`, "grid fills live from SSE", 6000);
    check("grid fills live after the agent writes the deck", true);
  }
  // Editor: comment mode click inside the slide.
  await send("Page.navigate", { url: `${url}#editor` });
  await until(`!!document.querySelector(".view .frame iframe")`, "editor view");
  await sleep(1500);
  await js(`[...document.querySelectorAll(".segmented .btn")].find(b => b.textContent.includes("Comment")).click(); true`);
  await sleep(300);
  const rect = await js(`(() => { const r = document.querySelector(".view .frame").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  // The cover title sits around 42% height in the artboard.
  const at = { x: rect.x + rect.w * 0.45, y: rect.y + rect.h * 0.45 };
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
  await answerDialog("Título más corto");
  await sleep(600);
  const pick = requests().find((r) => r.text === "Título más corto");
  check("editor comment carries selector and excerpt", !!pick && !!pick.selector, pick ? `${pick.selector} | ${pick.excerpt}` : "missing");

  // Layout switch.
  await js(`(() => { const s = document.querySelector(".toolbar select"); s.value = "steps"; s.dispatchEvent(new Event("change")); return true; })()`);
  await sleep(600);
  check("layout select posts a layout request", requests().some((r) => r.kind === "layout" && r.layout === "steps"));

  // Requests panel lists open requests.
  await sleep(800);
  const listed = await js(`document.querySelectorAll(".requests li").length`);
  check("requests panel lists open requests", listed === requests().filter((r) => r.status === "open").length && listed >= 2, String(listed));

  // Edit text: click the cover bullet, type, blur -> deck markdown changes for that slide only.
  const deckFile = path.join(deckDir, path.basename(deckDir) + ".md");
  const mdBefore = fs.readFileSync(deckFile, "utf8");
  await js(`[...document.querySelectorAll(".segmented .btn")].find(b => b.textContent.includes("Edit")).click(); true`);
  await sleep(300);
  const p2 = { x: rect.x + rect.w * 0.3, y: rect.y + rect.h * 0.545 };
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: p2.x, y: p2.y, button: "left", clickCount: 1 });
  await sleep(300);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
  await send("Input.insertText", { text: " hoy" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const mdAfter = fs.readFileSync(deckFile, "utf8");
  const changed = mdBefore !== mdAfter;
  check("edit text rewrites only the deck text", changed && mdAfter.replace(" hoy", "") === mdBefore, changed ? (mdAfter.match(/.*hoy.*/) || [""])[0] : "deck unchanged");
} catch (err) {
  results.push(`FAIL exception — ${err.message}`);
} finally {
  console.log(results.join("\n"));
  ws.close();
  browser.kill();
  studio.kill();
  setTimeout(() => {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(work, { recursive: true, force: true });
  }, 500);
  setTimeout(() => process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0), 1500);
}
