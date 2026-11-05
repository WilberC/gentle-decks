// Center column: Estilo (themes + generate), Slide (view/comment/edit + layout) and Grid (S6).
import {
  app,
  api,
  ask,
  centerEls,
  el,
  loadState,
  notify,
  postRequest,
  render,
  renderAreas,
  savePlan,
  sendMode,
  setView,
  refresh,
  slideFrame,
  slideUrl,
  slidesInOrder,
  LAYOUTS,
  writtenSlides,
} from "./studio.js";

// Theme card labels by source: deck-local proposals, the user's own themes, bundled templates.
const THEME_SOURCE_LABEL = { deck: "propuesto", user: "mío", repo: "plantilla" };

// S11: the components the theme contract requires, listed as a text-only legend under the preview.
const THEME_COMPONENTS = [
  ["card", "tarjeta con un bloque de contenido"],
  ["step", "paso numerado de una secuencia"],
  ["bars", "barras que comparan valores"],
  ["stat", "cifra destacada con su etiqueta"],
  ["term", "término con su definición"],
  ["pills", "etiquetas cortas en fila"],
  ["figure", "imagen con su leyenda"],
];

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
    segment("Vista", "view", [
      ["style", "Estilo"],
      ["wire", "Boceto"],
      ["slide", "Slide"],
      ["grid", "Grid"],
      ["mine", "Mis estilos"],
    ], app.view, (view) => {
      // S11: picking Estilo returns to the card list, never to a theme opened earlier.
      if (view === "style") app.theme = null;
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
      textContent:
        app.view === "slide" ? "← → cambiar diapositiva"
        : app.view === "grid" ? "clic para abrir en Slide"
        : app.view === "wire" ? "boceto de solo texto, sin estilos ni tokens"
        : app.view === "mine" ? "solo tus estilos: el deck y las plantillas no se tocan"
        : "las vistas previas usan tu estilo",
    }),
  );
}

function setMode(mode) {
  app.mode = mode;
  renderTools(document.getElementById("tools"));
  renderCaption(document.getElementById("caption"));
  renderEditFloat();
  sendMode(bigFrame, mode);
}

// S8a (artboard 05): a floating, dismissible badge states that edit mode is active, so the
// affordances (double-click to edit, drag to move) are never a mystery.
function renderEditFloat() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  document.getElementById("edit-float")?.remove();
  if (app.view !== "slide" || app.mode !== "edit") return;
  const badge = el(
    "div",
    { className: "edit-float", id: "edit-float", role: "status" },
    el("b", { textContent: "✎ edición" }),
    el("span", { className: "hint", textContent: "doble clic edita · arrastrá ⋮⋮ para mover · Esc sale" }),
    el("button", { type: "button", className: "x", textContent: "×", ariaLabel: "Descartar aviso" }),
  );
  badge.querySelector(".x").addEventListener("click", () => badge.remove());
  stage.append(badge);
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
  if (app.view === "mine") return renderMine(stage);
  if (app.view === "wire") return renderWireframe(stage);
  if (app.view === "grid") {
    stage.classList.add("grid-stage");
    return renderGrid(stage);
  }
  return renderSlide(stage);
}

// S7: the wireframe preview shows the slide as plain text from plan.json only — no iframes,
// no theme, no model tokens.
function renderWireframe(stage) {
  const slide = slidesInOrder().find((s) => s.id === app.current);
  if (!slide) return stage.append(empty("El esquema está vacío."));
  const i = slidesInOrder().findIndex((s) => s.id === slide.id);
  const card = el("article", { className: "wire" });
  const head = el("header", { className: "wire-head" }, el("span", { className: "wire-n", textContent: String(i + 1).padStart(2, "0") }), el("h2", { textContent: slide.title }));
  if (slide.layout) head.append(el("span", { className: "tag", textContent: slide.layout }));
  card.append(head);
  const points = slide.points ?? [];
  if (points.length) card.append(el("ul", { className: "wire-points" }, ...points.map((p) => el("li", { textContent: p }))));
  if (slide.notes) card.append(el("p", { className: "wire-notes", textContent: `Notas para el agente: ${slide.notes}` }));
  if (slide.status === "pending") {
    card.append(el("p", { className: "muted", textContent: "Pendiente: se escribirá con tu estilo elegido." }));
  } else {
    const see = el("button", { type: "button", className: "btn", textContent: "Ver la diapositiva real →" });
    see.addEventListener("click", () => setView("slide"));
    card.append(see);
  }
  stage.append(card);
}

