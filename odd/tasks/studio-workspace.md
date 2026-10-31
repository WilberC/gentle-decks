# Studio workspace: implement the approved design

Implement the approved unified workspace (`design/studio-ui/04-workspace-plan.html`,
`05-workspace-edit.html`) in `studio/`, with Gentle / Flat skins, agent replies in comment threads,
and the two Fair Test deck themes. Branch `feat/studio-workspace` (from `design/studio-ui`).
Read `odd/tasks/deck-studio-ui.md` (API S5-S12), `odd/tasks/studio-design.md`, and the artboards first.

## Specs

- S1 — Approval (user, verbatim): "esta genial! dale". Standing instruction (user, verbatim): "si tienes dudas usa lo recomendado".
- S2 — One workspace, no separate stage screens. Header: logo `gentle·decks`, deck title + `decks/<slug>` + theme, progress bar and `N / M escritas`, "Rehacer con el agente", "Present ▶" (primary), Gentle/Flat switch. Left: outline (always visible). Center: view switch `Estilo` / `Slide` / `Grid` plus, in Slide, mode switch `Ver` / `Comentar` / `Editar` and a `layout: <name>` select. Right: comments. Footer status line: agent state, `N diapositivas · K escritas`, open requests count, `? atajos`. Layout, spacing and colors follow the artboards and `design/_src/workspace.css`.
- S3 — Default center view: `Estilo` when the deck file does not exist, else `Slide`. URL hash `#style`, `#slide`, `#grid` selects the view; old hashes stay as aliases: `#plan` → style, `#editor` → slide, `#grid` → grid.
- S4 — Skins: `gentle` (default) and `flat`, tokens exactly as `design/_src/skins.css`. The header switch sets `data-skin` on `<html>`; the choice persists in `localStorage["gentle-decks.skin"]`; `?skin=flat|gentle` overrides on load. No raw colors in studio chrome outside the two skin blocks.
- S5 — Outline rows: number, thumbnail (scaled slide iframe when the slide is in the deck; striped placeholder when pending), title, layout tag, status chip (`pendiente`, `borrador`, `lista`, `escribiendo…`, `no cabe`), and `● N` open comments for that slide. `escribiendo…` = the first plan slide not `ready` while an open `generate` request exists. `no cabe` = the slide reported overflow. Clicking a row selects it (center shows it in Slide view when written). The selected row expands: inline editable title, points (one per line), notes, and actions move up/down, merge with next, comment, add after, delete — same behavior and PUT api/plan rules as today. Keyboard on a focused row: `e` edit, `↑`/`↓` select previous/next, `Alt+↑`/`Alt+↓` move, `m` merge, `c` comment, `a` add after, `Delete`/`Backspace` delete (with confirm). "+ añadir diapositiva" in the outline footer.
- S6 — Center `Estilo` view: theme cards (cover + 2 plan slides per theme, as today) and the primary "✦ Generar las N diapositivas" button posting `generate` (label "✦ Regenerar pendientes" when the deck exists). `Slide` view: the selected slide scaled to fit, modes as today (comment pins via inspector, inline text edit via PUT api/slides/<id>/text with the ambiguous/not-found fallback to a comment), layout select posts `layout`, caption shows the mode hint and `H / 900 px` in red when the slide overflows (H from `gd:ready.height`). `Grid` view: all slides as in today's grid (placeholders for pending), clicking one selects it and switches to Slide.
- S7 — Comments column: tabs `Esta · N` (the selected slide), `Todas · N`, `Agente` (requests with a reply). Each entry shows kind/target (`h2 · "excerpt"` when it has an excerpt), author `Tú`, relative time, text; an agent reply renders as a separate `Agente` entry under it; resolved entries are dimmed with `· resuelto`. Composer at the bottom posts a `comment` request for the selected slide (`⌘/Ctrl+Enter` sends). Requests without a slide (`generate`) appear only under Todas.
- S8 — Server: `GET api/state` adds `resolved`: the 50 most recently resolved requests, newest first (existing `requests` stays = open ones). A request may carry `reply` (string ≤ 2000 chars) and `repliedAt` (ISO). New CLI `decks studio reply <deck-dir> <id> <text>` sets `reply`/`repliedAt` without resolving (prints `replied <id>`; unknown id → exit 1 `unknown request <id>`, file unchanged; empty or >2000-char text → exit 1 `invalid reply`, file unchanged). `decks studio resolve <deck-dir> <id...> [--reply <text>]` also sets the reply on every listed id. Writes stay atomic; SSE `change` fires as today. Usage lists the new forms.
- S9 — Deck themes `themes/fair-test.css` and `themes/fair-test-gentle.css` following `design/deck-template/01-fair-test.html` and `02-fair-test-gentle.html`: Fair Test = white ground, ink `#1b1b3a`, heavy rounded headings (`ui-rounded, "SF Pro Rounded", system-ui`), mono measurements (`.stat`), rainbow stage colors `#ff5a5f #ffb020 #22c55e #2f6bff #8b5cf6` on `.steps .step:nth-child(1..5)` and `.pill:nth-child(1..5)`, kicker as a filled pill; Fair Test × Gentle = same structure on the Gentle palette (`#140a12` ground, `#f6eff3` text, accent `#f095c8`, stage colors `#ff718f #f2b86d #b4e7c7 #f095c8 #a9c7ee`). Both pass `decks theme check`; the sample deck builds with each.
- S10 — Existing contracts hold: every existing test passes (update only assertions that pin the replaced UI); `npm run smoke:ui` is updated to the workspace and still proves: edit title, add (derived id), move, merge, plan comment, theme select, generate, outline thumbnails fill live, editor comment with selector/excerpt, layout request, comments column lists open requests, inline text edit; plus skin switch persists and an agent reply (`studio reply`) appears in the thread.
- S11 — Docs and skill: README Studio section and FORMAT themes describe the workspace, skins, `reply`, and the two new themes; the skill tells the agent to answer comments with `studio reply` / `resolve --reply`.

## Tasks

| ID | Specs | Task | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S8 | Server: `resolved` in state, `reply` field, `studio reply` and `resolve --reply` | worker A, test-first | pending |
| T2 | S9 | Deck themes fair-test and fair-test-gentle | worker A | pending |
| T3 | S2-S7, S10 | Studio UI workspace + skins + smoke update | worker B | pending |
| T4 | S11 | Docs and skill | inline | pending |
| T5 | S10 | Full checks, smoke, RDD, merge to main | inline | pending |

## Log

- L1 (user): "esta genial! dale"
- L2 (decision, recommended path per standing instruction): ship both deck templates as themes; comment threads with agent replies (adds `reply` to the requests contract, additive); the blocked RDD lineage `review-08ac1528e60ff198` is not abandoned without an explicit user decision (ABANDON requires it); new commits get their own RDD reviews.
