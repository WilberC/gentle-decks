// Editor stage: thumbnails, large view, comment and edit-text modes, agent actions. See S3, S10, S13.
import { app, api, ask, notify, postRequest, slideFrame, slidesInOrder, sendMode, loadState } from "./studio.js";

export const LAYOUTS = ["grid-2", "grid-3", "grid-4", "split", "steps", "card", "term", "bars", "stat", "pills"];

let mode = "view";
let bigFrame = null;

export function renderEditor(root) {
  const slides = slidesInOrder().filter((s) => s.status !== "pending");
  if (!slides.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No slides written yet. Generate from the Plan stage.";
    root.append(p);
    return;
  }
  if (!slides.some((s) => s.id === app.current)) app.current = slides[0].id;
  const index = slides.findIndex((s) => s.id === app.current);
  const slide = slides[index];

  // Thumbnail rail
  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.setAttribute("aria-label", "Slides");
  const list = document.createElement("ol");
  slides.forEach((s, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "thumb";
    if (s.id === app.current) b.setAttribute("aria-current", "true");
    b.setAttribute("aria-label", `Slide ${i + 1}: ${s.title}`);
    b.append(slideFrame(s.id, { title: `Thumbnail ${i + 1}` }));
    const n = document.createElement("span");
    n.className = "thumb-num";
    n.textContent = String(i + 1);
    const over = document.createElement("span");
    over.className = "badge overflow";
    over.textContent = "overflow";
    over.dataset.overflowFor = s.id;
    over.hidden = !app.overflow.get(s.id);
    b.append(n, over);
    b.addEventListener("click", () => select(root, s.id));
    b.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = slides[Math.min(Math.max(i + step, 0), slides.length - 1)];
      select(root, next.id, { focusRail: true });
    });
    li.append(b);
    list.append(li);
  });
  rail.append(list);

  // Toolbar
  const bar = document.createElement("div");
  bar.className = "toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Slide tools");
  const modes = document.createElement("div");
  modes.className = "segmented";
  modes.setAttribute("role", "radiogroup");
  modes.setAttribute("aria-label", "Mode");
  for (const [value, label] of [["view", "View"], ["comment", "💬 Comment"], ["edit", "✎ Edit text"]]) {
    const b = button(label, () => {
      mode = value;
      for (const x of modes.children) x.setAttribute("aria-checked", String(x === b));
      sendMode(bigFrame, mode);
      hint.textContent = HINTS[mode];
    });
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(value === mode));
    modes.append(b);
  }
  const layoutLabel = document.createElement("label");
  layoutLabel.className = "select";
  layoutLabel.textContent = "Layout ";
  const layout = document.createElement("select");
  layout.append(new Option("Change layout…", ""), ...LAYOUTS.map((l) => new Option(l, l)));
  layout.addEventListener("change", async () => {
    const value = layout.value;
    layout.value = "";
    if (value) await postRequest({ kind: "layout", slideId: app.current, layout: value }, `Asked the agent to rebuild this slide as ${value}.`);
  });
  layoutLabel.append(layout);
  const redo = button("✦ Redo with agent", async () => {
    const text = await ask({ title: "Redo this slide", hint: "What should the agent change?" });
    if (text) postRequest({ kind: "redo", slideId: app.current, text });
  });
  const add = button("+ Add slide after", async () => {
    const text = await ask({ title: "Add a slide after this one", hint: "What should the new slide say?", ok: "Add" });
    if (text) postRequest({ kind: "add-slide", slideId: app.current, text });
  });
  bar.append(modes, layoutLabel, redo, add);

  // Large view
  const view = document.createElement("section");
  view.className = "view";
  view.setAttribute("aria-label", `Slide ${index + 1}: ${slide.title}`);
  const big = slideFrame(slide.id, { live: true, title: `Slide ${index + 1}: ${slide.title}` });
  bigFrame = big.querySelector("iframe");
  bigFrame.addEventListener("load", () => sendMode(bigFrame, mode));
  const hint = document.createElement("p");
  hint.className = "muted small hint";
  hint.textContent = HINTS[mode];
  view.append(big, hint);

  // Open requests
  const side = document.createElement("aside");
  side.className = "requests";
  side.setAttribute("aria-label", "Open requests");
  fillRequests(side);

  const main = document.createElement("div");
  main.className = "editor-main";
  main.append(bar, view);
  root.append(rail, main, side);
}

// Refreshes the open-requests panel in place (requests do not change the deck rev).
export function renderRequestsPanel() {
  const side = document.querySelector(".stage-editor .requests");
  if (side) fillRequests(side);
}

function fillRequests(side) {
  side.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = "Open requests";
  side.append(h);
  const reqs = app.state.requests ?? [];
  if (!reqs.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "Nothing pending. Comments, redo and layout requests appear here until the agent resolves them.";
    side.append(p);
    return;
  }
  const ul = document.createElement("ul");
  for (const r of reqs) {
    const li = document.createElement("li");
    const k = document.createElement("b");
    k.textContent = r.kind;
    const where = document.createElement("span");
    where.className = "muted";
    where.textContent = r.slideId ? ` · ${r.slideId}` : "";
    li.append(k, where);
    const detail = r.text || r.layout || r.excerpt;
    if (detail) {
      const p = document.createElement("p");
      p.textContent = detail;
      li.append(p);
    }
    ul.append(li);
  }
  side.append(ul);
}

const HINTS = {
  view: "View mode. Pick Comment to annotate an element, or Edit text to change words in place.",
  comment: "Click any element of the slide to comment on it.",
  edit: "Click a text element, type, then click outside to save.",
};

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn ghost";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function select(root, id, { focusRail = false } = {}) {
  app.current = id;
  root.replaceChildren();
  renderEditor(root);
  if (focusRail) root.querySelector('.thumb[aria-current="true"]')?.focus();
}

// gd:pick and gd:edit from the large view (thumbnails stay in view mode).
export async function onEditorMessage(id, msg, frame) {
  if (frame !== bigFrame) return;
  if (msg.type === "gd:pick" && mode === "comment") {
    const excerpt = typeof msg.excerpt === "string" ? msg.excerpt.slice(0, 300) : "";
    const text = await ask({ title: "Comment", hint: excerpt ? `On: “${excerpt}”` : "On the selected element" });
    if (text) postRequest({ kind: "comment", slideId: id, text, selector: String(msg.selector ?? "").slice(0, 500), excerpt });
    return;
  }
  if (msg.type === "gd:edit" && mode === "edit") {
    const before = String(msg.before ?? "").trim();
    const after = String(msg.after ?? "").trim();
    if (!before || before === after) return;
    const r = await api("PUT", `api/slides/${encodeURIComponent(id)}/text`, { rev: app.state.rev, before, after });
    if (r.ok) {
      app.state.rev = r.data.rev;
      app.savedRev = r.data.rev;
      notify("Text saved.");
      await loadState();
      return;
    }
    if (r.status === 409 && r.data?.error === "stale") {
      notify("The deck changed meanwhile; reloaded. Try the edit again.", "warn");
      await loadState();
      frame.src = frame.src;
      return;
    }
    const why = r.data?.error === "ambiguous" ? "That text appears more than once on this slide" : "That text could not be matched in the slide source (it may contain formatting)";
    const send = await ask({ title: "Send as a comment?", hint: `${why}. Send it to the agent instead?`, value: `Change “${before}” to “${after}”.` });
    frame.src = frame.src;
    if (send) postRequest({ kind: "comment", slideId: id, text: send, excerpt: before.slice(0, 300) });
  }
}
