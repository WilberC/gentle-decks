// Center column: Estilo (themes + generate), Slide (view/comment/edit + layout) and Grid (S6).
import {
  app,
  api,
  ask,
  el,
  loadState,
  notify,
  postRequest,
  render,
  renderAreas,
  savePlan,
  sendMode,
  setView,
  slideFrame,
  slideUrl,
  slidesInOrder,
  LAYOUTS,
  writtenSlides,
} from "./studio.js";

// Theme card labels by source: deck-local proposals, the user's own themes, bundled templates.
const THEME_SOURCE_LABEL = { deck: "propuesto", user: "mío", repo: "plantilla" };

const MODES = [
  ["view", "Ver"],
  ["comment", "Comentar"],
  ["edit", "Editar"],
];

let bigFrame = null;

export function resetCenter() {
  bigFrame = null;
}

export function renderCenter(els, parts = {}) {
  if (parts.tools !== false) renderTools(els.tools);
  if (parts.stage !== false) renderStage(els.stage);
  if (parts.caption !== false) renderCaption(els.caption);
}

// ---------- tools ----------

function segment(label, key, items, current, onPick, { disabled = false } = {}) {
  const seg = el("div", { className: "seg", role: "group", ariaLabel: label });
  for (const [value, text] of items) {
    const b = el("button", { type: "button", textContent: text });
    b.dataset[key] = value;
    b.setAttribute("aria-pressed", String(value === current));
    b.disabled = disabled;
    b.addEventListener("click", () => onPick(value));
    seg.append(b);
  }
  return seg;
}

function renderTools(tools) {
  if (!tools) return;
  tools.replaceChildren();
  tools.append(
    segment("Vista", "view", [["style", "Estilo"], ["slide", "Slide"], ["grid", "Grid"]], app.view, (view) => {
      setView(view);
      tools.querySelector(`[data-view="${view}"]`)?.focus();
    }),
  );
  const slide = writtenSlides().find((s) => s.id === app.current) ?? null;
  if (app.view === "slide") {
    tools.append(
      segment("Modo", "mode", MODES, app.mode, (mode) => setMode(mode), { disabled: !slide }),
      layoutSelect(slide),
    );
  }
  tools.append(el("span", { className: "grow" }));
  tools.append(
    el("span", {
      className: "keys",
      textContent: app.view === "slide" ? "← → cambiar diapositiva" : app.view === "grid" ? "clic para abrir en Slide" : "las vistas previas usan tu estilo",
    }),
  );
}

function setMode(mode) {
  app.mode = mode;
  renderTools(document.getElementById("tools"));
  renderCaption(document.getElementById("caption"));
  sendMode(bigFrame, mode);
}

function layoutSelect(slide) {
  const select = el("select", { id: "layout-select", ariaLabel: "Pedir al agente que reescriba la diapositiva con otro layout" });
  if (!slide?.layout) select.append(new Option("layout: —", ""));
  for (const name of LAYOUTS) select.append(new Option(`layout: ${name}`, name));
  select.value = slide?.layout ?? "";
  select.disabled = !slide;
  select.addEventListener("change", async () => {
    const value = select.value;
    select.value = slide?.layout ?? "";
    if (!value || !slide) return;
    // S4: the select never fires on its own; the dialog states exactly what the agent will do.
    const extra = await ask({
      title: `Reescribir como ${value}`,
      hint: `El agente reescribirá "${slide.title}" con el layout ${value} conservando su contenido. Podés agregar instrucciones (opcional).`,
      ok: "Pedir reescritura",
      required: false,
    });
    if (extra === null) return;
    await postRequest(
      { kind: "layout", slideId: slide.id, layout: value, ...(extra ? { text: extra } : {}) },
      `Pedí al agente que reescriba la diapositiva como ${value}.`,
    );
  });
  return select;
}

// ---------- stage ----------

function renderStage(stage) {
  if (!stage) return;
  stage.replaceChildren();
  stage.className = "stage";
  if (app.view === "style") return renderStyle(stage);
  if (app.view === "grid") {
    stage.classList.add("grid-stage");
    return renderGrid(stage);
  }
  return renderSlide(stage);
}

function empty(text) {
  return el("p", { className: "empty", textContent: text });
}

