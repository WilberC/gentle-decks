// Grid stage: every slide, filling in live as the agent writes them. See S13.
import { app, slideFrame, slidesInOrder, setStage } from "./studio.js";

export function renderGrid(root) {
  const slides = slidesInOrder();
  const done = slides.filter((s) => s.status === "ready").length;
  const head = document.createElement("div");
  head.className = "grid-head";
  const h1 = document.createElement("h1");
  h1.textContent = app.state.deck?.exists ? "Slides" : "Waiting for the agent";
  const progress = document.createElement("p");
  progress.className = "muted";
  progress.textContent = app.state.deck?.exists ? `${done} of ${slides.length} written` : "The grid fills in as soon as generation starts.";
  head.append(h1, progress);

  const grid = document.createElement("ol");
  grid.className = "grid";
  slides.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = `tile ${s.status}`;
    if (s.status === "pending") {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.setAttribute("aria-label", `Slide ${i + 1}, not written yet`);
      li.append(ph);
    } else {
      li.append(slideFrame(s.id, { title: `Slide ${i + 1}: ${s.title}` }));
    }
    const cap = document.createElement("button");
    cap.type = "button";
    cap.className = "caption";
    cap.disabled = s.status === "pending";
    cap.innerHTML = "";
    const num = document.createElement("b");
    num.textContent = String(i + 1).padStart(2, "0");
    const t = document.createElement("span");
    t.textContent = s.title;
    cap.append(num, t);
    if (s.status === "draft") cap.append(badge("draft"));
    const over = badge("overflow");
    over.dataset.overflowFor = s.id;
    over.hidden = !app.overflow.get(s.id);
    cap.append(over);
    cap.setAttribute("aria-label", `Open slide ${i + 1} in the editor`);
    cap.addEventListener("click", () => {
      app.current = s.id;
      setStage("editor");
    });
    li.append(cap);
    grid.append(li);
  });
  root.append(head, grid);
}

function badge(text) {
  const b = document.createElement("span");
  b.className = `badge ${text}`;
  b.textContent = text;
  return b;
}
