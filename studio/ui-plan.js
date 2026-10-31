// Plan stage: editable outline (left) and look and feel (right). See S7, S13.
import { app, savePlan, savePlanSoon, postRequest, ask, notify, slideFrame, setStage } from "./studio.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

// Kebab-case id from a title, unique within the plan; ids must match ^[a-z][a-z0-9-]*$.
export function newId(title, taken) {
  const base =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^[^a-z]+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "slide";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

const ids = () => new Set(app.state.plan.slides.map((s) => s.id));
const oneLine = (s) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

async function mutate(change, { now = true } = {}) {
  change(app.state.plan);
  if (now) {
    await savePlan();
    renderPlanInto();
  } else {
    savePlanSoon();
  }
}

let root = null;
export function renderPlan(target) {
  root = target;
  renderPlanInto();
}

function renderPlanInto() {
  const plan = app.state.plan;
  const outline = el("section", { className: "outline", ariaLabel: "Outline" }, el("h2", { textContent: "Outline" }));
  const list = el("ol", { className: "cards" });
  plan.slides.forEach((slide, i) => {
    list.append(card(slide, i));
    if (i < plan.slides.length - 1) list.append(gap(i));
  });
  list.append(gap(plan.slides.length - 1, { last: true }));
  outline.append(list);

  const look = el("aside", { className: "look", ariaLabel: "Look and feel" }, el("h2", { textContent: "Look and feel" }));
  look.append(themeCards());

  const generate = el("button", { type: "button", className: "btn primary big", textContent: app.state.deck?.exists ? "✦ Regenerate pending slides" : "✦ Generate" });
  generate.addEventListener("click", async () => {
    if (!(await savePlan())) return;
    if (await postRequest({ kind: "generate" }, "Generation requested. Slides appear here as the agent writes them.")) setStage("grid");
  });

  const head = el(
    "div",
    { className: "plan-head" },
    el("h1", { textContent: "Review the plan" }),
    el("p", {
      className: "muted",
      textContent: [plan.audience && `For ${plan.audience}`, plan.goal && `Goal: ${plan.goal}`].filter(Boolean).join(" · ") || "Edit the outline, then generate.",
    }),
  );
  root.replaceChildren(head, el("div", { className: "plan-cols" }, outline, look), el("div", { className: "plan-foot" }, generate));
}

function card(slide, i) {
  const plan = app.state.plan;
  const li = el("li", { className: "card", draggable: true });
  li.dataset.index = String(i);

  const title = el("input", { className: "title", value: slide.title, ariaLabel: `Slide ${i + 1} title` });
  title.addEventListener("input", () => mutate((p) => (p.slides[i].title = oneLine(title.value) || slide.title), { now: false }));

  const points = el("textarea", { className: "points", value: (slide.points ?? []).join("\n"), rows: Math.max(1, (slide.points ?? []).length), ariaLabel: `Slide ${i + 1} points, one per line`, placeholder: "Points, one per line" });
  points.addEventListener("input", () => {
    points.rows = Math.max(1, points.value.split("\n").length);
    mutate((p) => (p.slides[i].points = points.value.split("\n").map((x) => x.trim()).filter(Boolean)), { now: false });
  });

  const notes = el("input", { className: "notes", value: slide.notes ?? "", ariaLabel: `Slide ${i + 1} notes for the agent`, placeholder: "Notes for the agent (optional)" });
  notes.addEventListener("input", () => mutate((p) => {
    if (notes.value.trim()) p.slides[i].notes = notes.value;
    else delete p.slides[i].notes;
  }, { now: false }));

  const menu = el("div", { className: "card-menu" });
  const action = (label, text, fn, disabled = false) => {
    const b = el("button", { type: "button", className: "icon-btn", textContent: text, title: label, ariaLabel: `${label} (slide ${i + 1})`, disabled });
    b.addEventListener("click", fn);
    menu.append(b);
  };
  action("Move up", "↑", () => mutate((p) => p.slides.splice(i - 1, 0, ...p.slides.splice(i, 1))), i === 0);
  action("Move down", "↓", () => mutate((p) => p.slides.splice(i + 1, 0, ...p.slides.splice(i, 1))), i === plan.slides.length - 1);
  action("Comment", "💬", async () => {
    const text = await ask({ title: `Comment on “${slide.title}”`, hint: "The agent applies it to this slide." });
    if (text) postRequest({ kind: "comment", slideId: slide.id, text });
  });
  action("Delete", "✕", async () => {
    if (plan.slides.length === 1) return notify("A deck needs at least one slide.", "warn");
    if ((await ask({ title: `Delete “${slide.title}”?`, ok: "Delete", text: false })) === null) return;
    mutate((p) => p.slides.splice(i, 1));
  });

  const layout = slide.layout ? el("span", { className: "chip", textContent: slide.layout }) : null;
  li.append(el("span", { className: "num", textContent: String(i + 1) }), el("div", { className: "body" }, title, points, notes), el("div", { className: "side" }, layout, menu));

  // Drag to reorder (buttons above are the keyboard path).
  li.addEventListener("dragstart", (e) => {
    if (e.target !== li) return;
    e.dataTransfer.setData("text/plain", String(i));
    li.classList.add("dragging");
  });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    li.classList.add("drop");
  });
  li.addEventListener("dragleave", () => li.classList.remove("drop"));
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    li.classList.remove("drop");
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isInteger(from) && from !== i) mutate((p) => p.slides.splice(i, 0, ...p.slides.splice(from, 1)));
  });
  for (const field of [title, points, notes]) {
    field.addEventListener("focus", () => (li.draggable = false));
    field.addEventListener("blur", () => (li.draggable = true));
  }
  return li;
}