function renderStyle(stage) {
  const plan = app.state.plan;
  const look = el(
    "section",
    { className: "look" },
    el("h2", { textContent: "Elige el estilo" }),
    el("p", { className: "muted", textContent: "Pide al agente en el chat que proponga más estilos; aparecen aquí como “propuesto”." }),
    themeCards(),
  );
  const n = plan.slides.length;
  const label = app.state.deck?.exists ? "✦ Regenerar pendientes" : `✦ Generar las ${n} diapositivas`;
  const generate = el("button", { type: "button", className: "gen", id: "generate" }, el("span", { textContent: label }), el("kbd", { textContent: "⌘↵" }));
  generate.addEventListener("click", onGenerate);
  look.append(
    el(
      "div",
      { className: "gen-row" },
      generate,
      el("p", { textContent: "Se escriben en orden; cada fila del esquema muestra su miniatura en cuanto está lista." }),
    ),
  );
  stage.append(look);
}

function themeCards() {
  const plan = app.state.plan;
  const current = plan.theme ?? "";
  const wrap = el("div", { className: "themes", role: "group", ariaLabel: "Estilo" });
  const sample = plan.slides.slice(0, 3);
  for (const theme of app.state.themes ?? []) {
    const card = el("button", { type: "button", className: "theme" });
    card.dataset.theme = theme.name;
    card.setAttribute("aria-pressed", String(theme.name === current));
    const shots = el("div", { className: "shots" });
    sample.forEach((slide, k) => {
      const box = slideFrame(slide.id, { theme: theme.name, preview: true, title: `${theme.name}: ${slide.title}` });
      if (k === 0) box.classList.add("main");
      shots.append(box);
    });
    card.append(
      shots,
      el("div", { className: "name" }, el("span", { textContent: theme.name }), el("small", { textContent: THEME_SOURCE_LABEL[theme.source] ?? "plantilla" })),
    );
    card.addEventListener("click", () => chooseTheme(theme.name));
    wrap.append(card);
  }
  if (!app.state.themes?.length) wrap.append(el("p", { className: "muted", textContent: "No hay estilos disponibles." }));
  return wrap;
}

async function chooseTheme(name) {
  app.state.plan.theme = name;
  if (!(await savePlan())) return;
  for (const card of document.querySelectorAll(".theme")) card.setAttribute("aria-pressed", String(card.dataset.theme === name));
}

async function onGenerate() {
  if (!(await savePlan())) return;
  const ok = await postRequest({ kind: "generate" }, "Generación pedida: las diapositivas aparecen a medida que el agente las escribe.");
  if (!ok) return;
  const first = slidesInOrder().find((s) => s.status !== "ready");
  if (first) app.current = first.id;
  setView("grid");
}

function renderSlide(stage) {
  const slide = slidesInOrder().find((s) => s.id === app.current);
  if (!slide) return stage.append(empty("El esquema está vacío."));
  if (slide.status === "pending") {
    return stage.append(
      empty(`“${slide.title}” todavía no está escrita. Genera las diapositivas y aparecerá aquí en cuanto el agente la escriba.`),
    );
  }
  const i = slidesInOrder().findIndex((s) => s.id === slide.id);
  const box = slideFrame(slide.id, { live: true, title: `Diapositiva ${i + 1}: ${slide.title}` });
  box.classList.add("big");
  bigFrame = box.querySelector("iframe");
  bigFrame.addEventListener("load", () => sendMode(bigFrame, app.mode));
  stage.append(box);
}

function renderGrid(stage) {
  const slides = slidesInOrder();
  const grid = el("ol", { className: "grid", ariaLabel: "Todas las diapositivas" });
  slides.forEach((slide, i) => {
    const li = el("li", { className: "tile" });
    if (slide.status === "pending") {
      const ph = el("div", { className: "ph" });
      ph.setAttribute("aria-hidden", "true");
      li.append(ph);
    } else {
      li.append(slideFrame(slide.id, { title: `Diapositiva ${i + 1}: ${slide.title}` }));
    }
    const cap = el("button", { type: "button", className: "tile-cap" });
    cap.disabled = slide.status === "pending";
    cap.setAttribute("aria-label", `Abrir la diapositiva ${i + 1}: ${slide.title}`);
    cap.append(el("b", { textContent: String(i + 1).padStart(2, "0") }), el("span", { className: "t", textContent: slide.title }));
    if (slide.status === "draft") cap.append(el("span", { className: "badge draft", textContent: "borrador" }));
    const over = el("span", { className: "badge overflow", textContent: "no cabe" });
    over.dataset.overflowFor = slide.id;
    over.hidden = !app.overflow.get(slide.id);
    cap.append(over);
    cap.addEventListener("click", () => {
      app.current = slide.id;
      setView("slide");
    });
    li.append(cap);
    grid.append(li);
  });
  stage.append(grid);
}

