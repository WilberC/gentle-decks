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
| `src/deck-nav.js` | Inlined navigation engine (keyboard, swipe, print) |
| `themes/` | Deck themes (one CSS file each) |
| `decks/sample/` | Sample deck used as the format fixture |
| `checks/` | Structural verification and `node:test` suites |
| `skill/gentle-decks/` | Agent skill (not installed yet) |
| `odd/tasks/` | Feature specs and task log |
