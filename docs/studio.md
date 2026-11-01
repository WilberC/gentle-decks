# Studio

The studio is a local web app for building a deck with the agent: you edit the
outline and comment on slides, and the agent writes the slides.

![Studio grid view](images/studio-grid.png)

## Start it

```bash
node bin/decks.js studio decks/<slug>    # needs decks/<slug>/plan.json
npm run studio:demo                      # eight-slide demo plan in decks/demo/
```

It prints `studio: http://127.0.0.1:<port>/<token>/`. The studio listens only on
127.0.0.1, and the URL carries a random token created at each start.

## Layout

| Area | What you do there |
| --- | --- |
| **Outline** (left, always visible) | See every slide with its thumbnail, status (`pendiente`, `escribiendo…`, `lista`, `no cabe`) and open comments. Edit text, add, merge, move, delete, or comment in place. |
| **Center** | **Estilo**: theme previews rendered with your outline, plus Generate. **Slide**: the selected slide with Ver / Comentar / Editar modes, a layout switch and an overflow warning. **Grid**: every slide, filling in live as the agent writes. |
| **Comments** (right) | One thread per slide. The agent answers in the same thread. |

Keyboard shortcuts on the focused outline row: `e` edit, `↑↓` select,
`Alt+↑↓` move, `m` merge, `c` comment, `a` add, `Delete` remove.

## Skins and URLs

- Two skins: **Gentle** (default, the Gentle brand palette) and **Flat** (the
  Gentle Shell terminal palette). Switch in the header; the choice is
  remembered. `?skin=flat` forces it.
- Append `#style`, `#slide`, or `#grid` to open a view (`#plan` and `#editor`
  still work).

## How the agent sees your actions

The studio writes `plan.json` and text edits directly. Everything that needs
writing (generate, comments, redo, layout, new slides, overflow) is queued in
`requests.json` and printed as `request <id> <kind> <slide>`. The agent handles
each one and answers with `studio reply` or `studio resolve --reply`; see
[cli.md](cli.md) for the commands and the
[skill](../skill/gentle-decks/SKILL.md) for what the agent does per request.

## Themes

Bundled themes: `gentleman-cute`, `fair-test` (bright, white, rainbow method
stages) and `fair-test-gentle` (the same structure in Gentle colors). A deck
can ship its own in `decks/<slug>/themes/` (shown as *propuesto*), and your own
themes in `~/.config/gentle-decks/themes/` appear in every deck (shown as *mío*);
see [themes.md](themes.md) for where themes live and the lookup order. Themes must follow
[themes/CONTRACT.md](../themes/CONTRACT.md).
