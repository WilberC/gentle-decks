// Studio artboard inspector (L4). Injected into every slide artboard the studio serves.
//
// Artboard -> parent, always with target "*":
//   { type: "gd:ready", slideId, overflow, height }   on load and resize
//   { type: "gd:pick", slideId, selector, excerpt, text } on click in comment or edit mode
//   { type: "gd:edit", slideId, before, after }       on blur of an edited text element
//   { type: "gd:move", slideId, selector, excerpt }    on drag of an element in edit mode
// Parent -> artboard: { type: "gd:mode", mode: "view" | "comment" | "edit" }
(() => {
  "use strict";

  const SLIDE_HEIGHT = 900;
  // Elements that are safe to make editable: real text blocks, or anything carrying its own text.
  const TEXT_BLOCKS = new Set([
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "BLOCKQUOTE", "PRE",
    "DD", "DT", "FIGCAPTION", "SPAN", "B", "STRONG", "EM", "SMALL", "CODE",
  ]);
  let mode = "view";
  let editing = null;

  const slide = () => document.querySelector(".slide");
  // Markdown is single-line, so collapse the rendered whitespace before matching it back.
  const squash = (value) => (value || "").replace(/\s+/g, " ").trim();
  const hasOwnText = (element) =>
    Array.prototype.some.call(element.childNodes, (node) => node.nodeType === 3 && node.textContent.trim() !== "");
  const canEdit = (element) => TEXT_BLOCKS.has(element.tagName) || hasOwnText(element);

  function post(message) {
    if (!window.parent || window.parent === window) return;
    const section = slide();
    window.parent.postMessage({ slideId: section ? section.dataset.slideId || "" : "", ...message }, "*");
  }

  const overflows = () => {
    const section = slide();
    return Boolean(section) && section.scrollHeight > SLIDE_HEIGHT;
  };

  function announce() {
    const section = slide();
    post({ type: "gd:ready", overflow: overflows(), height: section ? Math.ceil(section.scrollHeight) : 0 });
  }

  // A readable selector from `.slide` down to `element`, e.g. ".slide > div.grid-2 > p:nth-of-type(2)".
  function selectorFor(element) {
    const section = slide();
    const parts = [];
    for (let node = element; node && node !== section && node.nodeType === 1; node = node.parentElement) {
      if (node.id) {
        parts.unshift(`#${node.id}`);
        break;
      }
      const siblings = node.parentElement
        ? Array.prototype.filter.call(node.parentElement.children, (child) => child.tagName === node.tagName)
        : [];
      const tag = node.tagName.toLowerCase();
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    }
    return [".slide", ...parts].join(" > ");
  }

  // Widest element that carries only the clicked text, so picks name the smallest useful block.
  function textTarget(node) {
    const section = slide();
    let element = node && node.nodeType === 1 ? node : node ? node.parentElement : null;
    if (!element || !section || !section.contains(element)) return null;
    while (
      element !== section &&
      element.parentElement &&
      element.parentElement !== section &&
      squash(element.parentElement.textContent) === squash(element.textContent)
    ) {
      element = element.parentElement;
    }
    return element;
  }

  function startEdit(element) {
    if (!element || editing) return;
    const before = squash(element.textContent);
    if (!before) return;
    editing = { element, before };
    element.setAttribute("contenteditable", "true");
    element.setAttribute("data-gd-editing", "true");
    element.focus();
  }

  function stopEdit(commit) {
    if (!editing) return;
    const { element, before } = editing;
    editing = null;
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-gd-editing");
    if (!commit) {
      element.textContent = before;
      return;
    }
    const after = squash(element.textContent);
    if (after && after !== before) post({ type: "gd:edit", before, after });
  }

  document.addEventListener(
    "click",
    (event) => {
      if (mode === "view" || editing) return;
      if (dragged) {
        // The click after a drag belongs to the move gesture, not to an edit or comment.
        dragged = false;
        return;
      }
      const target = textTarget(event.target);
      if (!target) return;
      event.preventDefault();
      const text = squash(target.textContent);
      post({ type: "gd:pick", selector: selectorFor(target), excerpt: text.slice(0, 160), text });
      if (mode === "edit" && canEdit(target)) startEdit(target);
    },
    true,
  );

  // S8a (artboard 05): dragging an element in edit mode asks the agent to move it. A small
  // threshold separates a drag from a click; the click handler skips the gesture that dragged.
  let dragged = false;
  let dragFrom = null;
  document.addEventListener(
    "mousedown",
    (event) => {
      dragged = false;
      dragFrom = mode === "edit" && !editing ? { x: event.clientX, y: event.clientY, target: textTarget(event.target) } : null;
    },
    true,
  );
  document.addEventListener(
    "mousemove",
    (event) => {
      if (!dragFrom || dragged) return;
      if (Math.abs(event.clientX - dragFrom.x) + Math.abs(event.clientY - dragFrom.y) > 8) {
        dragged = true;
        const target = dragFrom.target;
        dragFrom = null;
        if (target) post({ type: "gd:move", selector: selectorFor(target), excerpt: squash(target.textContent).slice(0, 160) });
      }
    },
    true,
  );
  document.addEventListener(
    "mouseup",
    () => {
      dragFrom = null;
    },
    true,
  );

  // Previews are sandboxed: never navigate the artboard away through a content link.
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (link) event.preventDefault();
    },
    true,
  );

  // Double-click is the announced affordance for editing text on the slide (artboard 05).
  document.addEventListener(
    "dblclick",
    (event) => {
      if (mode !== "edit" || editing) return;
      const target = canEdit(event.target) ? event.target : textTarget(event.target);
      if (target && canEdit(target)) startEdit(target);
    },
    true,
  );

  document.addEventListener(
    "blur",
    (event) => {
      if (editing && event.target === editing.element) stopEdit(true);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!editing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stopEdit(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const element = editing.element;
        stopEdit(true);
        element.blur();
      }
    },
    true,
  );

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== "gd:mode") return;
    if (data.mode !== "view" && data.mode !== "comment" && data.mode !== "edit") return;
    if (mode === "edit" && data.mode !== "edit") stopEdit(false);
    mode = data.mode;
    document.documentElement.setAttribute("data-gd-mode", mode);
  });

  function init() {
    const style = document.createElement("style");
    style.textContent = [
      ':root[data-gd-mode="comment"] .slide * { cursor: crosshair; }',
      ':root[data-gd-mode="edit"] .slide * { cursor: text; }',
      // S8a: editable blocks announce themselves on hover while editing (artboard 05).
      ':root[data-gd-mode="edit"] .slide :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, th, dt, dd, pre):hover { outline: 1px dashed rgba(79,140,255,.75); outline-offset: 2px; border-radius: 2px; }',
      '[data-gd-editing="true"] { outline: 2px solid #4f8cff; outline-offset: 2px; border-radius: 2px; }',
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
    announce();
    window.addEventListener("resize", announce);
    // The grid badges overflow live while the agent rewrites slides.
    if (window.ResizeObserver) {
      const section = slide();
      if (section) new ResizeObserver(announce).observe(section);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("load", announce);
})();
