// Left column: the outline, always visible (S5). Rows select, expand and reorder the plan.
import {
  app,
  applyView,
  ask,
  el,
  notify,
  openComments,
  postRequest,
  render,
  savePlan,
  savePlanSoon,
  slideFrame,
  slidesInOrder,
  writingSlideId,
} from "./studio.js";

const oneLine = (s) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();
const planSlides = () => app.state.plan.slides;
const planIds = () => new Set(planSlides().map((s) => s.id));

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

async function mutate(change, { now = true } = {}) {
  change(app.state.plan);
  if (!now) return savePlanSoon();
  const ok = await savePlan();
  render();
  return ok;
}

export function renderOutline(nav) {
  if (!nav) return;
  const slides = slidesInOrder();
  const plan = app.state.plan;
  const list = el("ol", { className: "rows" });
  slides.forEach((slide, i) => {
    list.append(row(slide, i));
    if (slide.id === app.current && i < slides.length - 1) list.append(gap(i));
  });
  nav.replaceChildren(head(plan), list, foot(slides));
}

function head(plan) {
  const detail = [plan.audience && `Para ${plan.audience}`, plan.goal && `Meta: ${plan.goal}`].filter(Boolean);
  const line = el("p");
  if (!detail.length) line.textContent = "Edita el esquema y genera las diapositivas.";
  detail.forEach((text, i) => {
    if (i) line.append(" · ");
    const b = el("b");
    const [label, ...rest] = text.split(" ");
    b.textContent = label;
    line.append(b, ` ${rest.join(" ")}`);
  });
  return el("div", { className: "o-head" }, el("p", { className: "eyebrow", textContent: "Estructura" }), line);
}

function thumb(slide) {
  const writing = writingSlideId() === slide.id;
  if (slide.status === "pending") {
    const box = el("div", { className: `th pending${writing ? " writing" : ""}` });
    box.setAttribute("aria-hidden", "true");
    return box;
  }
  const wrap = el("div", { className: `th${writing ? " writing" : ""}` });
  wrap.append(slideFrame(slide.id, { title: `Miniatura de ${slide.title}` }));
  return wrap;
}

function statusChip(slide) {
  if (writingSlideId() === slide.id) return el("span", { className: "st w", textContent: "escribiendo…" });
  if (app.overflow.get(slide.id)) return el("span", { className: "st over", textContent: "no cabe" });
  if (slide.status === "ready") return el("span", { className: "st ok", textContent: "lista" });
  if (slide.status === "draft") return el("span", { className: "st w", textContent: "borrador" });
  return el("span", { className: "st p", textContent: "pendiente" });
}

function row(slide, i) {
  const selected = slide.id === app.current;
  const inPlan = i < planSlides().length;
  const total = planSlides().length;
  const li = el("li", { className: "row", tabIndex: 0 });
  li.dataset.slideId = slide.id;
  if (selected) li.setAttribute("aria-current", "true");

  const sub = el("div", { className: "sub" });
  if (slide.layout) sub.append(el("span", { className: "tag", textContent: slide.layout }));
  sub.append(statusChip(slide));
  const comments = openComments(slide.id);
  if (comments) sub.append(el("span", { className: "cm", textContent: `● ${comments}` }));

  const body = el("div");
  if (selected && inPlan) {
    const title = el("input", { className: "edit", value: slide.title, ariaLabel: `Título de la diapositiva ${i + 1}` });
    title.addEventListener("input", () =>
      mutate((p) => {
        const value = oneLine(title.value);
        if (value) p.slides[i].title = value;
      }, { now: false }),
    );
    title.addEventListener("blur", () => {
      if (!oneLine(title.value)) title.value = planSlides()[i].title;
    });
    body.append(title);
  } else {
    body.append(el("h3", { textContent: slide.title }));
  }
  body.append(sub);
  li.append(el("span", { className: "n", textContent: String(i + 1).padStart(2, "0") }), thumb(slide), body);

  if (selected && inPlan) {
    const points = el("textarea", {
      className: "points",
      value: (planSlides()[i].points ?? []).join("\n"),
      rows: Math.max(1, (planSlides()[i].points ?? []).length),
      ariaLabel: `Puntos de la diapositiva ${i + 1}, uno por línea`,
      placeholder: "Puntos, uno por línea",
    });
    points.addEventListener("input", () => {
      points.rows = Math.max(1, points.value.split("\n").length);
      mutate((p) => {
        p.slides[i].points = points.value
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
      }, { now: false });
    });
    const notes = el("input", {
      className: "note",
      value: planSlides()[i].notes ?? "",
      ariaLabel: `Notas para el agente en la diapositiva ${i + 1}`,
      placeholder: "Notas para el agente (opcional)",
    });
    notes.addEventListener("input", () =>
      mutate((p) => {
        if (notes.value.trim()) p.slides[i].notes = notes.value;
        else delete p.slides[i].notes;
      }, { now: false }),
    );
    li.append(points, notes, acts(i, total, slide));
  } else if (selected) {
    li.append(el("p", { className: "note", textContent: "Esta diapositiva no está en plan.json; solo se puede ver." }));
  }

  li.addEventListener("click", (event) => {
    if (event.target.closest("button, input, textarea")) return;
    select(i);
  });
  li.addEventListener("keydown", (event) => onRowKey(event, i, total));
  return li;
}

