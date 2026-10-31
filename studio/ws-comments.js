// Right column: comment threads, agent replies and the composer (S7).
// `state.requests` holds open requests; `state.resolved` (S8) is rendered when the server has it.
import { app, el, postRequest, slidesInOrder } from "./studio.js";

const EMPTY = {
  this: "Nada en esta diapositiva todavía. Escribe abajo para comentarla.",
  all: "Sin comentarios todavía.",
  agent: "El agente todavía no respondió a ningún comentario.",
};

// Open and resolved requests in thread order; a server without `resolved` still works (S8 fallback).
function allEntries() {
  const seen = new Set();
  const list = [];
  for (const request of [...(app.state?.requests ?? []), ...(app.state?.resolved ?? [])]) {
    if (!request || typeof request !== "object" || !request.id || seen.has(request.id)) continue;
    seen.add(request.id);
    list.push(request);
  }
  return list.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

const isResolved = (r) => r.status === "resolved" || Boolean(r.resolvedAt);

function ago(iso) {
  const at = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(at)) return "ahora";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return "ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

// `h2 · "excerpt"` when the request names an element, else the kind (S7).
function target(r) {
  if (r.excerpt) {
    const last = String(r.selector ?? "").split(" > ").pop() ?? "";
    const tag = last.replace(/:nth-of-type\(\d+\)/, "").replace(/^#/, "") || "elemento";
    return `${tag} · “${r.excerpt}”`;
  }
  if (r.kind === "layout") return `layout · ${r.layout ?? "?"}`;
  if (r.kind === "overflow") return `overflow · ${r.slideId ?? ""}`;
  if (r.kind === "redo") return "redo";
  if (r.kind === "add-slide") return `add-slide · ${r.slideId ?? ""}`;
  return null;
}

function filtered(entries) {
  if (app.tab === "agent") return entries.filter((r) => typeof r.reply === "string" && r.reply.trim() !== "");
  if (app.tab === "all") return entries;
  return entries.filter((r) => r.slideId === app.current);
}

function entry(r) {
  const li = el("li", { className: `c${isResolved(r) ? " done" : ""}` });
  const label = target(r);
  const where = app.tab === "this" ? [] : [r.slideId].filter(Boolean);
  const on = [where.join(" · "), label].filter(Boolean).join(" · ");
  if (on) li.append(el("span", { className: "on", textContent: on }));
  li.append(el("div", { className: "who" }, el("b", { textContent: "Tú" }), el("span", { textContent: ago(r.createdAt) })));
  const text = r.text ?? r.layout ?? "";
  if (text) li.append(el("p", { textContent: text }));
  return li;
}

function replyEntry(r) {
  const li = el("li", { className: `c agent${isResolved(r) ? " done" : ""}` });
  li.append(el("div", { className: "who" }, el("b", { textContent: "Agente" }), el("span", { textContent: ago(r.repliedAt) })));
  li.append(el("p", { textContent: String(r.reply).slice(0, 2000) }));
  return li;
}

function titleBar(entries) {
  const slide = slidesInOrder().find((s) => s.id === app.current);
  const index = slidesInOrder().findIndex((s) => s.id === app.current);
  const where = slide ? `${String(index + 1).padStart(2, "0")} · ${slide.id}` : "sin diapositiva";
  return el(
    "div",
    { className: "s-title" },
    el("span", { textContent: `Comentarios` }),
    el("span", { textContent: `${where} · ${entries.length}` }),
  );
}

function tabs(entries) {
  const bar = el("div", { className: "tabs", role: "tablist", ariaLabel: "Comentarios" });
  const counts = {
    this: entries.filter((r) => r.slideId === app.current).length,
    all: entries.length,
    agent: entries.filter((r) => typeof r.reply === "string" && r.reply.trim() !== "").length,
  };
  for (const [key, label] of [["this", "Esta"], ["all", "Todas"], ["agent", "Agente"]]) {
    const b = el("button", { type: "button", role: "tab", textContent: `${label} · ${counts[key]}` });
    b.dataset.tab = key;
    b.setAttribute("aria-selected", String(app.tab === key));
    b.addEventListener("click", () => {
      app.tab = key;
      renderComments(document.getElementById("comments"));
      document.querySelector(`#comments .tabs [data-tab="${key}"]`)?.focus();
    });
    bar.append(b);
  }
  return bar;
}

function thread(entries) {
  const list = filtered(entries);
  const ul = el("ul", { className: "thread", role: "tabpanel", ariaLabel: "Comentarios" });
  if (!list.length) {
    ul.append(el("li", { className: "empty", textContent: EMPTY[app.tab] ?? EMPTY.all }));
    return ul;
  }
  for (const r of list) {
    ul.append(entry(r));
    if (typeof r.reply === "string" && r.reply.trim()) ul.append(replyEntry(r));
  }
  return ul;
}

function composer() {
  const list = slidesInOrder();
  const index = list.findIndex((s) => s.id === app.current);
  const slide = list[index] ?? null;
  const box = el("div", { className: "compose" });
  const area = el("textarea", {
    id: "compose",
    rows: 2,
    ariaLabel: slide ? `Comentar en la diapositiva ${index + 1}` : "Comentar",
    placeholder: slide ? `Comentar en la diapositiva ${String(index + 1).padStart(2, "0")}…` : "Elige una diapositiva para comentar",
  });
  area.disabled = !slide;
  const send = el("button", { type: "button", className: "go", id: "send", textContent: "enviar" });
  send.disabled = !slide;
  const submit = async () => {
    const text = area.value.trim();
    if (!text || !slide) return;
    area.value = "";
    await postRequest({ kind: "comment", slideId: slide.id, text }, "Comentario enviado al agente.");
    document.getElementById("compose")?.focus();
  };
  send.addEventListener("click", submit);
  area.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  });
  box.append(area, el("div", { className: "row2" }, el("span", { textContent: "⌘↵ enviar al agente" }), send));
  return box;
}

export function renderComments(aside) {
  if (!aside || !app.state) return;
  const entries = allEntries();
  aside.replaceChildren(titleBar(entries), tabs(entries), thread(entries), composer());
}
