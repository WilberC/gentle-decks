// Browser smoke test of the studio workspace over the DevTools protocol (no dependencies).
// Run: npm run smoke:ui   (needs Microsoft Edge, Chrome or Chromium; set BROWSER to override)
// Starts its own studio on a temp deck, drives the single workspace (Estilo / Slide / Grid, outline,
// comments), and checks the files on disk.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
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
// S3: this deck proposes its own theme and the studio gets an isolated user themes dir, so
// "Mis estilos" can be exercised without reading or writing the developer's ~/.config.
const userThemes = path.join(work, "user-themes");
fs.mkdirSync(userThemes);
fs.mkdirSync(path.join(deckDir, "themes"));
// The deck's proposal is a copy of a bundled theme, so the slides it renders keep a real layout.
const DECK_THEME_FILE = path.join(deckDir, "themes", "studio.css");
fs.copyFileSync(path.resolve("themes", "fair-test.css"), DECK_THEME_FILE);
const format = fs.readFileSync("FORMAT.md", "utf8");
fs.writeFileSync(path.join(deckDir, "plan.json"), format.split("## Plan file")[1].split("```json")[1].split("```")[0].trimStart());
const studio = spawn(process.execPath, [CLI, "studio", deckDir], {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, GENTLE_DECKS_THEMES: userThemes },
});
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
// Page exceptions are collected so a step can prove it added none (S1 design view).
const exceptions = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params?.exceptionDetails?.text ?? "exception");
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
const click = async (selector) => js(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return false; n.click(); return true; })()`);
const setValue = async (selector, value, event = "input") =>
  js(`(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) return false;
    n.focus();
    n.value = ${JSON.stringify(value)};
    n.dispatchEvent(new Event(${JSON.stringify(event)}));
    return true;
  })()`);
const clickInFrame = async (selector, fx, fy) => {
  const rect = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const at = { x: rect.x + rect.w * fx, y: rect.y + rect.h * fy };
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
  }
  return at;
};
const plan = () => JSON.parse(fs.readFileSync(path.join(deckDir, "plan.json"), "utf8"));
const requests = () => {
  try { return JSON.parse(fs.readFileSync(path.join(deckDir, "requests.json"), "utf8")).requests; } catch { return []; }
};
const results = [];
// The stub gentle-design canvas the S1 design-view step opens and then closes.
let stubCanvas = null;
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
// A 1x1 PNG: the reference the flow uploads.
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// S1/S2: drive the hidden reference input the way the browser does after a pick — a real PNG File
// through `change` — so the studio's own upload path runs end to end (base64 → POST api/references →
// dialog → request → file on disk). The native file-chooser chrome belongs to the browser, not the
// studio, so this covers everything from `change` on and not the OS dialog itself.
const pickReference = async (selector) => {
  await click(selector);
  await until(`!!document.getElementById("reference-file")`, "reference file input");
  await js(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_1PX)}), (c) => c.charCodeAt(0));
    const input = document.getElementById("reference-file");
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "marca.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
    return true;
  })()`);
};
const answerDialog = async (text) => {
  await until(`document.getElementById("dialog").open`, "dialog open");
  await js(`document.getElementById("dialog-text").value = ${JSON.stringify(text)}; document.getElementById("dialog-ok").click(); true`);
};
const selectRow = async (i) => {
  await js(`document.querySelectorAll(".outline .row")[${i}].click(); true`);
  await until(`document.querySelectorAll(".outline .row")[${i}].getAttribute("aria-current") === "true"`, `row ${i} selected`);
};
const selectedAct = (act) => `.outline .row[aria-current="true"] [data-act="${act}"]`;

