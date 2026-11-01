// Studio state, API client, notices and dialog. Shared by the shell (studio.js) and the columns.
import { refresh, renderAreas } from "./studio.js";

export const SLIDE_W = 1600;
export const SLIDE_H = 900;
// Container names the renderer accepts (src/render.js CONTAINER_NAMES, minus the inline `step`).
export const LAYOUTS = ["grid-2", "grid-3", "grid-4", "split", "steps", "card", "term", "bars", "stat", "pills"];

export const VIEWS = ["style", "slide", "grid"];
// S3: canonical hashes, plus the hashes of the replaced stage screens as aliases.
const ALIASES = new Map([
  ["style", "style"],
  ["slide", "slide"],
  ["grid", "grid"],
  ["plan", "style"],
  ["editor", "slide"],
]);

export const app = {
  state: null, // GET api/state
  view: null, // "style" | "slide" | "grid"
  chosenView: false, // the user picked a view; stop defaulting
  mode: "view", // slide mode: "view" | "comment" | "edit"
  current: null, // selected slide id
  tab: "this", // comments tab: "this" | "all" | "agent"
  overflow: new Map(), // slide id -> boolean (gd:ready overflow)
  heights: new Map(), // slide id -> scrollHeight reported by gd:ready
  overflowSent: new Set(), // slide ids already reported once
  savedRev: null,
  dirty: false, // a re-render waits for the user to leave a field
  live: "connecting", // SSE state: "connecting" | "on" | "off"
  themesRev: null, // last themes fingerprint from api/events
};

// ---------- small DOM helpers ----------

export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

export const centerEls = () => ({
  tools: document.getElementById("tools"),
  stage: document.getElementById("stage"),
  caption: document.getElementById("caption"),
});

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
    notify("El servidor del studio no responde.", "error");
    return false;
  }
  app.state = r.data;
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
    notify("El plan cambió en disco; recargué la última versión.", "warn");
    await refresh();
  } else if (r.status === 422) {
    notify(`No se guardó: ${(r.data?.problems ?? []).join("; ")}`, "error");
  } else {
    notify("No se pudo guardar el plan.", "error");
  }
  return false;
}

export async function postRequest(req, message = "Enviado al agente.") {
  const r = await api("POST", "api/requests", req);
  if (!r.ok) {
    const why = r.data?.error ?? r.status;
    const detail = r.data?.message ?? (r.data?.problems ?? []).join("; ");
    notify(`Petición rechazada: ${why}${detail ? ` — ${detail}` : ""}`, "error");
    return false;
  }
  if (message) notify(message);
  if (await loadState()) renderAreas();
  return true;
}

// ---------- notices and dialog ----------

export function notify(text, tone = "info") {
  const box = document.getElementById("notices");
  if (!box) return;
  const item = el("p", { className: `notice ${tone}`, textContent: text });
  box.append(item);
  setTimeout(() => item.remove(), tone === "error" ? 9000 : 5000);
}

// Resolves to the typed text, "" for confirm-only dialogs, or null when cancelled.
export function ask({ title, hint = "", value = "", ok = "Enviar", text = true }) {
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

// ---------- routing (S3) ----------

export function viewFromHash() {
  return ALIASES.get(location.hash.slice(1).toLowerCase()) ?? null;
}

export function applyView(view, { chosen = true } = {}) {
  if (!VIEWS.includes(view)) return;
  app.view = view;
  if (!chosen) return;
  app.chosenView = true;
  try {
    history.replaceState(null, "", `#${view}`);
  } catch {}
}