// ---------- caption ----------

const HINTS = {
  view: ["Ver", "elige Comentar o Editar para trabajar sobre la diapositiva"],
  comment: ["Comentar", "clic en un elemento de la diapositiva"],
  edit: ["Editar", "clic en un texto y escribe · se guarda en el markdown"],
};

export function renderCaption(caption) {
  if (!caption) return;
  caption.replaceChildren();
  const slide = slidesInOrder().find((s) => s.id === app.current);
  const left = el("span");
  if (app.view === "slide") {
    const [label, rest] = HINTS[app.mode] ?? HINTS.view;
    left.append(el("b", { textContent: label }), `: ${rest}`);
  } else if (app.view === "grid") {
    left.textContent = "Todas las diapositivas · clic en una para verla en Slide";
  } else {
    left.textContent = "El esquema siempre queda a la izquierda · e editar · c comentar";
  }
  const right = el("span");
  if (slide && app.overflow.get(slide.id)) {
    const height = app.heights.get(slide.id);
    right.className = "over";
    right.textContent = `${height ?? "?"} / 900 px`;
  } else {
    right.textContent = app.state.plan?.theme ?? "";
  }
  caption.append(left, right);
}

// ---------- artboard messages from the large slide (L4) ----------

export async function onSlideMessage(id, msg, frame) {
  if (frame !== bigFrame) return;
  if (msg.type === "gd:pick" && app.mode === "comment") {
    const excerpt = typeof msg.excerpt === "string" ? msg.excerpt.slice(0, 300) : "";
    const text = await ask({ title: "Comentar", hint: excerpt ? `Sobre: “${excerpt}”` : "Sobre el elemento elegido" });
    if (text) {
      await postRequest({
        kind: "comment",
        slideId: id,
        text,
        selector: String(msg.selector ?? "").slice(0, 500),
        excerpt,
      });
    }
    return;
  }
  if (msg.type !== "gd:edit" || app.mode !== "edit") return;
  const before = String(msg.before ?? "").trim();
  const after = String(msg.after ?? "").trim();
  if (!before || before === after) return;
  const r = await api("PUT", `api/slides/${encodeURIComponent(id)}/text`, { rev: app.state.rev, before, after });
  if (r.ok) {
    app.state.rev = r.data.rev;
    app.savedRev = r.data.rev;
    notify("Texto guardado.");
    await loadState();
    renderAreas();
    // The slide's HTML changed: repaint the large view (the thumbnails were rebuilt above).
    frame.src = slideUrl(id, { version: Date.now().toString(36) });
    return;
  }
  if (r.status === 409 && r.data?.error === "stale") {
    notify("El deck cambió mientras tanto; recargué la diapositiva. Inténtalo de nuevo.", "warn");
    await loadState();
    frame.src = frame.src;
    return;
  }
  const why =
    r.data?.error === "ambiguous"
      ? "Ese texto aparece más de una vez en la diapositiva"
      : "Ese texto no se pudo encontrar en el markdown (puede tener formato)";
  const send = await ask({ title: "¿Enviarlo como comentario?", hint: `${why}. ¿Lo pido al agente?`, value: `Cambiar “${before}” por “${after}”.` });
  frame.src = frame.src;
  if (send) await postRequest({ kind: "comment", slideId: id, text: send, excerpt: before.slice(0, 300) });
}

// ← → walk the written slides while the focus is not in a field.
document.addEventListener("keydown", (event) => {
  if (app.view !== "slide" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, select, .compose, dialog")) return;
  const slides = writtenSlides();
  if (!slides.length) return;
  const at = slides.findIndex((s) => s.id === app.current);
  const step = event.key === "ArrowRight" ? 1 : -1;
  const next = slides[Math.min(Math.max((at < 0 ? 0 : at) + step, 0), slides.length - 1)];
  event.preventDefault();
  app.current = next.id;
  render();
});