// Controls between card i and i+1: add a slide there, or merge the two.
function gap(i, { last = false } = {}) {
  const li = el("li", { className: "gap" });
  const add = el("button", { type: "button", className: "pill-btn", textContent: "+ Add slide", ariaLabel: `Add slide after slide ${i + 1}` });
  add.addEventListener("click", async () => {
    const title = await ask({ title: "New slide", hint: "Title of the new slide.", ok: "Add" });
    if (!title) return;
    mutate((p) => p.slides.splice(i + 1, 0, { id: newId(title, ids()), title: oneLine(title), points: [] }));
  });
  li.append(add);
  if (!last) {
    const merge = el("button", { type: "button", className: "pill-btn", textContent: "Merge", ariaLabel: `Merge slide ${i + 1} with slide ${i + 2}` });
    merge.addEventListener("click", () =>
      mutate((p) => {
        const [a, b] = [p.slides[i], p.slides[i + 1]];
        a.title = `${a.title} · ${b.title}`;
        a.points = [...(a.points ?? []), ...(b.points ?? [])];
        const notes = [a.notes, b.notes].filter(Boolean).join(" ");
        if (notes) a.notes = notes;
        p.slides.splice(i + 1, 1);
      }),
    );
    li.append(merge);
  }
  return li;
}

function themeCards() {
  const plan = app.state.plan;
  const current = plan.theme || "gentleman-cute";
  const wrap = el("div", { className: "themes", role: "radiogroup", ariaLabel: "Theme" });
  const sample = [plan.slides[0], ...plan.slides.slice(1, 3)].filter(Boolean);
  for (const theme of app.state.themes ?? []) {
    const selected = theme.name === current;
    const b = el("button", { type: "button", className: `theme${selected ? " selected" : ""}`, role: "radio", ariaChecked: String(selected) });
    const shots = el("div", { className: "shots" });
    sample.forEach((s, k) => {
      const f = slideFrame(s.id, { theme: theme.name, title: `${theme.name} preview of ${s.title}` });
      if (k === 0) f.classList.add("main");
      shots.append(f);
    });
    b.append(shots, el("span", { className: "theme-name", textContent: theme.name }), el("span", { className: "chip", textContent: theme.source === "deck" ? "proposed" : "template" }));
    b.addEventListener("click", () => mutate((p) => (p.theme = theme.name)));
    wrap.append(b);
  }
  if (!app.state.themes?.length) wrap.append(el("p", { className: "muted", textContent: "No themes found." }));
  wrap.append(el("p", { className: "muted small", textContent: "Ask the agent in chat to propose more themes; they appear here as “proposed”." }));
  return wrap;
}
