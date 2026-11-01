# Development

## Setup

```bash
git clone https://github.com/WilberC/gentle-decks.git
cd gentle-decks
npm install
pi -e ./          # load this checkout as a Pi package for one session
```

## Checks

| Command | What it runs |
| --- | --- |
| `npm run check` | Structural checks and the `node:test` suites in `checks/` |
| `npm run smoke:ui` | Drives the whole studio in a headless Edge, Chrome or Chromium (`BROWSER=<path>` to choose) and checks the files it writes; skips when no browser is found |
| `npm run build:sample` | Rebuilds `decks/sample/gentle-decks.html`, the committed fixture |

## Repository layout

| Path | Purpose |
| --- | --- |
| `bin/decks.js` | CLI entry |
| `src/parse.js` | Frontmatter, slide splitting, container tree |
| `src/render.js` | Markdown and containers → slide HTML |
| `src/design.js` | Per-slide canvas artboards and `design.json` |
| `src/plan.js` | `plan.json` validation and deck scaffolding |
| `src/theme.js` | Theme contract check |
| `src/deck-nav.js` | Inlined navigation engine (keyboard, swipe, print) |
| `src/studio/` | Studio server, API, requests queue, text edits |
| `studio/` | Studio web UI (no dependencies, no build) and artboard inspector |
| `themes/` | Deck themes (one CSS file each) |
| `skill/gentle-decks/` | Agent skill, loaded when the package is installed |
| `decks/sample/` | Sample deck used as the format fixture |
| `decks/demo/` | Demo outline for `npm run studio:demo` |
| `design/` | gentle-design sources for the studio skins and bundled themes |
| `checks/` | Structural verification and `node:test` suites |
| `docs/` | Reference docs and README images |

## Published package

`package.json` `files` limits the npm package to the runtime: `bin`, `src`,
`studio`, `themes`, `skill`, `FORMAT.md`, `README.md` and `LICENSE`. Check it
with `npm pack --dry-run`.
