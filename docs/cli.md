# CLI reference

The `decks` CLI renders a markdown deck, checks plans and themes, and runs the
studio. From a checkout, run it as `node bin/decks.js`; from an npm install, as
`decks`.

## Commands

| Command | What it does |
| --- | --- |
| `decks <deck.md> -o <deck.html>` | Render the navigable presentation (one self-contained HTML file) |
| `decks <deck.md> --design <dir>` | Write one 1600×900 artboard per slide for the gentle-design canvas |
| `decks <deck.md> (-o \| --design) --theme <name\|.css>` | Render with a theme override: a theme name (deck → user → bundled lookup) or a `.css` path loaded as-is, so draft themes can be iterated before passing `theme check` |
| `decks plan check <plan.json>` | Validate an outline; prints `ok: N slides` |
| `decks plan scaffold <plan.json> -o <deck.md>` | Create a draft deck from the outline |
| `decks theme check <name-or-file.css>` | Check a theme against the theme contract; a name is looked up in the user themes directory, then the bundled `themes/` |
| `decks studio <deck-dir>` | Start the studio (see [studio.md](studio.md)) |
| `decks studio requests <deck-dir>` | Print the open studio requests as JSON |
| `decks studio reply <deck-dir> <id> <text>` | Answer a request in its comment thread |
| `decks studio resolve <deck-dir> <id...> [--reply <text>]` | Close requests, optionally with a final reply |

## Examples

```bash
node bin/decks.js decks/sample/gentle-decks.md -o decks/sample/gentle-decks.html
node bin/decks.js decks/sample/gentle-decks.md --design design/gentle-decks
node bin/decks.js decks/sample/gentle-decks.md --design design/preview --theme decks/demo/themes/draft-warm.css
node bin/decks.js plan check decks/demo/plan.json
node bin/decks.js plan scaffold decks/demo/plan.json -o decks/demo/demo.md
node bin/decks.js theme check gentleman-cute
```

## Output

- **`-o`** writes the presentation. Open it in a browser: arrows, swipe, or
  click to navigate, `F` for fullscreen, `P` to export one slide per page to PDF.
- **`--design <dir>`** writes `slides/<id>.html` per slide plus `design.json`.
  Canvas comments follow the slide `id`, so they stay attached when slides
  move. Rebuilding removes stale slide files and keeps `comments.json`.

## Determinism

The same markdown always produces byte-identical HTML, so a correction is a
small diff. An unknown container fails the build with the slide number instead
of producing a silently broken deck.

## Related

- [FORMAT.md](../FORMAT.md): the markdown format, `plan.json`, and themes.
- [themes/CONTRACT.md](../themes/CONTRACT.md): what a theme must style.
