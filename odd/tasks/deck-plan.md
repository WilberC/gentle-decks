# Deck plan foundation (studio phase 1)

Foundation for the deck studio: stable slide ids, a `plan.json` outline that the studio
UI and the agent share, and a theme contract so templates and proposed themes are interchangeable.
No UI in this phase. Branch `feat/deck-plan`, stacked on `feat/deck-studio`.

## Specs

- S1 — Studio direction (user, verbatim): "1) Estudio propio asi nos permite escalar las cosas 2) Si, me parece genial - estaria genial poder generar plantillas a partir de una imagen o un estilo que te pueda mandar, pero eso para la segunda fase 3) Si me parece bien para este entregable".
- S2 — Stable slide ids. A slide may declare `id: <id>` (lowercase letters, digits, hyphens; starts with a letter). Without it the id is `slide-N`. A duplicate id fails the build: `build failed: Duplicate slide id "<id>" on slide N`; an invalid id fails: `build failed: Invalid slide id "<id>" on slide N`. Nothing is written on failure.
- S3 — Design mode names artboards by id: `slides/<id>.html` plus `design.json`, artboard order = deck order, title `NN · <title>`. Reordering slides keeps each file name, so canvas comments stay on their slide. Stale `slides/*.html` are removed; `comments.json` and other files are kept. Same input → byte-identical output.
- S4 — `plan.json` is the outline source of truth: `{ "version": 1, "title", "topic", "audience", "goal", "lang", "theme", "slides": [{ "id", "title", "points": [], "notes", "layout" }] }`. `title`, `slides`, each slide's `id` and `title` are required; ids follow S2 and are unique.
- S5 — `decks plan check <plan.json>` prints `ok: <N> slides` (exit 0) or one `plan.json: <path>: <problem>` line per problem on stderr (exit 1).
- S6 — `decks plan scaffold <plan.json> -o <deck.md>` writes a deck whose frontmatter carries title/lang/theme/brief and one slide per plan slide with `id:`, `## <title>`, and points as bullets; the first slide is the cover (`class: cover`, `# <title>`). The deck builds. Refuses to overwrite an existing file: `refusing to overwrite <path>` (exit 1).
- S7 — Theme contract: `themes/CONTRACT.md` lists the selectors every theme must style; `decks theme check <name>` prints `ok: <name>` (exit 0) or `missing selectors in <name>: <list>` (exit 1). `gentleman-cute` passes.
- S8 — Existing contract holds: `-o` output for the sample deck is byte-identical; unknown containers still fail with the slide number; usage message lists the new commands.

## Tasks

| ID | Specs | Task | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2, S3, S8 | Slide ids + id-named design artboards | inline, test-first | pending |
| T2 | S4, S5, S6 | `plan.json` validation, `plan check`, `plan scaffold` | inline, test-first | pending |
| T3 | S7 | Theme contract doc + `theme check` | inline, test-first | pending |
| T4 | S1-S8 | Skill and docs (README, FORMAT.md) follow the plan flow | inline | pending |

## Log

- L1 (user): "Luego de crear el esquema nos deberia de mostrar propuestas del look and feel en base a eso? En esta parte no se si usar templates o unicamente disenos propuestos del gentle:design . Luego deberiamos tener algo como esto quiza? [Image#2] Un review plan en el que tenemos el diseno que escogimos, pero lo mas importante es el outline donde podemos editar el texto, agregar un slide, mesclar slides, mover los slides, etc para que manualmente se pueda modificar y hacer ajustes incluso generar o hacer comentarios a cada slide [Image#3] y ya luego de eso recien comienza a generarse y vemos todos los slides generandose? de ser posible como en un grid y luego ya tenemos la vista de [Image#4] y pues dentro podemos hacer varias cosas de editar manualmente o de poner comentarios del diseno, etc para poder terminar de afinar la presentacion - que opinas? que podemos mejorar?"
- L2 (user): "1) Estudio propio asi nos permite escalar las cosas 2) Si, me parece genial - estaria genial poder generar plantillas a partir de una imagen o un estilo que te pueda mandar, pero eso para la segunda fase 3) Si me parece bien para este entregable"
- L3 (decision): roadmap = P1 foundation (this doc) → P2 studio Plan stage (editable outline + look and feel side by side) → P3 generation grid + overflow check → P4 editor (thumbnails, inline text edit, anchored comments, layout switch, agent redo) → P5 Pi extension. Templates from an image or style reference: second phase of themes, after P2.
