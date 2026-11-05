#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, splitSlides, parseSlide, assignIds } from "../src/parse.js";
import { renderDeck } from "../src/render.js";
import { embedImages } from "../src/embed.js";
import { renderDesign, SLIDES_DIR } from "../src/design.js";
import { readPlan, scaffoldDeck } from "../src/plan.js";
import { deckPdf } from "../src/pdf.js";
import { missingSelectors, findTheme, THEME_NAME } from "../src/theme.js";
import { openRequests, readStudioPid, replyProblem, replyToRequest, resolveRequests, studioPaths } from "../src/studio/state.js";
import { startStudio } from "../src/studio/server.js";

const USAGE = [
  "usage: decks <deck.md> (-o <out.html> | --design <dir>) [--theme <name|.css>]",
  "       decks pdf <deck.md> [-o <out.pdf>]",
  "       decks plan check <plan.json>",
  "       decks plan scaffold <plan.json> -o <deck.md>",
  "       decks theme check <name|path.css>",
  "       decks studio <deck-dir> [--port N]",
  "       decks studio stop <deck-dir>",
  "       decks studio requests <deck-dir>",
  "       decks studio reply <deck-dir> <id> <text>",
  "       decks studio resolve <deck-dir> <id...> [--reply <text>]",
].join("\n");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function usage() {
  console.error(USAGE);
  process.exit(2);
}