function acts(i, total, slide) {
  const bar = el("div", { className: "acts" });
  const button = (label, hint, name, fn, disabled = false) => {
    const b = el("button", { type: "button" }, el("kbd", { textContent: hint }), ` ${label}`);
    b.dataset.act = name;
    b.disabled = disabled;
    b.title = `${label} (diapositiva ${i + 1})`;
    b.addEventListener("click", (event) => {
      event.stopPropagation();
      fn();
    });
    return b;
  };
  bar.append(
    el("span", {}, el("kbd", { textContent: "e" }), " editar"),
    button("subir", "↑", "up", () => move(i, -1), i === 0),
    button("bajar", "↓", "down", () => move(i, 1), i === total - 1),
    button("combinar", "m", "merge", () => merge(i), i === total - 1),
    button("comentar", "c", "comment", () => comment(slide)),
    button("añadir", "a", "add", () => addAfter(i)),
    button("borrar", "⌫", "delete", () => remove(i)),
  );
  return bar;
}

// Controls right after the selected row: add a slide there, or merge it with the next one.
function gap(i) {
  const wrap = el("li", { className: "gap" });
  const add = el("button", { type: "button", textContent: "+ añadir" });
  add.dataset.act = "add";
  add.setAttribute("aria-label", `Añadir una diapositiva después de la ${i + 1}`);
  add.addEventListener("click", () => addAfter(i));
  const merge_ = el("button", { type: "button", textContent: "combinar" });
  merge_.dataset.act = "merge";
  merge_.setAttribute("aria-label", `Combinar la diapositiva ${i + 1} con la ${i + 2}`);
  merge_.addEventListener("click", () => merge(i));
  wrap.append(add, merge_);
  return wrap;
}

function foot(slides) {
  const add = el("button", { type: "button", className: "o-add", textContent: "+ añadir diapositiva" });
  add.dataset.act = "add";
  add.addEventListener("click", () => addAfter(planSlides().length - 1));
  return el("div", { className: "o-foot" }, el("span", { textContent: `${slides.length} diapositivas` }), add);
}

// ---------- selection and keyboard (S5) ----------

export function select(i, { focusTitle = false, focusRow = true } = {}) {
  const slide = slidesInOrder()[i];
  if (!slide) return;
  const changed = app.current !== slide.id;
  app.current = slide.id;
  // A written slide opens in the Slide view; a pending one keeps the current view.
  if (slide.status !== "pending" && app.view !== "slide") applyView("slide");
  if (changed || focusTitle) render();
  const box = document.querySelector(`#outline .row[data-slide-id="${CSS.escape(slide.id)}"]`);
  if (focusTitle) box?.querySelector(".edit")?.focus();
  else if (focusRow) box?.focus();
}

function selectRelative(i, step) {
  const next = i + step;
  if (next < 0 || next >= slidesInOrder().length) return;
  select(next);
}

function onRowKey(event, i, total) {
  if (event.metaKey || event.ctrlKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  const key = event.key.toLowerCase();
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select(i);
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const step = event.key === "ArrowUp" ? -1 : 1;
    if (event.altKey) move(i, step);
    else selectRelative(i, step);
  } else if (key === "e") {
    event.preventDefault();
    select(i, { focusTitle: true });
  } else if (key === "m") {
    event.preventDefault();
    merge(i);
  } else if (key === "c") {
    event.preventDefault();
    comment(slidesInOrder()[i]);
  } else if (key === "a") {
    event.preventDefault();
    addAfter(i);
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    remove(i);
  }
}

// ---------- mutations ----------

function move(i, step) {
  const target = i + step;
  const total = planSlides().length;
  if (target < 0) return notify("Ya es la primera diapositiva.", "warn");
  if (target >= total) return notify("Ya es la última diapositiva.", "warn");
  mutate((p) => p.slides.splice(target, 0, ...p.slides.splice(i, 1)));
}

function merge(i) {
  const total = planSlides().length;
  if (i >= total - 1) return notify("No hay una siguiente diapositiva para combinar.", "warn");
  mutate((p) => {
    const [a, b] = [p.slides[i], p.slides[i + 1]];
    a.title = `${a.title} · ${b.title}`;
    a.points = [...(a.points ?? []), ...(b.points ?? [])];
    const notes = [a.notes, b.notes].filter(Boolean).join(" ");
    if (notes) a.notes = notes;
    p.slides.splice(i + 1, 1);
  });
}

async function comment(slide) {
  const text = await ask({ title: `Comentar “${slide.title}”`, hint: "El agente lo aplica a esta diapositiva." });
  if (text) await postRequest({ kind: "comment", slideId: slide.id, text });
}

async function addAfter(i) {
  const title = await ask({ title: "Nueva diapositiva", hint: "Título de la diapositiva nueva.", ok: "Añadir" });
  if (!title) return;
  await mutate((p) => {
    const at = Math.min(i + 1, p.slides.length);
    p.slides.splice(at, 0, { id: newId(title, planIds()), title: oneLine(title), points: [] });
  });
}

async function remove(i) {
  if (planSlides().length === 1) return notify("Un deck necesita al menos una diapositiva.", "warn");
  const slide = slidesInOrder()[i];
  if ((await ask({ title: `¿Borrar “${slide.title}”?`, ok: "Borrar", text: false })) === null) return;
  await mutate((p) => p.slides.splice(i, 1));
}
