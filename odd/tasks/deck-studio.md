# Deck studio: Gamma-style decks for gentle-shell

Turn gentle-decks into a Gamma/Claude-style flow inside gentle-shell: the agent writes the
markdown deck, the renderer builds it, the gentle-design canvas previews it, and canvas
comments drive per-slide corrections. The skill stays in this repository until the Pi plugin ships.

## Specs

- S1 — Product goal (user, verbatim): "Quiero que podamos hacer algo estilo gamma o claude slices but for gentle-shell".
- S2 — Comments in the first deliverable (user, verbatim): "Agreguemos los comentarios igual estan parcialmente echos en gentle-design asi que es mas sencillo". Canvas comments on a slide must be traceable to that slide in the source markdown, so the agent edits only that slide.
- S3 — Prior engine (user, verbatim): "Era una version inicial si hay algo que rescatar para mejorar esto nuevo hagamoslo, sino dejemoslo de lado".
- S4 — Location (user, verbatim): "Se queda aca hasta que estemos listos para integrar con gentle-shell o bueno poner el plugin para pi que es el que se instala".
- S6 — Approach questionnaire first (user, verbatim): "Primero que nos de opciones pro ejemplo con esto podemos crear un esquema inicial [Image#1] cuando se abre la skill o se comienza el flujo es lo primero que deberia de preguntar". Image#1: three questions with topic-specific options plus "Something else" — "¿Para quién es la presentación?", "¿Qué quieres que se lleve la audiencia?", "¿Qué extensión prefieres?" ("Vista rápida — 8 diapositivas", "Presentación estándar — 12 diapositivas", "Explicación completa — 16 diapositivas", Custom count), then "Crear esquema".
- S5 — Existing renderer contract holds (FORMAT.md "Renderer contract"): same input → byte-identical output; unknown containers fail the build with the slide number; `node bin/decks.js <deck.md> -o out.html` keeps its output and message.

## Tasks

| ID | Specs | Task | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2, S5 | `--design <dir>` CLI mode: one artboard HTML per slide plus `design.json`, so the gentle-design canvas shows and comments on each slide; deterministic; stale slide files removed | inline, test-first | 1d7f1b6 |
| T2 | S1, S2, S4 | Skill `skill/gentle-decks/SKILL.md`: brief → outline approval → markdown → build → canvas → apply comments to the slide's markdown → rebuild → resolve | inline | a996363 |
| T4 | S6 | Skill: approach questionnaire (`ask_user_question`, 3 questions) as the first step, answers drive the outline | inline | "feat: start the deck skill with an approach questionnaire" |
| T3 | S1 | Docs: README and FORMAT.md describe the design mode and the skill | inline | this commit (docs) |

## Log

- L1 (user): "Quiero que podamos hacer algo estilo gamma o claude slices but for gentle-shell"
- L2 (user): "1) Agreguemos los comentarios igual estan parcialmente echos en gentle-design asi que es mas sencillo 2) Era una version inicial si hay algo que rescatar para mejorar esto nuevo hagamoslo, sino dejemoslo de lado 3) Se queda aca hasta que estemos listos para integrar con gentle-shell o bueno poner el plugin para pi que es el que se instala"
- L3 (evidence, S3): `~/Projects/Personal/presentation-engine` no longer exists on disk; only Engram notes remain (PptxGenJS, Zod spec, templates, benchmarks, pending overflow checks). Nothing to port as code. Candidate ideas kept for later, not in scope: slide overflow check and a renderer benchmark. Decision: leave it aside.
- L4 (decision, S2): reuse the gentle-design canvas unchanged. It loads `design/<slug>/design.json` artboards (`.html`, width/height) and stores comments with `file` + `selector` + `excerpt`. One artboard per slide (`NN-slide.html`, 1600×900, matching the print slide size) makes each comment's `file` name its slide number, which maps directly to the markdown slide.
- L5 (evidence): `npm run check` passes (structural checks + 7 node:test cases); sample deck rendered with `--design` and opened on the gentle-design canvas (8 artboards). `node_modules` was missing; ran `npm ci`. `design/` is gitignored (generated).
- L6 (user): "Ok, para primer entregable esta bien, pero vamos a mejorar el flujo. Primero que nos de opciones pro ejemplo con esto podemos crear un esquema inicial [Image#1] cuando se abre la skill o se comienza el flujo es lo primero que deberia de preguntar"
- L7 (decision, S6): Pi's `ask_user_question` renders exactly this UI (1-4 questions, 2-4 options, built-in free-text row = "Something else"/custom count). The skill uses it; chat numbered lists are the fallback.
- L8 (slice): first review slice ends at the commit "feat: start the deck skill with an approach questionnaire" (~420 authored lines: T1-T4). Further flow improvements start a new slice.
