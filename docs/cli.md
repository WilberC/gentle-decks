# CLI reference

The `decks` CLI renders a markdown deck, checks plans and themes, and runs the
studio. From a checkout, run it as `node bin/decks.js`; from an npm install, as
`decks`.

## Commands

| Command | What it does |
| --- | --- |
| `decks <deck.md> -o <deck.html>` | Render the navigable presentation (one self-contained HTML file) |
| `decks pdf <deck.md> [-o <deck.pdf>]` | Print the deck to a static PDF with headless Chrome: the same self-contained build (embedded images, `plan.json` order), no print dialog |
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
node bin/decks.js pdf decks/sample/gentle-decks.md -o decks/sample/gentle-decks.pdf
node bin/decks.js decks/sample/gentle-decks.md --design design/gentle-decks
node bin/decks.js decks/sample/gentle-decks.md --design design/preview --theme decks/demo/themes/draft-warm.css
node bin/decks.js plan check decks/demo/plan.json
node bin/decks.js plan scaffold decks/demo/plan.json -o decks/demo/demo.md
node bin/decks.js theme check gentleman-cute
```

## Output

- **`-o`** writes the presentation. Open it in a browser: arrows, swipe, or
  click to navigate, `F` for fullscreen, `P` to export one slide per page to PDF.
  Slides with `animate:` stagger their children in, containers with
  `animate=<profile>` animate on their own, and `transition: fade|slide|none`
  sets the slide change (default `fade`). The motion CSS travels inside the
  single file, so it keeps working when the HTML is moved or emailed;
  `prefers-reduced-motion` disables the motion and printing shows the final
  state. See [FORMAT.md](../FORMAT.md#motion).
- **`--design <dir>`** writes `slides/<id>.html` per slide plus `design.json`.
  Canvas comments follow the slide `id`, so they stay attached when slides
  move. Rebuilding removes stale slide files and keeps `comments.json`.
- **`pdf <deck.md>`** writes `<deck>.pdf` next to the markdown, or at the `-o`
  path. It prints the same self-contained deck the `-o` build produces, in
  `plan.json` order, one 1600×900 slide per page, using the page size the theme
  declares. The deliverable pair is the animated HTML plus this static PDF.

### PDF export needs Chrome

The `pdf` command prints through headless Chrome, so one of these must be
available:

1. `BROWSER`: a Chrome, Chromium or Edge binary.
2. `CHROME_PATH`: the same, for environments that already set it.
3. A well-known install: `/usr/bin/chromium-browser`, `/usr/bin/chromium`,
   `/usr/bin/google-chrome`, `/usr/bin/microsoft-edge`, or the macOS app bundles.

A `BROWSER` or `CHROME_PATH` that points nowhere fails the command instead of
falling back to another browser, and the error lists every source it tried. PDF
export also needs Node.js 22 or newer for the built-in WebSocket the DevTools
protocol uses; the rest of the CLI still runs on Node.js 18.

## Update check

The CLI compares its own version with the latest published `gentle-decks` and
warns once per outdated pair, so an old install gets a single heads-up instead
of a nag: "gentle-decks 0.2.1 is not the latest published version (0.3.0); run
`npm i -g gentle-decks` to update." The registry
(`https://registry.npmjs.org/gentle-decks/latest`) is re-read at most once a
day, with a short timeout that fails silently offline, and the cached answer
lives in `$XDG_CONFIG_HOME/gentle-decks/update-check.json`
(`~/.config/gentle-decks/update-check.json` by default, `$GENTLE_DECKS_THEMES`
when that relocates the user themes dir). The check never fails or slows a
command and speaks only to an interactive terminal; set
`GENTLE_DECKS_NO_UPDATE_CHECK=1` to opt out.

## Determinism

The same markdown always produces byte-identical HTML, so a correction is a
small diff. An unknown container fails the build with the slide number instead
of producing a silently broken deck.

## Related

- [FORMAT.md](../FORMAT.md): the markdown format, `plan.json`, and themes.
- [themes/CONTRACT.md](../themes/CONTRACT.md): what a theme must style.