function empty(text) {
  return el("p", { className: "empty", textContent: text });
}

function renderStyle(stage) {
  const plan = app.state.plan;
  // S11: the detail is a stage inside Estilo, so the outline, the hash and the comments stay put.
  const opened = (app.state.themes ?? []).find((theme) => theme.name === app.theme);
  if (opened) return renderThemeDetail(stage, opened);
  app.theme = null;
  const propose = el("button", { type: "button", className: "btn propose", id: "propose-style", textContent: "✦ Proponer estilo" });
  propose.title = "Pedir al agente un estilo nuevo para este deck";
  propose.addEventListener("click", onProposeStyle);
  // S1: the same request, but from an image or PDF the agent reads before writing the CSS.
  const attach = el("button", { type: "button", className: "btn attach", id: "propose-reference", textContent: "📎 con referencia" });
  attach.title = "Adjuntar una imagen o un PDF: el agente lo mira y propone el estilo a partir de él";
  attach.addEventListener("click", onProposeStyleFromReference);
  const look = el(
    "section",
    { className: "look" },
    el("div", { className: "look-head" }, el("h2", { textContent: "Elige el estilo" }), el("div", { className: "look-acts" }, attach, propose)),
    el("p", {
      className: "muted",
      textContent:
        "Clic en un estilo para verlo en grande, comentarlo o mejorarlo; “✦ Proponer estilo” pide uno nuevo al agente y “📎 con referencia” parte de una imagen o un PDF.",
    }),
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

// S10: the button states what the agent will do before firing, and the instructions are optional.
async function onProposeStyle() {
  const extra = await ask({
    title: "Proponer un estilo",
    hint: "El agente propondrá un estilo nuevo para este deck y lo guardará en themes/ del deck. Podés describir el look que buscás (opcional).",
    ok: "Pedir estilo",
    required: false,
  });
  if (extra === null) return;
  await postRequest(
    { kind: "propose-style", mode: "new", ...(extra ? { text: extra } : {}) },
    "Pedí al agente que proponga un estilo nuevo.",
  );
}

// ---------- referencia de estilo (S1, S2) ----------

// Only files the agent can look at (images) or read (PDF); the server keeps its own whitelist.
const REFERENCE_ACCEPT = "image/*,.pdf";

let refInput = null;
let refPick = null;

// The hidden picker is created once and reused; `change`/`cancel` resolve whatever click() waits on.
function pickReferenceFile() {
  if (!refInput) {
    const settle = (file) => {
      const resolve = refPick;
      refPick = null;
      resolve?.(file);
    };
    refInput = el("input", { type: "file", accept: REFERENCE_ACCEPT, id: "reference-file", hidden: true });
    refInput.addEventListener("change", () => {
      const file = refInput.files?.[0] ?? null;
      refInput.value = "";
      settle(file);
    });
    // Dismissing the picker resolves with null, so the action never stays waiting for a file.
    refInput.addEventListener("cancel", () => settle(null));
    document.body.append(refInput);
  }
  return new Promise((resolve) => {
    refPick = resolve;
    refInput.click();
  });
}

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Uploads the picked file and returns its deck-relative path, or null when the user cancelled or the
// upload failed (a failure is reported through the usual notice).
async function uploadReference() {
  const file = await pickReferenceFile();
  if (!file) return null;
  let data;
  try {
    data = await readBase64(file);
  } catch {
    notify(`No se pudo leer ${file.name}.`, "error");
    return null;
  }
  const r = await api("POST", "api/references", { name: file.name, data });
  if (r.ok) return r.data.reference;
  const why = r.status === 413 ? "es demasiado grande (máximo ~9 MB)" : (r.data?.error ?? r.status);
  const detail = r.data?.message ?? (r.data?.problems ?? []).join("; ");
  notify(`No se pudo subir ${file.name}: ${why}${detail ? ` — ${detail}` : ""}`, "error");
  return null;
}

const referenceName = (reference) => String(reference).split("/").pop();

// S1: upload first, then the same optional instructions, and the reference travels with the request.
async function onProposeStyleFromReference() {
  const reference = await uploadReference();
  if (!reference) return;
  const extra = await ask({
    title: "Proponer un estilo desde una referencia",
    hint: `El agente mirará ${referenceName(reference)} (paleta, tipografía y carácter) y propondrá un estilo nuevo para este deck. Podés describir el look que buscás (opcional).`,
    ok: "Pedir estilo",
    required: false,
  });
  if (extra === null) return;
  await postRequest(
    { kind: "propose-style", mode: "new", reference, ...(extra ? { text: extra } : {}) },
    "Pedí al agente que proponga un estilo a partir de la referencia.",
  );
}

// S11: a theme gets a detail stage: big preview, the component contract, and its own actions.
function renderThemeDetail(stage, theme) {
  const chosen = app.state.plan?.theme === theme.name;
  const back = el("button", { type: "button", className: "btn", id: "theme-back", textContent: "← Volver a los estilos" });
  back.addEventListener("click", () => {
    app.theme = null;
    renderCenter(centerEls());
  });
  const head = el(
    "header",
    { className: "head" },
    el("h2", { textContent: theme.name }),
    el("small", { textContent: THEME_SOURCE_LABEL[theme.source] ?? "plantilla" }),
  );
  if (chosen) head.append(el("span", { className: "tag", textContent: "elegido" }));
  head.append(back);

  // The deck's first slides, rendered with this theme: the same artboards, one ?theme away.
  const preview = el("div", { className: "preview" });
  const sample = app.state.plan.slides.slice(0, 2);
  if (!sample.length) {
    preview.append(el("p", { className: "muted", textContent: "El esquema está vacío: agrega diapositivas para verlas con este estilo." }));
  }
  sample.forEach((slide) => preview.append(slideFrame(slide.id, { theme: theme.name, preview: true, title: `${theme.name}: ${slide.title}` })));

  // S11: the components the theme must style, as a compact text legend (no iframes).
  const components = el("ul", { className: "components", ariaLabel: "Componentes que este estilo debe vestir" });
  for (const [name, what] of THEME_COMPONENTS) {
    components.append(el("li", {}, el("code", { textContent: name }), el("span", { textContent: what })));
  }

  const choose = el("button", { type: "button", className: "btn primary", id: "theme-choose", textContent: "Elegir este estilo" });
  choose.addEventListener("click", () => chooseTheme(theme.name));
  const comment = el("button", { type: "button", className: "btn", id: "theme-comment", textContent: "Comentar este estilo" });
  comment.addEventListener("click", () => onThemeComment(theme));
  const improve = el("button", { type: "button", className: "btn", id: "theme-improve", textContent: "Mejorar este estilo" });
  improve.addEventListener("click", () => onThemeImprove(theme));
  // S2: the same improvement, aimed at an image or PDF the agent reads before editing the CSS.
  const improveRef = el("button", { type: "button", className: "btn", id: "theme-improve-reference", textContent: "📎 Mejorar con referencia" });
  improveRef.title = "Adjuntar una imagen o un PDF y acercar este estilo a lo que muestra";
  improveRef.addEventListener("click", () => onThemeImproveFromReference(theme));

  stage.append(
    el(
      "section",
      { className: "theme-detail" },
      head,
      preview,
      el("h3", { textContent: "Componentes que viste el estilo" }),
      components,
      el("div", { className: "acts" }, choose, comment, improve, improveRef),
      el("p", {
        className: "muted note",
        textContent:
          "Comentar y mejorar piden al agente que edite el CSS de este estilo; con una referencia adjunta además la lee antes de escribir. El estilo elegido se sigue aplicando a todo el deck.",
      }),
    ),
  );
}

async function onThemeComment(theme) {
  const text = await ask({
    title: `Comentar el estilo ${theme.name}`,
    hint: "¿Qué querés cambiar o revisar de este estilo? El agente lo edita y te responde.",
    ok: "Pedir cambio",
  });
  if (!text) return;
  await postRequest(
    { kind: "propose-style", mode: "comment", theme: theme.name, text },
    `Pedí al agente que revise el estilo ${theme.name}.`,
  );
}

async function onThemeImprove(theme) {
  const extra = await ask({
    title: `Mejorar ${theme.name}`,
    hint: "El agente ajustará este estilo siguiendo tus indicaciones. Podés dejarlo vacío y propondrá las mejoras por su cuenta.",
    ok: "Pedir mejora",
    required: false,
  });
  if (extra === null) return;
  await postRequest(
    { kind: "propose-style", mode: "improve", theme: theme.name, ...(extra ? { text: extra } : {}) },
    `Pedí al agente que mejore el estilo ${theme.name}.`,
  );
}

// S2: improve the theme towards a reference the agent reads before it edits the CSS.
async function onThemeImproveFromReference(theme) {
  const reference = await uploadReference();
  if (!reference) return;
  const extra = await ask({
    title: `Mejorar ${theme.name} con una referencia`,
    hint: `El agente mirará ${referenceName(reference)} (paleta, tipografía y jerarquía) y ajustará el CSS de ${theme.name} para acercarlo a esa referencia. Podés agregar instrucciones (opcional).`,
    ok: "Pedir mejora",
    required: false,
  });
  if (extra === null) return;
  await postRequest(
    { kind: "propose-style", mode: "improve", theme: theme.name, reference, ...(extra ? { text: extra } : {}) },
    `Pedí al agente que mejore el estilo ${theme.name} con una referencia.`,
  );
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
    card.addEventListener("click", () => {
      // S11: the card opens the theme detail instead of silently choosing.
      app.theme = theme.name;
      renderCenter(centerEls());
    });
    wrap.append(card);
  }
  if (!app.state.themes?.length) wrap.append(el("p", { className: "muted", textContent: "No hay estilos disponibles." }));
  return wrap;
}

async function chooseTheme(name) {
  app.state.plan.theme = name;
  if (!(await savePlan())) return false;
  for (const card of document.querySelectorAll(".theme")) card.setAttribute("aria-pressed", String(card.dataset.theme === name));
  // The detail shows whether this theme is the chosen one; rebuild it in place.
  if (app.theme) renderCenter(centerEls());
  return true;
}

// ---------- Mis estilos (S3): the user's own themes ----------

// S3: name, the outline rendered with that theme, and the source label, the same card shape the
// Estilo list uses. An <article> instead of a <button>, because a card here carries actions.
function themeCardShell(name, label, sample) {
  const card = el("article", { className: "theme" });
  card.dataset.theme = name;
  const shots = el("div", { className: "shots" });
  sample.forEach((slide, k) => {
    const box = slideFrame(slide.id, { theme: name, preview: true, title: `${name}: ${slide.title}` });
    if (k === 0) box.classList.add("main");
    shots.append(box);
  });
  if (!sample.length) shots.append(el("p", { className: "muted", textContent: "El esquema está vacío: agrega diapositivas para ver el estilo." }));
  const row = el("div", { className: "name" }, el("span", { textContent: name }), el("small", { textContent: label }));
  if (app.state.plan?.theme === name) row.append(el("span", { className: "tag", textContent: "elegido" }));
  card.append(shots, row);
  return card;
}

// S3: the user's themes come from api/state `mine`, not from the deduped theme list: a deck theme
// with the same name shadows it in the lookup, yet the user's copy is still there to choose or delete.
function renderMine(stage) {
  const plan = app.state.plan;
  const sample = plan.slides.slice(0, 1);
  const mine = app.state.mine ?? [];
  const deck = (app.state.themes ?? []).filter((theme) => theme.source === "deck");
  const section = el(
    "section",
    { className: "look mine" },
    el("div", { className: "look-head" }, el("h2", { textContent: "Mis estilos" })),
    el("p", {
      className: "muted",
      textContent:
        "Tus estilos viven en tu carpeta de temas y aparecen en todos los decks; las plantillas incluidas son de solo lectura.",
    }),
    mineList(sample, mine),
  );
  if (deck.length) {
    section.append(
      el("div", { className: "look-head" }, el("h2", { textContent: "Propuestos por este deck" })),
      el("p", {
        className: "muted",
        textContent: "Guardalos como tuyos para que sigan disponibles cuando el deck termine.",
      }),
      deckList(sample, deck),
    );
  }
  stage.append(section);
}

function mineList(sample, mine) {
  const list = el("div", { className: "themes", role: "group", ariaLabel: "Mis estilos" });
  if (!mine.length) {
    list.append(
      el("p", {
        className: "muted mine-empty",
        id: "mine-empty",
        textContent:
          "Todavía no guardaste ningún estilo: pedí uno con “✦ Proponer estilo” y, cuando el agente lo escriba, guardalo con “Guardar como mío”.",
      }),
    );
    return list;
  }
  for (const name of mine) {
    const card = themeCardShell(name, THEME_SOURCE_LABEL.user, sample);
    card.classList.add("mine-card");
    const choose = el("button", { type: "button", className: "btn", id: `mine-choose-${name}`, textContent: "Elegir" });
    choose.addEventListener("click", async () => {
      if (await chooseTheme(name)) renderCenter(centerEls());
    });
    const remove = el("button", { type: "button", className: "btn danger", id: `mine-delete-${name}`, textContent: "Borrar" });
    remove.title = `Borrar tu copia de ${name}`;
    remove.addEventListener("click", () => onDeleteMine(name));
    card.append(el("div", { className: "mine-acts" }, choose, remove));
    list.append(card);
  }
  return list;
}

function deckList(sample, deck) {
  const list = el("div", { className: "themes", role: "group", ariaLabel: "Estilos propuestos por este deck" });
  for (const theme of deck) {
    const card = themeCardShell(theme.name, THEME_SOURCE_LABEL.deck, sample);
    card.classList.add("deck-card");
    const keep = el("button", { type: "button", className: "btn", id: `mine-promote-${theme.name}`, textContent: "Guardar como mío" });
    keep.title = `Copiar ${theme.name} a tu carpeta de temas`;
    keep.addEventListener("click", () => onPromoteMine(theme.name));
    card.append(el("div", { className: "mine-acts" }, keep));
    list.append(card);
  }
  return list;
}

// S3: only a deck-proposed theme can be saved; the server copies it and answers 404 for the rest.
async function onPromoteMine(name) {
  const r = await api("POST", "api/themes/promote", { theme: name });
  if (!r.ok) {
    notify(`No se pudo guardar ${name}: ${r.data?.error ?? r.status}`, "error");
    return;
  }
  notify(`Guardé ${name} en tus estilos: ahora aparece en todos tus decks.`);
  await refresh();
}

// S3: deleting the chosen style leaves plan.theme pointing at a missing file, so the confirm says
// the previews stop resolving until another style is chosen. The deck and bundles are never touched.
async function onDeleteMine(name) {
  const chosen = app.state.plan?.theme === name;
  const ok = await ask({
    title: `Borrar ${name}`,
    hint: chosen
      ? "Es el estilo elegido del deck: las vistas previas dejarán de resolverse hasta que elijas otro estilo. Se borra solo tu copia; el deck y las plantillas no se tocan."
      : "Se borra tu copia de este estilo; el deck y las plantillas no se tocan.",
    ok: "Borrar",
    text: false,
  });
  if (ok === null) return;
  const r = await api("DELETE", `api/themes/mine/${encodeURIComponent(name)}`, {});
  if (!r.ok) {
    notify(`No se pudo borrar ${name}: ${r.data?.error ?? r.status}`, "error");
    return;
  }
  notify(`Borré ${name} de tus estilos.`);
  await refresh();
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
  renderEditFloat();
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
  edit: ["Editar", "doble clic en un texto y escribe · arrastrá para pedir un movimiento · se guarda en el markdown"],
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
  } else if (app.view === "wire") {
    left.textContent = "Boceto: título y puntos tal como se generará, solo texto";
  } else if (app.view === "mine") {
    left.textContent = "Mis estilos: guardar y borrar trabajan solo sobre tu carpeta de temas";
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
  // S8a (artboard 05): a drag in edit mode asks the agent to move the element; the drag is
  // already deliberate, so the request posts straight away with its selector and excerpt.
  if (msg.type === "gd:move" && app.mode === "edit") {
    await postRequest({
      kind: "move",
      slideId: id,
      selector: String(msg.selector ?? "").slice(0, 500),
      excerpt: typeof msg.excerpt === "string" ? msg.excerpt.slice(0, 160) : "",
    }, "Pedí al agente que mueva ese elemento.");
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

// ← → walk the written slides while the focus is not in a field; Esc leaves edit mode.
document.addEventListener("keydown", (event) => {
  if (app.view === "slide" && event.key === "Escape" && app.mode !== "view") {
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, dialog")) return;
    event.preventDefault();
    setMode("view");
    return;
  }
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
