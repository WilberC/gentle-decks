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
node checks/check.mjs   # structural checks + determinism + failure modes
```

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
| `src/deck-nav.js` | Inlined navigation engine (keyboard, swipe, print) |
| `themes/` | Deck themes (one CSS file each) |
| `decks/sample/` | Sample deck used as the format fixture |
| `checks/` | Structural verification |
