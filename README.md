# gentle-decks

Markdown decks that render to self-contained HTML presentations: one input
file, one output file, theme CSS and navigation JS inlined, no external
requests. Deterministic — the same markdown always produces byte-identical
HTML, so corrections are small diffs.

Extracted from hand-authored gist decks; intended to become a gentle-shell
skill (agent writes content, renderer handles mechanics, gentle-design canvas
shows the result).

## Usage

```bash
npm install
node bin/decks.js decks/sample/gentle-decks.md -o decks/sample/gentle-decks.html
node bin/decks.js decks/sample/gentle-decks.md --design design/gentle-decks
node bin/decks.js plan check plan.json
node bin/decks.js plan scaffold plan.json -o decks/<slug>/<slug>.md
node bin/decks.js theme check gentleman-cute
npm run check           # structural checks + node:test suites
```

`-o` writes the navigable presentation. `--design <dir>` writes one static
artboard per slide (`slides/<id>.html`, 1600×900) plus `design.json`, so the
gentle-design canvas previews every slide and canvas comments follow the slide
id even when slides move. Rebuilding removes stale slide files and keeps
`comments.json`. `plan.json` holds the editable outline; `themes/CONTRACT.md`
makes themes interchangeable.

## Studio

```bash
node bin/decks.js studio decks/<slug>                  # needs decks/<slug>/plan.json
node bin/decks.js studio requests decks/<slug>         # open requests as JSON
node bin/decks.js studio reply decks/<slug> <id> <text> # answer in the comment thread
node bin/decks.js studio resolve decks/<slug> <id...> [--reply <text>]
```

A local web app (127.0.0.1, secret token in the URL) with one workspace for the
whole flow:

- **Outline** (left, always visible) — every slide with its thumbnail, status
  (`pendiente`, `escribiendo…`, `lista`, `no cabe`) and open comments. Edit the
  text, add, merge, move, delete, or comment a slide in place; keyboard
  shortcuts on the focused row (`e`, `↑↓`, `Alt+↑↓`, `m`, `c`, `a`, `Delete`).
- **Center** — three views: **Estilo** (theme previews rendered with your own
  outline, plus Generate), **Slide** (the selected slide with Ver / Comentar /
  Editar modes, layout switch and overflow warning) and **Grid** (all slides,
  filling in live as the agent writes them).
- **Comments** (right) — one thread per slide; the agent answers in the same
  thread with `studio reply` or `studio resolve --reply`.

Two skins: **Gentle** (default, the Gentle brand palette) and **Flat** (the
Gentle Shell terminal palette). Switch in the header; the choice is remembered,
and `?skin=flat` forces it. Append `#style`, `#slide`, or `#grid` to the URL
to open a view (`#plan` and `#editor` still work).

Try it with `npm run studio:demo` (an eight-slide Python plan in
`decks/demo/`); write `decks/demo/demo.md` with `plan scaffold` to see the
slides. `npm run smoke:ui` drives the whole UI in a headless Edge/Chrome/Chromium
(`BROWSER=<path>` to choose) and checks the files it writes.

The studio edits `plan.json` and deck text directly; everything that needs
writing (generate, comments, redo, layout, new slides, overflow) is queued in
`requests.json` and printed as `request <id> <kind> <slide>` for the agent.
A deck may ship its own themes in `decks/<slug>/themes/`. Bundled deck themes:
`gentleman-cute`, `fair-test` (bright, white, rainbow method stages) and
`fair-test-gentle` (the same structure in Gentle colors).

## Agent workflow

[`skill/gentle-decks/SKILL.md`](skill/gentle-decks/SKILL.md) is the
Gamma-style flow for gentle-shell: brief → outline approval → markdown →
canvas preview → apply canvas comments to the slide's markdown → final HTML.
It lives here until it ships in the Pi plugin.

Open the generated HTML in a browser: arrows/swipe/click to navigate,
`F` fullscreen, `P` exports one slide per page to PDF.

## Format

The markdown→slide contract lives in [FORMAT.md](FORMAT.md): slide
separators, per-slide directives (`kicker`, `class`, `lead`), component
containers (`::: card`, `::: grid-2`, `::: steps`, `::: term`, `::: bars`,
`::: stat`, `::: pills`), and inline color tokens (`[[pink|text]]`).

Unknown containers fail the build with the slide number; a typo never
produces a silently broken deck.

## Layout

| Path | Purpose |
| --- | --- |
| `bin/decks.js` | CLI entry |
| `src/parse.js` | Frontmatter, slide splitting, container tree |
| `src/render.js` | Markdown and containers → slide HTML |
| `src/design.js` | Per-slide canvas artboards and `design.json` |
| `src/plan.js` | `plan.json` validation and deck scaffolding |
| `src/theme.js` | Theme contract check |
| `src/studio/` | Studio server, API, requests queue, text edits |
| `studio/` | Studio web UI (no dependencies, no build) and artboard inspector |
| `src/deck-nav.js` | Inlined navigation engine (keyboard, swipe, print) |
| `themes/` | Deck themes (one CSS file each) |
| `decks/sample/` | Sample deck used as the format fixture |
| `checks/` | Structural verification and `node:test` suites |
| `skill/gentle-decks/` | Agent skill (not installed yet) |
| `odd/tasks/` | Feature specs and task log |
