// Studio shell: state, API calls, live updates, stage switching, shared widgets.
// Contract: odd/tasks/deck-studio-ui.md (S5-S13, L4).
import { renderPlan } from "./ui-plan.js";
import { renderGrid } from "./ui-grid.js";
import { renderEditor, onEditorMessage, renderRequestsPanel } from "./ui-editor.js";

export const SLIDE_W = 1600;
export const SLIDE_H = 900;

export const app = {
  state: null,
  stage: null, // "plan" | "grid" | "editor"
  chosenStage: false, // the user picked a tab; stop auto-switching
  current: null, // slide id selected in the editor
  overflow: new Map(), // slide id -> boolean
  overflowSent: new Set(),
  savedRev: null,
  dirty: false, // a re-render waits for the user to leave a field
};

const stageEl = () => document.getElementById("stage");

// ---------- API ----------

export async function api(method, url, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: { error: "offline" } };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function loadState() {
  const r = await api("GET", "api/state");
  if (!r.ok) {
    notify("The studio server is not responding.", "error");
    return false;
  }
  app.state = r.data;
  document.getElementById("deck-title").textContent = r.data.plan?.title ?? "studio";
  return true;
}

let saveTimer = null;
export function savePlanSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePlan, 500);
}

export async function savePlan() {
  clearTimeout(saveTimer);
  const { rev, plan } = app.state;
  const r = await api("PUT", "api/plan", { rev, plan });
  if (r.ok) {
    app.state.rev = r.data.rev;
    app.savedRev = r.data.rev;
    return true;
  }
  if (r.status === 409) {
    notify("The plan changed on disk; reloaded the latest version.", "warn");
    await refresh();
  } else if (r.status === 422) {
    notify(`Not saved: ${(r.data?.problems ?? []).join("; ")}`, "error");
  } else {
    notify("Could not save the plan.", "error");
  }
  return false;
}

export async function postRequest(req, message = "Sent to the agent.") {
  const r = await api("POST", "api/requests", req);
  if (!r.ok) {
    notify(`Request rejected: ${r.data?.error ?? r.status}${r.data?.message ? ` — ${r.data.message}` : ""}`, "error");
    return false;
  }
  if (message) notify(message);
  await loadState();
  renderRequestsBadge();
  return true;
}

// ---------- notices and dialog ----------

export function notify(text, tone = "info") {
  const box = document.getElementById("notices");
  const item = document.createElement("p");
  item.className = `notice ${tone}`;
  item.textContent = text;
  box.append(item);
  setTimeout(() => item.remove(), tone === "error" ? 9000 : 5000);
}

// Resolves to the typed text, "" for confirm-only dialogs, or null when cancelled.
export function ask({ title, hint = "", value = "", ok = "Send", text = true }) {
  const dialog = document.getElementById("dialog");
  const area = document.getElementById("dialog-text");
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-hint").textContent = hint;
  document.getElementById("dialog-ok").textContent = ok;
  area.hidden = !text;
  area.value = value;
  dialog.returnValue = "";
  dialog.showModal();
  if (text) area.focus();
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        if (dialog.returnValue !== "ok") return resolve(null);
        if (!text) return resolve("");
        const v = area.value.trim();
        resolve(v ? v : null);
      },
      { once: true },
    );
  });
}

// ---------- slide frames ----------

const scaler = new ResizeObserver((entries) => {
  for (const e of entries) e.target.style.setProperty("--s", String(e.contentRect.width / SLIDE_W));
});

// A 16:9 box with the slide artboard scaled to its width.
export function slideFrame(id, { theme, version, live = false, title } = {}) {
  const box = document.createElement("div");
  box.className = `frame${live ? " live" : ""}`;
  box.dataset.slideId = id;
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("tabindex", live ? "0" : "-1");
  frame.title = title ?? `Slide ${id}`;
  frame.loading = live ? "eager" : "lazy";
  frame.src = slideUrl(id, { theme, version });
  box.append(frame);
  scaler.observe(box);
  if (app.overflow.get(id)) box.classList.add("overflow");
  return box;
}

export function slideUrl(id, { theme, version } = {}) {
  const q = new URLSearchParams();
  if (theme) q.set("theme", theme);
  if (version) q.set("v", version);
  const qs = q.toString();
  return `slides/${encodeURIComponent(id)}.html${qs ? `?${qs}` : ""}`;
}

export function sendMode(frame, mode) {
  frame?.contentWindow?.postMessage({ type: "gd:mode", mode }, "*");
}

// Messages come only from our own sandboxed iframes; anything else is ignored.
window.addEventListener("message", (event) => {
  const frame = [...document.querySelectorAll("iframe")].find((f) => f.contentWindow === event.source);
  const msg = event.data;
  if (!frame || !msg || typeof msg !== "object" || typeof msg.type !== "string") return;
  const id = frame.closest("[data-slide-id]")?.dataset.slideId;
  if (!id || (msg.slideId && msg.slideId !== id)) return;
  if (msg.type === "gd:ready") return onReady(id, msg, frame);
  onEditorMessage(id, msg, frame);
});