try {
  await send("Page.enable");
  await send("Runtime.enable");
  // The picker's OS dialog is not the studio's: intercept it so headless never waits on it.
  await send("Page.setInterceptFileChooserDialog", { enabled: true }).catch(() => {});
  await send("Page.navigate", { url });
  await until(`!!document.querySelector(".look .theme")`, "Estilo view with theme cards");
  check(
    "deck missing opens the Estilo view (S3)",
    await js(`document.querySelector('#tools [data-view="style"]').getAttribute("aria-pressed") === "true"`),
  );

  // S5: a row select expands it with inline title, points and notes.
  await selectRow(0);
  await until(`!!document.querySelector('.outline .row[aria-current="true"] .edit')`, "expanded row fields");

  // Edit a title (debounced save).
  await setValue('.outline .row[aria-current="true"] .edit', "Por qué Python");
  await js(`document.querySelector('.outline .row[aria-current="true"] .edit').blur(); true`);
  await sleep(1200);
  check("edit title saves plan.json", plan().slides[0].title === "Por qué Python", plan().slides[0].title);

  // S6: the bullet preview mirrors the points while editing.
  await selectRow(1);
  await until(`document.querySelectorAll(".points-preview li").length === 1`, "points preview bullets");
  await setValue('.outline .row[aria-current="true"] .points', "Punto uno\nPunto dos");
  await until(`document.querySelectorAll(".points-preview li").length === 2`, "points preview updates while typing");
  await js(`document.querySelector('.outline .row[aria-current="true"] .points').blur(); true`);
  await sleep(800);
  check("points preview mirrors the saved points", plan().slides[1].points.join("|") === "Punto uno|Punto dos", plan().slides[1].points.join("|"));

  // S7: selecting from the structure opens the text-only wireframe.
  await selectRow(1);
  await until(`document.querySelector('#tools [data-view="wire"]').getAttribute("aria-pressed") === "true"`, "wire view active");
  check(
    "wireframe shows the slide as text only",
    (await js(`document.querySelector(".wire h2")?.textContent`)) === plan().slides[1].title
      && (await js(`document.querySelectorAll(".wire-points li").length`)) === 2,
  );

  // Add a slide after the last one.
  const before = plan().slides.length;
  await click(".o-foot .o-add");
  await answerDialog("Próximos pasos con Python");
  await until(`document.querySelectorAll(".outline .row").length === ${before + 1}`, "row added");
  const added = plan().slides.at(-1);
  check("add slide appends with derived id", plan().slides.length === before + 1 && added.id === "proximos-pasos-con-python", JSON.stringify(added));

  // Move it up from the expanded row.
  await selectRow(before);
  await click(selectedAct("up"));
  await sleep(700);
  check("move up reorders", plan().slides[before - 1].id === "proximos-pasos-con-python", plan().slides.map((s) => s.id).join(","));

  // Merge the first two slides.
  const ids0 = plan().slides.map((s) => s.id);
  await selectRow(0);
  await click(selectedAct("merge"));
  await sleep(700);
  const merged = plan().slides;
  check(
    "merge keeps first id and joins titles",
    merged.length === ids0.length - 1 && merged[0].id === ids0[0] && merged[0].title.includes(" · "),
    merged[0].title,
  );

  // Comment on a plan slide.
  await click(selectedAct("comment"));
  await answerDialog("Hazlo más visual");
  await sleep(600);
  const planComment = requests().find((r) => r.kind === "comment" && r.text === "Hazlo más visual");
  check("plan comment posts a request", !!planComment, planComment ? planComment.slideId : "missing");

  // Back to Estilo (the row selects above left the center in Boceto).
  await click('#tools [data-view="style"]');
  await until(`!!document.querySelector(".theme")`, "theme cards visible again");

  // S10: the Estilo view offers a clear way to ask the agent for a new theme.
  const newThemeRequests = () => requests().filter((r) => r.kind === "propose-style" && r.mode === "new");
  const proposeBefore = newThemeRequests().length;
  await click("#propose-style");
  await js(`document.getElementById("dialog").close(""); true`);
  await sleep(400);
  check("propose-style button sends nothing when cancelled (S10)", newThemeRequests().length === proposeBefore);
  await click("#propose-style");
  await answerDialog("Colores fríos de laboratorio, sin rosa");
  await sleep(800);
  const proposed = newThemeRequests()[0];
  check(
    "propose-style button asks the agent for a new theme (S10)",
    !!proposed && proposed.text === "Colores fríos de laboratorio, sin rosa",
    proposed ? `${proposed.mode} | ${proposed.text}` : "missing",
  );

  // S1: "📎 con referencia" uploads the picked file, names it in the dialog, and carries it in the request.
  await pickReference("#propose-reference");
  await until(`document.getElementById("dialog").open`, "reference dialog");
  const refHint = await js(`document.getElementById("dialog-hint").textContent`);
  await answerDialog("Con la paleta de la marca");
  await sleep(1000);
  const fromReference = requests().find((r) => r.kind === "propose-style" && r.mode === "new" && r.reference);
  check(
    "reference attach uploads the file and asks for a theme from it (S1)",
    !!fromReference
      && fromReference.reference === "references/marca.png"
      && fromReference.text === "Con la paleta de la marca"
      && refHint.includes("marca.png")
      && fs.existsSync(path.join(deckDir, "references", "marca.png")),
    fromReference ? `${fromReference.reference} | hint=${refHint.slice(0, 48)}` : "missing",
  );

  // S11: a card opens the theme detail: a big themed preview, the component legend, and the
  // theme-level actions (choose / comment / improve).
  const otherTheme = await js(`(() => {
    const current = [...document.querySelectorAll(".theme")].find((t) => t.getAttribute("aria-pressed") === "true");
    const other = [...document.querySelectorAll(".theme")].find((t) => t !== current);
    return other ? other.dataset.theme : "";
  })()`);
  await click(`.theme[data-theme="${otherTheme}"]`);
  await until(`!!document.querySelector(".theme-detail")`, "theme detail view");
  const detail = await js(`(() => {
    const box = document.querySelector(".theme-detail");
    const frames = [...box.querySelectorAll(".preview .frame iframe")];
    return {
      frames: frames.length,
      themed: frames.length > 0 && frames.every((f) => f.src.includes(${JSON.stringify(`theme=${otherTheme}`)})),
      components: box.querySelectorAll(".components li code").length,
    };
  })()`);
  check(
    "theme detail shows a large themed preview and the component examples (S11)",
    detail.frames >= 2 && detail.themed && detail.components === 7,
    JSON.stringify(detail),
  );
  await click("#theme-comment");
  await answerDialog("El título necesita más contraste");
  await sleep(800);
  const themedComment = requests().find((r) => r.kind === "propose-style" && r.mode === "comment");
  check(
    "theme comment posts a request for that theme (S11)",
    !!themedComment && themedComment.theme === otherTheme && themedComment.text === "El título necesita más contraste",
    themedComment ? `${themedComment.theme} | ${themedComment.text}` : "missing",
  );
  // S2: the detail can also improve the theme towards a reference file.
  await pickReference("#theme-improve-reference");
  await until(`document.getElementById("dialog").open`, "improve reference dialog");
  await answerDialog("Acercalo a la marca");
  await sleep(1000);
  const improved = requests().find((r) => r.kind === "propose-style" && r.mode === "improve" && r.reference);
  check(
    "theme detail improves a theme from a reference (S2)",
    !!improved
      && improved.theme === otherTheme
      && improved.reference === "references/marca.png"
      && improved.text === "Acercalo a la marca",
    improved ? `${improved.theme} | ${improved.reference}` : "missing",
  );
  await click("#theme-choose");
  await sleep(700);
  check("theme click sets plan.theme", plan().theme === otherTheme, `${otherTheme} / ${plan().theme}`);
  // The detail is a stage inside Estilo: go back so Generate stays reachable.
  await click("#theme-back");
  await until(`!!document.querySelector("#generate")`, "Estilo card list after the theme detail");

  // S1 (design-view-integration): the gentle-design canvas runs on its own loopback port and its CSP
  // forbids framing, so the studio never embeds it: Estilo offers “Ver en gentle design” in another
  // tab, states how to come back, and this tab keeps the deck, the view and the drafts.
  const canvasPage = (stubCanvas = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html><head><title>Gentle Design</title><script id="gd-config" type="application/json">{}</script></head><body></body></html>');
  }));
  await new Promise((resolve) => canvasPage.listen(0, "127.0.0.1", resolve));
  const canvasUrl = `http://127.0.0.1:${canvasPage.address().port}/tok3n/d/demo/`;
  check(
    "Estilo offers “Ver en gentle design” without embedding the canvas (S1)",
    (await js(`document.getElementById("design-open")?.tagName === "BUTTON"`)) &&
      (await js(`document.getElementById("design-note").textContent.includes("gentle design")`)) &&
      (await js(`[...document.querySelectorAll("iframe")].every((f) => !f.src.includes("127.0.0.1:${canvasPage.address().port}"))`)),
  );
  // Without a saved URL the action asks for it; cancelling stores nothing.
  await click("#design-open");
  await js(`document.getElementById("dialog").close(""); true`);
  await sleep(300);
  check(
    "the canvas action sends nothing when cancelled (S1)",
    !fs.existsSync(path.join(deckDir, ".studio-canvas")) && (await js(`document.getElementById("design-open").tagName === "BUTTON"`)),
  );
  await click("#design-open");
  await answerDialog(canvasUrl);
  await until(`document.getElementById("design-open")?.tagName === "A"`, "canvas link after saving its URL");
  const designLink = await js(`(() => {
    const n = document.getElementById("design-open");
    return { href: n.getAttribute("href"), target: n.getAttribute("target"), rel: n.getAttribute("rel"), note: document.getElementById("design-note").textContent };
  })()`);
  check(
    "the saved canvas opens in another tab with the way back to decks (S1)",
    designLink.href === canvasUrl &&
      designLink.target === "_blank" &&
      String(designLink.rel).includes("noopener") &&
      designLink.note.includes("volvés a decks") &&
      fs.readFileSync(path.join(deckDir, ".studio-canvas"), "utf8").trim() === canvasUrl,
    `${designLink.href} | ${designLink.target} | ${designLink.note.slice(0, 60)}`,
  );
  // The round trip: the link opens the canvas in its own tab and this tab keeps deck, view and draft.
  await setValue("#compose", "Borrador antes del canvas");
  const studioBefore = await js(`({
    href: location.href,
    view: document.querySelector('#tools [data-view][aria-pressed="true"]').dataset.view,
    deck: document.getElementById("deck-title").textContent,
  })`);
  const errorsBefore = exceptions.length;
  await click("#design-open");
  await sleep(900);
  const studioAfter = await js(`({
    href: location.href,
    view: document.querySelector('#tools [data-view][aria-pressed="true"]').dataset.view,
    deck: document.getElementById("deck-title").textContent,
    draft: document.getElementById("compose").value,
  })`);
  check(
    "the design round trip keeps deck, view and composer draft (S1)",
    studioAfter.href === studioBefore.href &&
      studioAfter.view === studioBefore.view &&
      studioAfter.deck === studioBefore.deck &&
      studioAfter.draft === "Borrador antes del canvas" &&
      exceptions.length === errorsBefore,
    JSON.stringify(studioAfter),
  );
  // The canvas closes: the studio keeps working and never offers a dead link.
  await new Promise((resolve) => canvasPage.close(resolve));
  await send("Page.navigate", { url });
  await until(`!!document.querySelector(".look .theme")`, "Estilo view after reloading without a canvas");
  await until(`document.getElementById("design-open")?.tagName === "BUTTON"`, "dead canvas is not a link");
  const deadCanvas = await js(`({
    note: document.getElementById("design-note").textContent,
    check: !!document.getElementById("design-check"),
  })`);
  check(
    "a canvas that stopped answering degrades to a hint, not a dead link (S1)",
    deadCanvas.note.includes("no responde") && deadCanvas.check,
    deadCanvas.note.slice(0, 70),
  );

  // S3: "Mis estilos" manages my own themes: save the deck's proposal as mine, then delete it.
  await click('#tools [data-view="mine"]');
  await until(`document.querySelector('#tools [data-view="mine"]').getAttribute("aria-pressed") === "true"`, "Mis estilos view");
  check(
    "Mis estilos shows the empty state and the deck's proposal (S3)",
    (await js(`!!document.getElementById("mine-empty")`)) && (await js(`!!document.getElementById("mine-promote-studio")`)),
  );
  await click("#mine-promote-studio");
  await until(`!!document.getElementById("mine-choose-studio")`, "promoted theme listed under mine");
  check(
    "Guardar como mío copies the deck theme into the user themes dir (S3)",
    fs.existsSync(path.join(userThemes, "studio.css")) && !(await js(`!!document.getElementById("mine-empty")`)),
  );
  await click("#mine-delete-studio");
  await until(`document.getElementById("dialog").open`, "delete confirmation");
  const deleteHint = await js(`document.getElementById("dialog-hint").textContent`);
  await js(`document.getElementById("dialog-ok").click(); true`);
  await until(`!document.getElementById("mine-choose-studio")`, "theme removed from mine");
  check(
    "Borrar removes only my copy and keeps the deck theme (S3)",
    !fs.existsSync(path.join(userThemes, "studio.css")) && fs.existsSync(DECK_THEME_FILE),
    deleteHint.slice(0, 70),
  );
  await until(`!!document.querySelector(".mine .theme .frame iframe")`, "deck proposal preview still renders");
  check(
    "the deck proposal is still listed after deleting my copy (S3)",
    await js(`!!document.getElementById("mine-promote-studio")`),
  );
  await click('#tools [data-view="style"]');
  await until(`!!document.querySelector("#generate")`, "Estilo card list before generating");

  // Generate.
  await click("#generate");
  await until(`document.querySelector('#tools [data-view="grid"]').getAttribute("aria-pressed") === "true"`, "Grid view after generate");
  check("generate posts a request and opens the Grid view", requests().some((r) => r.kind === "generate"));

  // S13: while the agent writes, a visible banner states the queue and that nothing is required.
  await until(`!document.getElementById("queue").hidden`, "writing banner visible");
  check(
    "writing banner states the queue while generating",
    (await js(`document.getElementById("queue").textContent`)).includes("Escribiendo"),
  );

  // Agent writes the deck after "generate".
  execFileSync(process.execPath, [CLI, "plan", "scaffold", path.join(deckDir, "plan.json"), "-o", path.join(deckDir, path.basename(deckDir) + ".md")]);
  await until(`document.querySelectorAll(".outline .row .th .frame").length >= 2`, "outline thumbnails fill live from SSE", 8000);
  await until(`document.querySelectorAll(".grid .frame").length >= 2`, "grid fills live from SSE", 8000);
  check("outline thumbnails and grid fill live after the agent writes the deck", true);
  await until(`document.querySelectorAll(".grid .frame").length === ${plan().slides.length}`, "every slide rendered in the grid", 15000);
  // The agent resolves the generate request when it finishes writing; the banner then clears (S13).
  const gen = requests().find((r) => r.kind === "generate");
  execFileSync(process.execPath, [CLI, "studio", "resolve", deckDir, gen.id], { stdio: "ignore" });
  await until(`document.getElementById("queue").hidden`, "writing banner clears when done");
  check("writing banner hides once the generate request is resolved", true);

  // Boceto of a written slide offers the real slide one click away (S7).
  await selectRow(0);
  await until(`document.querySelector('#tools [data-view="wire"]').getAttribute("aria-pressed") === "true"`, "wire view for written slide");
  check(
    "written slide wireframe links to the real slide",
    (await js(`!!document.querySelector(".wire .btn")`)) && (await js(`document.querySelectorAll(".wire-points li").length`)) >= 1,
  );

  // Slide view: comment mode click inside the slide.
  await click('#tools [data-view="slide"]');
  await until(`document.querySelectorAll(".outline .row .th .frame").length >= 2`, "thumbnails kept");
  await until(`!!document.querySelector("#stage .frame.big iframe")`, "large slide frame");
  await sleep(1500);
  await click('#tools [data-mode="comment"]');
  await sleep(300);
  await clickInFrame("#stage .frame.big", 0.45, 0.45);
  await answerDialog("Título más corto");
  await sleep(800);
  const pick = requests().find((r) => r.text === "Título más corto");
  check("editor comment carries selector and excerpt", !!pick && !!pick.selector, pick ? `${pick.selector} | ${pick.excerpt}` : "missing");

  // Layout switch: the select must confirm before firing (S4); cancelling sends nothing.
  const layoutBefore = requests().filter((r) => r.kind === "layout").length;
  await setValue("#layout-select", "steps", "change");
  await js(`document.getElementById("dialog").close(""); true`);
  await sleep(400);
  check("layout select fires nothing when cancelled", requests().filter((r) => r.kind === "layout").length === layoutBefore);
  await setValue("#layout-select", "steps", "change");
  await answerDialog("");
  await sleep(800);
  check("layout select posts a layout request after confirming", requests().some((r) => r.kind === "layout" && r.layout === "steps"));

  // Comments column lists open requests, with the reply column available.
  await click('#comments .tabs [data-tab="all"]');
  await sleep(400);
  const listed = await js(`document.querySelectorAll("#comments .thread .c").length`);
  const expected = requests().length + requests().filter((r) => r.reply).length;
  check("comments column lists every request of the deck", listed === expected && listed >= 2, `${listed} / ${expected}`);
  check(
    "comments column still offers the three tabs",
    (await js(`document.querySelectorAll("#comments .tabs [data-tab]").length`)) === 3,
  );

  // Composer: a comment for the selected slide.
  await setValue("#compose", "Que el ejemplo se vea en pantalla");
  await click("#send");
  await sleep(800);
  check("composer posts a comment for the selected slide", requests().some((r) => r.text === "Que el ejemplo se vea en pantalla"));

  // S14: several comments can be queued and sent to the agent together.
  const openBefore = requests().filter((r) => r.kind === "comment").length;
  await setValue("#compose", "Primer comentario en cola");
  await click("#compose-queue");
  await setValue("#compose", "Segundo comentario en cola");
  await click("#compose-queue");
  await until(`document.getElementById("send-all")?.textContent.includes("2")`, "queue shows two pending comments");
  await click("#send-all");
  await sleep(1200);
  const queuedTexts = requests().filter((r) => r.kind === "comment").slice(openBefore).map((r) => r.text);
  check("queued comments reach the agent together",
    queuedTexts.includes("Primer comentario en cola") && queuedTexts.includes("Segundo comentario en cola"),
    queuedTexts.join(" | "));

  // S15: approve posts the request that tells the agent to deliver and stop the studio.
  await click("#approve");
  await answerDialog("");
  await sleep(600);
  check("approve posts the close request (S15)", requests().some((r) => r.kind === "approve"));

  // S1: a live change must not destroy text being typed in the composer.
  await setValue("#compose", "Borrador a medio escribir");
  await js(`document.getElementById("compose").blur(); true`);
  const resolvable = requests().find((r) => r.kind === "comment" && r.status === "open");
  if (resolvable) execFileSync(process.execPath, [CLI, "studio", "resolve", deckDir, resolvable.id], { stdio: "ignore" });
  await sleep(1500);
  check(
    "live update keeps the composer draft",
    (await js(`document.getElementById("compose").value`)) === "Borrador a medio escribir",
  );

  // Edit text: click the cover bullet, type, Enter -> deck markdown changes for that slide only.
  const deckFile = path.join(deckDir, path.basename(deckDir) + ".md");
  const mdBefore = fs.readFileSync(deckFile, "utf8");
  await click('#tools [data-mode="edit"]');
  await sleep(300);
  // S8a (artboard 05): edit mode shows a floating status badge, dismissible with its ×.
  await until(`!document.getElementById("edit-float").hidden`, "edit mode float badge visible");
  await click("#edit-float .x");
  await until(`!document.getElementById("edit-float")`, "edit float dismissed");
  await click('#tools [data-mode="edit"]');
  await until(`!document.getElementById("edit-float").hidden`, "edit float returns with edit mode");
  await clickInFrame("#stage .frame.big", 0.3, 0.545);
  await sleep(400);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
  await send("Input.insertText", { text: " hoy" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(2000);
  const mdAfter = fs.readFileSync(deckFile, "utf8");
  const changed = mdBefore !== mdAfter;
  check(
    "edit text rewrites only the deck text",
    changed && mdAfter.replace(" hoy", "") === mdBefore,
    changed ? (mdAfter.match(/.*hoy.*/) || [""])[0].trim() : "deck unchanged",
  );

  // S8a (artboard 05): dragging an element in edit mode asks the agent to move it.
  const moveBefore = requests().filter((r) => r.kind === "move").length;
  const frame = await js(`(() => { const r = document.querySelector("#stage .frame.big").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const from = { x: Math.round(frame.x + frame.w * 0.45), y: Math.round(frame.y + frame.h * 0.45) };
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + 30, y: from.y + 40 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + 60, y: from.y + 80 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: from.x + 60, y: from.y + 80, button: "left" });
  await sleep(1200);
  check("drag in edit mode posts a move request", requests().filter((r) => r.kind === "move").length > moveBefore);

  // Skins: the switch persists across reload, and ?skin= overrides on load (S4).
  await click('.skin-switch button[data-skin="flat"]');
  await sleep(300);
  const flatSet = await js(`document.documentElement.dataset.skin === "flat" && localStorage.getItem("gentle-decks.skin") === "flat"`);
  await send("Page.navigate", { url: `${url}#slide` });
  await until(`!!document.querySelector("#comments")`, "reloaded workspace");
  await sleep(600);
  const flatKept = await js(`document.documentElement.dataset.skin === "flat" && document.querySelector('.skin-switch button[data-skin="flat"]').getAttribute("aria-pressed") === "true"`);
  check("skin switch to Flat persists across reload", flatSet && flatKept, `set=${flatSet} kept=${flatKept}`);
  await send("Page.navigate", { url: `${url}?skin=gentle#slide` });
  await until(`!!document.querySelector("#comments")`, "reloaded workspace");
  check("?skin=gentle overrides the stored skin on load", (await js(`document.documentElement.dataset.skin`)) === "gentle");

  // Agent reply (S7/S8): `decks studio reply` shows up in the thread.
  await click('#comments .tabs [data-tab="all"]');
  await sleep(400);
  const target = requests().find((r) => r.kind === "comment" && r.status === "open");
  const replyText = "Usé print(\"Hola, mundo\") y lo anoté en las notas.";
  let replySupported = false;
  let replyOut = "";
  if (target) {
    try {
      replyOut = execFileSync(process.execPath, [CLI, "studio", "reply", deckDir, target.id, replyText], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
      replySupported = /^replied /m.test(replyOut);
    } catch (err) {
      replyOut = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      // Without the reply command the CLI reads "reply" as a deck dir (a parallel worker owns it).
      replySupported = !/plan\.json not found|usage:/.test(replyOut);
    }
  }
  if (!target) {
    check("agent reply appears in the thread", false, "no open comment to answer");
  } else if (!replySupported) {
    results.push(`pending agent reply check — \`decks studio reply\` is not available yet (${replyOut.split("\n")[0]})`);
  } else if (replyOut && !replyOut.startsWith("replied ")) {
    check("agent reply appears in the thread", false, replyOut);
  } else {
    await until(
      `[...document.querySelectorAll("#comments .thread .c.agent")].some((n) => n.textContent.includes(${JSON.stringify(replyText)}))`,
      "agent reply in the thread",
      10000,
    );
    const reply = await js(`[...document.querySelectorAll("#comments .thread .c.agent")].some((n) => n.textContent.includes("Agente"))`);
    check("agent reply appears in the thread", reply);
  }
} catch (err) {
  results.push(`FAIL exception — ${err.message}`);
} finally {
  console.log(results.join("\n"));
  ws.close();
  browser.kill();
  studio.kill();
  stubCanvas?.close();
  setTimeout(() => {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(work, { recursive: true, force: true });
  }, 500);
  setTimeout(() => process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0), 1500);
}
