// Studio workspace shell: slide frames, live updates, rendering, routing glue, skins and header.
// State and the API client live in ui-core.js; the three columns live in ws-*.js.
import {
  SLIDE_W,
  app,
  applyView,
  ask,
  centerEls,
  el,
  loadState,
  notify,
  postRequest,
  viewFromHash,
} from "./ui-core.js";
import { renderOutline } from "./ws-outline.js";
import { renderCenter, renderCaption, onSlideMessage, resetCenter } from "./ws-center.js";
import { renderComments } from "./ws-comments.js";

export * from "./ui-core.js";

const outlineEl = () => document.getElementById("outline");
const sideEl = () => document.getElementById("comments");

// ---------- slide frames ----------

const scaler = new ResizeObserver((entries) => {
  for (const e of entries) e.target.style.setProperty("--s", String(e.contentRect.width / SLIDE_W));
});

export function slideUrl(id, { theme, version } = {}) {
  const q = new URLSearchParams();
  if (theme) q.set("theme", theme);
  if (version) q.set("v", version);
  const qs = q.toString();
  return `slides/${encodeURIComponent(id)}.html${qs ? `?${qs}` : ""}`;
}

// A 16:9 box with the slide artboard scaled to its width.
export function slideFrame(id, { theme, version, live = false, title, preview = false } = {}) {
  const box = el("div", { className: `frame${live ? " live" : ""}` });
  box.dataset.slideId = id;
  if (preview) box.dataset.preview = "1";
  const frame = el("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("tabindex", live ? "0" : "-1");
  frame.title = title ?? `Diapositiva ${id}`;
  frame.loading = live ? "eager" : "lazy";
  frame.src = slideUrl(id, { theme, version });
  box.append(frame);
  scaler.observe(box);
  if (app.overflow.get(id)) box.classList.add("overflow");
  return box;
}

export function sendMode(frame, mode) {
  frame?.contentWindow?.postMessage({ type: "gd:mode", mode }, "*");
}

// Messages are trusted only when they come from one of our own sandboxed iframes (L4).
window.addEventListener("message", (event) => {
  const frame = [...document.querySelectorAll("iframe")].find((f) => f.contentWindow === event.source);
  const msg = event.data;
  if (!frame || !msg || typeof msg !== "object" || typeof msg.type !== "string") return;
  const box = frame.closest("[data-slide-id]");
  const id = box?.dataset.slideId;
  if (!id || (msg.slideId && msg.slideId !== id)) return;
  if (msg.type === "gd:ready") return onReady(id, msg, frame, box);
  onSlideMessage(id, msg, frame);
});

function onReady(id, msg, frame, box) {
  // Theme previews of an unwritten plan are not the deck: ignore their size and overflow.
  if (new URL(frame.src, location.href).searchParams.has("theme")) return;
  const over = msg.overflow === true;
  app.overflow.set(id, over);
  if (Number.isFinite(msg.height)) app.heights.set(id, msg.height);
  for (const other of document.querySelectorAll(`.frame[data-slide-id="${CSS.escape(id)}"]`)) other.classList.toggle("overflow", over);
  for (const badge of document.querySelectorAll(`[data-overflow-for="${CSS.escape(id)}"]`)) badge.hidden = !over;
  if (box?.closest("#stage")) renderCaption(centerEls().caption);
  const written = app.state?.deck?.slides?.some((s) => s.id === id && s.status !== "pending");
  const open = app.state?.requests?.some((r) => r.kind === "overflow" && r.slideId === id);
  if (over && written && !open && !app.overflowSent.has(id)) {
    app.overflowSent.add(id);
    postRequest({ kind: "overflow", slideId: id }, `La diapositiva "${id}" no cabe; pedí al agente que la ajuste.`);
  }
}

// ---------- slides and selection ----------

export function slidesInOrder() {
  const st = app.state;
  const deck = new Map((st.deck?.slides ?? []).map((s) => [s.id, s]));
  const planIds = new Set(st.plan.slides.map((s) => s.id));
  const list = st.plan.slides.map((s) => ({
    id: s.id,
    title: s.title,
    layout: s.layout,
    points: s.points ?? [],
    notes: s.notes,
    status: deck.get(s.id)?.status ?? "pending",
  }));
  for (const s of st.deck?.slides ?? []) if (!planIds.has(s.id)) list.push({ id: s.id, title: s.title, status: s.status });
  return list;
}

export function writtenSlides() {
  return slidesInOrder().filter((s) => s.status !== "pending");
}

export function selectedSlide() {
  return slidesInOrder().find((s) => s.id === app.current) ?? null;
}

// Keeps the selection inside the deck: the first written slide, else the first one.
function syncSelection() {
  const list = slidesInOrder();
  if (list.some((s) => s.id === app.current)) return;
  app.current = (list.find((s) => s.status !== "pending") ?? list[0])?.id ?? null;
}

// S5: "escribiendo…" = the first plan slide not ready while an open generate request exists.
export function writingSlideId() {
  const open = app.state?.requests?.some((r) => r.kind === "generate");
  if (!open) return null;
  return slidesInOrder().find((s) => s.status !== "ready")?.id ?? null;
}

export function openComments(slideId) {
  return (app.state?.requests ?? []).filter((r) => r.kind === "comment" && r.slideId === slideId).length;
}

// ---------- views (S3) ----------

// Re-renders the center only, so the outline keeps its scroll position.
export function setView(view) {
  applyView(view);
  renderCenter(centerEls());
}

window.addEventListener("hashchange", () => {
  const view = viewFromHash();
  if (view && view !== app.view) {
    applyView(view);
    renderCenter(centerEls());
  }
});

// ---------- rendering ----------

export function renderHeader() {
  const st = app.state;
  if (!st) return;
  const slides = slidesInOrder();
  const written = slides.filter((s) => s.status === "ready").length;
  document.getElementById("deck-title").textContent = st.plan?.title ?? "studio";
  const where = st.slug ? `decks/${st.slug}` : "";
  document.getElementById("deck-path").textContent = [where, st.plan?.theme].filter(Boolean).join(" · ");
  const pct = slides.length ? Math.round((written / slides.length) * 100) : 0;
  const progress = document.getElementById("progress");
  progress.setAttribute("aria-valuenow", String(pct));
  progress.setAttribute("aria-valuetext", `${written} de ${slides.length} escritas`);
  progress.querySelector("i").style.width = `${pct}%`;
  document.getElementById("written").textContent = `${written} / ${slides.length} escritas`;
  document.getElementById("present").hidden = !st.deck?.exists;
  const redo = document.getElementById("redo");
  const selected = selectedSlide();
  redo.disabled = !selected || selected.status === "pending";
  redo.title = redo.disabled ? "Elige una diapositiva escrita para rehacerla" : `Rehacer “${selected.title}”`;
}

export function renderStatus() {
  if (!app.state) return;
  const slides = slidesInOrder();
  const written = slides.filter((s) => s.status === "ready").length;
  const writing = writingSlideId();
  const agent = document.getElementById("status-agent");
  agent.textContent = writing
    ? `● agente escribiendo ${slides.findIndex((s) => s.id === writing) + 1}`
    : app.live === "on"
      ? "● agente conectado"
      : app.live === "off"
        ? "● agente desconectado"
        : "● conectando…";
  agent.classList.toggle("ok", app.live === "on" || Boolean(writing));
  document.getElementById("status-counts").textContent = `${slides.length} diapositivas · ${written} escritas`;
  const open = (app.state.requests ?? []).length;
  document.getElementById("status-requests").textContent = open
    ? `${open} ${open === 1 ? "petición abierta" : "peticiones abiertas"}`
    : "sin peticiones abiertas";
}

export function render() {
  if (!app.state) return;
  syncSelection();
  renderHeader();
  renderOutline(outlineEl());
  resetCenter();
  renderCenter(centerEls());
  renderComments(sideEl());
  renderStatus();
}

// Request changes never move the rev: refresh the areas that show them without touching frames.
export function renderAreas() {
  if (!app.state) return;
  syncSelection();
  renderHeader();
  renderOutline(outlineEl());
  renderComments(sideEl());
  renderStatus();
}

function defaultView() {
  return app.state?.deck?.exists ? "slide" : "style";
}

export async function refresh() {
  if (!(await loadState())) return;
  if (!app.chosenView) app.view = defaultView();
  render();
}

// ---------- live updates (S11) ----------

async function onChange(rev, themes) {
  // A deck-local theme changed: re-render so previews and slides pick it up. The first event also
  // re-renders, so a theme edit before any other change is not missed.
  const themesChanged = themes !== undefined && themes !== app.themesRev;
  if (themes !== undefined) app.themesRev = themes;
  if (!themesChanged && rev && (rev === app.state?.rev || rev === app.savedRev)) {
    // This change is the user's own save echoing back: never rebuild a pane under a focused field
    // (it would drop the caret and typed text); the focusout handler refreshes when they leave (S1).
    if (await loadState()) {
      if (fieldFocused()) app.dirty = true;
      else renderAreas();
    }
    return;
  }
  if (fieldFocused()) {
    app.dirty = true;
    return;
  }
  if (themesChanged) {
    if (await loadState()) render();
    return;
  }
  await liveUpdate();
}

function fieldFocused() {
  const active = document.activeElement;
  if (!active) return false;
  return /^(INPUT|TEXTAREA)$/.test(active.tagName) && Boolean(active.closest("#outline, #ws-center, #comments"));
}

async function liveUpdate() {
  const before = app.state;
  if (!(await loadState())) return;
  const shape = (st) => JSON.stringify([st.plan.slides.map((s) => s.id), (st.deck?.slides ?? []).map((s) => [s.id, s.status, s.title])]);
  if (shape(before) !== shape(app.state)) return render();
  // Same slides: reload only the frames whose HTML changed.
  for (const box of document.querySelectorAll(".frame[data-slide-id]")) {
    if (box.dataset.preview === "1") continue;
    const frame = box.querySelector("iframe");
    if (!frame) continue;
    const url = new URL(frame.src, location.href);
    url.searchParams.delete("v");
    const html = await fetch(url).then((x) => (x.ok ? x.text() : "")).catch(() => "");
    if (!html) continue;
    if (html !== box.dataset.html) {
      if (box.dataset.html !== undefined) frame.src = slideUrl(box.dataset.slideId, { version: Date.now().toString(36) });
      box.dataset.html = html;
    }
  }
  syncSelection();
  renderComments(sideEl());
  renderStatus();
}

document.addEventListener("focusout", () => {
  if (!app.dirty) return;
  setTimeout(() => {
    if (fieldFocused()) return;
    app.dirty = false;
    refresh();
  }, 0);
});

function connectEvents() {
  const source = new EventSource("api/events");
  source.addEventListener("open", () => {
    app.live = "on";
    renderStatus();
  });
  source.addEventListener("change", (e) => {
    let data = {};
    try {
      data = JSON.parse(e.data);
    } catch {
      data = {};
    }
    onChange(data.rev ?? null, data.themes);
  });
  source.addEventListener("error", () => {
    app.live = "off";
    renderStatus();
    if (source.readyState === EventSource.CLOSED) {
      notify("Se detuvieron las actualizaciones en vivo; reconectando…", "warn");
      setTimeout(connectEvents, 3000);
    }
  });
}

// ---------- skins (S4) ----------

const SKIN_KEY = "gentle-decks.skin";

function applySkin(skin) {
  const value = skin === "flat" ? "flat" : "gentle";
  document.documentElement.dataset.skin = value;
  for (const b of document.querySelectorAll(".skin-switch button")) {
    b.setAttribute("aria-pressed", String(b.dataset.skin === value));
  }
}

function initSkin() {
  let stored = null;
  try {
    stored = localStorage.getItem(SKIN_KEY);
  } catch {
    stored = null;
  }
  const param = new URLSearchParams(location.search).get("skin");
  applySkin(param === "flat" || param === "gentle" ? param : stored === "flat" ? "flat" : "gentle");
  for (const b of document.querySelectorAll(".skin-switch button")) {
    b.addEventListener("click", () => {
      applySkin(b.dataset.skin);
      try {
        localStorage.setItem(SKIN_KEY, b.dataset.skin);
      } catch {}
    });
  }
}

// ---------- header actions ----------

document.getElementById("redo").addEventListener("click", async () => {
  const slide = selectedSlide();
  if (!slide) return;
  const text = await ask({ title: `Rehacer “${slide.title}”`, hint: "¿Qué debe cambiar el agente en esta diapositiva?" });
  if (text) await postRequest({ kind: "redo", slideId: slide.id, text }, "Pedí al agente que rehaga la diapositiva.");
});

document.getElementById("shortcuts").addEventListener("click", () => document.getElementById("help").showModal());

document.addEventListener("keydown", (e) => {
  if (e.key === "?" && !fieldFocused() && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    document.getElementById("help").showModal();
  }
});

// Cmd/Ctrl+Enter generates from the Estilo view (the button shows the same hint).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
  if (e.defaultPrevented) return;
  if (e.target instanceof Element && e.target.closest(".compose")) return;
  if (app.view !== "style") return;
  const generate = document.querySelector("#stage .gen");
  if (generate && !generate.disabled) {
    e.preventDefault();
    generate.click();
  }
});

// ---------- start ----------

initSkin();
const linked = viewFromHash();
if (linked) {
  app.view = linked;
  app.chosenView = true;
}
await refresh();
connectEvents();