function onReady(id, msg, frame) {
  // Theme previews of an unwritten plan are not the deck: ignore their size.
  if (new URL(frame.src).searchParams.has("theme")) return;
  const over = msg.overflow === true;
  app.overflow.set(id, over);
  for (const box of document.querySelectorAll(`.frame[data-slide-id="${CSS.escape(id)}"]`)) box.classList.toggle("overflow", over);
  for (const badge of document.querySelectorAll(`[data-overflow-for="${CSS.escape(id)}"]`)) badge.hidden = !over;
  const written = app.state?.deck?.slides?.some((s) => s.id === id && s.status !== "pending");
  const open = app.state?.requests?.some((r) => r.kind === "overflow" && r.slideId === id);
  if (over && written && !open && !app.overflowSent.has(id)) {
    app.overflowSent.add(id);
    postRequest({ kind: "overflow", slideId: id }, `Slide "${id}" is too tall; asked the agent to tighten it.`);
  }
}

// ---------- stages ----------

export function slidesInOrder() {
  const st = app.state;
  const deck = new Map((st.deck?.slides ?? []).map((s) => [s.id, s]));
  const planIds = new Set(st.plan.slides.map((s) => s.id));
  const list = st.plan.slides.map((s) => ({ id: s.id, title: s.title, status: deck.get(s.id)?.status ?? "pending" }));
  for (const s of st.deck?.slides ?? []) if (!planIds.has(s.id)) list.push({ id: s.id, title: s.title, status: s.status });
  return list;
}

function defaultStage() {
  const st = app.state;
  if (!st.deck?.exists) return "plan";
  return slidesInOrder().some((s) => s.status !== "ready") ? "grid" : "editor";
}

const STAGES = ["plan", "grid", "editor"];

export function setStage(stage, { chosen = true } = {}) {
  app.stage = stage;
  if (chosen) {
    app.chosenStage = true;
    history.replaceState(null, "", `#${stage}`);
  }
  render();
  stageEl().focus({ preventScroll: true });
}

export function render() {
  for (const b of document.querySelectorAll(".tabs button")) {
    if (b.dataset.stage === app.stage) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  document.getElementById("present").hidden = !app.state.deck?.exists;
  const root = stageEl();
  root.replaceChildren();
  root.className = `stage-${app.stage}`;
  if (app.stage === "plan") renderPlan(root);
  else if (app.stage === "grid") renderGrid(root);
  else renderEditor(root);
  renderRequestsBadge();
}

function renderRequestsBadge() {
  renderRequestsPanel();
  const n = app.state?.requests?.length ?? 0;
  const editorTab = document.querySelector('.tabs button[data-stage="editor"]');
  editorTab.textContent = n ? `Editor · ${n} open` : "Editor";
}

export async function refresh() {
  if (!(await loadState())) return;
  if (!app.chosenStage) app.stage = defaultStage();
  render();
}

// Re-render on file changes, but never under the user's cursor.
async function onChange(rev) {
  // Same plan and deck: only the requests queue (or a theme file) may have changed.
  if (rev && (rev === app.state?.rev || rev === app.savedRev)) {
    if (await loadState()) renderRequestsBadge();
    return;
  }
  const active = document.activeElement;
  if (active && stageEl().contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
    app.dirty = true;
    return;
  }
  if (app.stage === "grid" || app.stage === "editor") liveUpdate();
  else refresh();
}

async function liveUpdate() {
  const before = app.state;
  if (!(await loadState())) return;
  const shape = (st) => JSON.stringify([st.plan.slides.map((s) => s.id), (st.deck?.slides ?? []).map((s) => [s.id, s.status, s.title])]);
  if (shape(before) !== shape(app.state)) return render();
  // Same slides: reload only the frames whose HTML changed.
  for (const box of document.querySelectorAll(".frame[data-slide-id]")) {
    const frame = box.querySelector("iframe");
    const url = new URL(frame.src);
    url.searchParams.delete("v");
    const r = await fetch(url).then((x) => (x.ok ? x.text() : "")).catch(() => "");
    if (r && r !== box.dataset.html) {
      if (box.dataset.html !== undefined) frame.src = slideUrl(box.dataset.slideId, { theme: url.searchParams.get("theme"), version: Date.now().toString(36) });
      box.dataset.html = r;
    }
  }
  renderRequestsBadge();
}

stageEl().addEventListener("focusout", () => {
  if (!app.dirty) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && stageEl().contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    app.dirty = false;
    refresh();
  }, 0);
});

function connectEvents() {
  const source = new EventSource("api/events");
  source.addEventListener("change", (e) => {
    let rev = null;
    try {
      rev = JSON.parse(e.data).rev;
    } catch {
      rev = null;
    }
    onChange(rev);
  });
  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED) {
      notify("Live updates stopped; reconnecting…", "warn");
      setTimeout(connectEvents, 3000);
    }
  });
}

for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => setStage(b.dataset.stage));

// A #plan / #grid / #editor link opens that stage.
const linked = location.hash.slice(1);
if (STAGES.includes(linked)) {
  app.stage = linked;
  app.chosenStage = true;
}
window.addEventListener("hashchange", () => {
  const stage = location.hash.slice(1);
  if (STAGES.includes(stage) && stage !== app.stage) setStage(stage);
});

await refresh();
connectEvents();