function flagValue(flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function loadPlan(file) {
  const { plan, problems } = readPlan(fs.readFileSync(file, "utf8"));
  if (problems) {
    for (const p of problems) console.error(`plan.json: ${p}`);
    process.exit(1);
  }
  return plan;
}

function planCommand() {
  const [, sub, file] = args;
  if (!file || file.startsWith("-")) usage();
  if (sub === "check") {
    const plan = loadPlan(file);
    console.log(`ok: ${plan.slides.length} slides`);
    return;
  }
  if (sub !== "scaffold") usage();
  const out = flagValue("-o");
  if (!out) usage();
  const plan = loadPlan(file);
  const target = path.resolve(out);
  if (fs.existsSync(target)) {
    console.error(`refusing to overwrite ${out}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, scaffoldDeck(plan));
  console.log(`${plan.slides.length} slides -> ${target}`);
}

// A deck resolves its theme next to itself first (`<deck dir>/themes/<name>.css`), then in the
// user themes dir, then in the repo (see FORMAT.md, "Themes"). A `.css` path loads as-is: the
// visual workshop iterates on drafts that may not pass the whole contract yet.
function deckTheme(themeName, deckDir) {
  if (/\.css$/i.test(themeName)) return fs.readFileSync(path.resolve(themeName), "utf8");
  if (!THEME_NAME.test(themeName)) throw new Error(`invalid theme name ${JSON.stringify(themeName)}`);
  const theme = findTheme(themeName, deckDir);
  if (!theme) throw new Error(`theme not found: ${themeName}`);
  return theme.css;
}

async function buildCommand() {
  const outFile = flagValue("-o");
  const designDir = flagValue("--design");
  const input = args.find((a, k) => !a.startsWith("-") && !["-o", "--design", "--theme"].includes(args[k - 1]));
  if (!input || (outFile === undefined) === (designDir === undefined) || !(outFile || designDir)) usage();

  const md = fs.readFileSync(input, "utf8");
  const { meta, body } = parseFrontmatter(md);
  const parsed = splitSlides(body).map(parseSlide);

  try {
    const slides = assignIds(parsed);
    const themeCss = deckTheme(flagValue("--theme") || meta.theme || "gentleman-cute", path.dirname(path.resolve(input)));
    if (designDir) {
      const files = renderDesign({ meta, slides }, themeCss);
      const dir = path.resolve(designDir);
      const slidesDir = path.join(dir, SLIDES_DIR);
      fs.mkdirSync(slidesDir, { recursive: true });
      // Drop artboards of slides that no longer exist; keep canvas files (comments.json, screenshots).
      for (const name of fs.readdirSync(slidesDir)) {
        if (name.endsWith(".html") && !files.has(`${SLIDES_DIR}/${name}`)) fs.rmSync(path.join(slidesDir, name));
      }
      for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);
      console.log(`${slides.length} slides -> ${dir}`);
    } else {
      const navJs = fs.readFileSync(path.join(root, "src", "deck-nav.js"), "utf8");
      // Images are embedded, so the single-file export (and its PDF print) is self-contained (S9).
      const html = await embedImages(renderDeck({ meta, slides }, themeCss, navJs), path.dirname(path.resolve(input)));
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(outFile, html);
      console.log(`${slides.length} slides -> ${path.resolve(outFile)}`);
    }
  } catch (err) {
    console.error(`build failed: ${err.message}`);
    process.exit(1);
  }
}

// S4: the PDF prints the same self-contained deck (embedded images, plan order) with headless Chrome.
function pdfCommand() {
  const out = flagValue("-o");
  if (args.indexOf("-o") !== -1 && out === undefined) usage();
  const input = args.find((a, k) => k > 0 && !a.startsWith("-") && args[k - 1] !== "-o");
  if (!input) usage();
  deckPdf({ deck: input, out }).then(
    (file) => console.log(`pdf -> ${file}`),
    (err) => {
      console.error(`pdf: ${err.message}`);
      process.exit(1);
    },
  );
}

function themeCommand() {
  const [, sub, name] = args;
  if (sub !== "check" || !name) usage();
  // `theme check` accepts a theme name or a CSS file path.
  const asPath = /\.css$/i.test(name);
  if (!asPath && !THEME_NAME.test(name)) {
    console.error(`invalid theme name ${JSON.stringify(name)}`);
    process.exit(1);
  }
  // A name resolves like a deck theme without a deck: user themes, then bundled ones.
  const file = asPath ? path.resolve(name) : findTheme(name, null)?.file;
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.error(`theme not found: ${asPath ? name : `themes/${name}.css`}`);
    process.exit(1);
  }
  const missing = missingSelectors(fs.readFileSync(file, "utf8"));
  if (missing.length) {
    console.error(`missing selectors in ${name}: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`ok: ${name}`);
}

function main() {
  if (args[0] === "plan") return planCommand();
  if (args[0] === "theme") return themeCommand();
  if (args[0] === "pdf") return pdfCommand();
  if (args[0] !== "studio") return buildCommand();

  const sub = args[1];
  if (sub !== "stop" && sub !== "requests" && sub !== "resolve" && sub !== "reply") return studioServerCommand(sub);
  const dir = args[2];
  if (!dir || dir.startsWith("-")) usage();
  try {
    if (sub === "stop") {
      // S15: after the user approves, the agent shuts the studio down with this command.
      const pid = readStudioPid(studioPaths(dir));
      if (!pid) {
        console.error(`studio: ${path.join(dir, ".studio-pid")} not found: not running`);
        process.exit(1);
      }
      try {
        process.kill(pid, "SIGTERM");
      } catch (err) {
        console.error(`studio: pid ${pid}: ${err.message}`);
        process.exit(1);
      }
      try {
        fs.unlinkSync(studioPaths(dir).pid);
      } catch {}
      console.log(`studio stopped (pid ${pid})`);
      return;
    }
    if (sub === "requests") {
      console.log(JSON.stringify(openRequests(studioPaths(dir)), null, 2));
      return;
    }
    if (sub === "reply") {
      // `decks studio reply <deck-dir> <id> <text>`: unquoted words after the id join into one reply.
      const id = args[3];
      const text = args.slice(4).join(" ");
      if (!id || id.startsWith("-") || args.length < 5) usage();
      rejectReply(text);
      const { unknown } = replyToRequest(studioPaths(dir), id, text);
      if (unknown) {
        console.error(`unknown request ${unknown}`);
        process.exit(1);
      }
      console.log(`replied ${id}`);
      return;
    }
    const rest = args.slice(3);
    const replyAt = rest.indexOf("--reply");
    const reply = replyAt === -1 ? undefined : rest[replyAt + 1];
    const ids = replyAt === -1 ? rest : rest.filter((_, index) => index !== replyAt && index !== replyAt + 1);
    if (!ids.length || (replyAt !== -1 && reply === undefined)) usage();
    if (reply !== undefined) rejectReply(reply);
    const { unknown } = resolveRequests(studioPaths(dir), ids, { reply });
    if (unknown) {
      console.error(`unknown request ${unknown}`);
      process.exit(1);
    }
    for (const id of ids) console.log(`resolved ${id}`);
  } catch (err) {
    console.error(`studio: ${err.message}`);
    process.exit(1);
  }
}

// S8: an empty or oversized reply fails the command before requests.json is touched.
function rejectReply(text) {
  const problem = replyProblem(text);
  if (!problem) return;
  console.error(problem);
  process.exit(1);
}

function studioServerCommand(dir) {
  if (!dir || dir.startsWith("-")) usage();
  const planFile = path.join(dir, "plan.json");
  if (!fs.existsSync(planFile)) {
    console.error(`studio: ${planFile} not found`);
    process.exit(1);
  }
  const portFlag = flagValue("--port");
  let port = 0;
  if (portFlag !== undefined) {
    port = Number(portFlag);
    if (!Number.isInteger(port) || port < 0 || port > 65535) usage();
  }
  startStudio({ dir, port }).then(
    (studio) => console.log(`studio: ${studio.url}`),
    (err) => {
      console.error(`studio: ${err.message}`);
      process.exit(1);
    },
  );
}

main();
