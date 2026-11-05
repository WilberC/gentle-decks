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
| **Center** | **Estilo**: theme previews rendered with your outline, **✦ Proponer estilo**, and Generate; click a style to open its detail (big preview, component examples, choose / comment / improve). **Ver en gentle design ↗** opens the canvas in its own tab once its URL is saved (see below). **Mis estilos**: your own themes with Elegir / Borrar, and this deck's proposals with **Guardar como mío**. **Slide**: the selected slide with Ver / Comentar / Editar modes, a layout switch and an overflow warning. **Grid**: every slide, filling in live as the agent writes. |
| **Comments** (right) | One thread per slide. The agent answers in the same thread. |

Keyboard shortcuts on the focused outline row: `e` edit, `↑↓` select,
`Alt+↑↓` move, `m` merge, `c` comment, `a` add, `Delete` remove.

## Skins and URLs

- Two skins: **Gentle** (default, the Gentle brand palette) and **Flat** (the
  Gentle Shell terminal palette). Switch in the header; the choice is
  remembered. `?skin=flat` forces it.
- Append `#style`, `#mine`, `#slide`, or `#grid` to open a view (`#plan` and
  `#editor` still work).

## How the agent sees your actions

The studio writes `plan.json` and text edits directly. Everything that needs
writing (generate, comments, redo, layout, new slides, overflow, style proposals)
is queued in `requests.json` and printed as `request <id> <kind> <slide>`. The agent handles
each one and answers with `studio reply` or `studio resolve --reply`; see
[cli.md](cli.md) for the commands and the
[skill](../skill/gentle-decks/SKILL.md) for what the agent does per request.

| Kind | Fields | What the agent does |
| --- | --- | --- |
| `generate` | — | Writes the pending slides in plan order. |
| `comment` | `slideId`, `text`, `selector`, `excerpt` | Applies the comment to that slide. |
| `redo` | `slideId`, `text` | Rewrites the slide, keeping its id. |
| `layout` | `slideId`, `layout` | Rewrites the slide with another container. |
| `add-slide` | `slideId`, `text` | Adds a slide after that one, in the plan and the deck. |
| `overflow` | `slideId` | Shortens or splits a slide that does not fit 1600×900. |
| `move` | `slideId`, `selector`, `excerpt` | The user dragged an element in the slide's Edit mode; move that block in the markdown, keeping its content. |
| `propose-style` | `mode` (`new`, `improve`, `comment`), `theme`, `text`, `reference` | Writes `decks/<slug>/themes/<name>.css`: a new theme, an improvement of `theme`, or the answer to your comment about `theme`. With `reference`, the agent reads that image or PDF (`references/<name>` inside the deck dir) before writing the CSS. |
| `approve` | — | The user approved the deck: deliver the final `-o` file, resolve the request, then stop the studio (`decks studio stop <deck-dir>`); the URL stops working. |

## Themes

Bundled themes: `gentleman-cute`, `fair-test` (bright, white, rainbow method
stages) and `fair-test-gentle` (the same structure in Gentle colors). A deck
can ship its own in `decks/<slug>/themes/` (shown as *propuesto*), and your own
themes in `~/.config/gentle-decks/themes/` appear in every deck (shown as *mío*);
see [themes.md](themes.md) for where themes live and the lookup order. Themes must follow
[themes/CONTRACT.md](../themes/CONTRACT.md).

**Proponer estilo**: the button next to the theme cards asks the agent for a new
theme for this deck; the optional instructions describe the look you want. The
result appears as *propuesto* as soon as the agent writes the CSS.

**From a reference**: **📎 con referencia** next to it opens a file picker
(images and PDF), uploads the file to `decks/<slug>/references/` and then asks
for the same optional instructions; the request carries `reference`, so the
agent looks at the image (palette, typography, character) or extracts the
palette and hierarchy from the PDF before writing the CSS.

**Theme detail**: clicking a card opens the style on its own stage with the first
slides rendered in it, the components the theme contract requires (`card`, `step`,
`bars`, `stat`, `term`, `pills`, `figure`) as a plain legend, and four actions:
**Elegir este estilo** sets `plan.theme`; **Comentar este estilo**,
**Mejorar este estilo** and **📎 Mejorar con referencia** queue a `propose-style`
request for that theme, so the agent edits its CSS instead of a slide.
**← Volver a los estilos** returns to the cards.

**Mis estilos** (`#mine`): the themes in your user themes directory (`Elegir`,
`Borrar` with a confirmation). Below them this deck's own proposals appear with
**Guardar como mío**, which copies `decks/<slug>/themes/<name>.css` into the
user themes directory so it stays available in every deck; promoting twice
overwrites the user's copy. `Borrar` removes only your copy: a deck theme or a
bundled theme with that name is never touched, and deleting the chosen style
(`plan.theme`) stops the previews from resolving until you choose another one.
Bundled themes are read-only and are not listed there.

## Canvas de gentle design

The visual workshop designs a theme on the gentle-design canvas. The canvas runs
on its own loopback port, and its page refuses to be framed
(`frame-ancestors 'none'`), so the studio cannot embed it: instead the studio
stays the home and links to it. **Estilo** shows **Ver en gentle design ↗**,
which opens the canvas in another tab; closing that tab returns to the studio
with the deck, the view and the comment drafts exactly as they were.

The URL is the one the agent prints when it opens the canvas
(`http://127.0.0.1:<port>/<token>/…`). Paste it into the dialog once: the studio
keeps it in `.studio-canvas` next to `plan.json`, for that deck. Only loopback
`http(s)` URLs with the canvas token path are accepted.

Before offering the link the studio asks the canvas whether it still answers.
When it does not — the canvas was closed, or restarted with a new token — the
action becomes a plain button that asks for the URL again, with the reason in
place (no dead link, nothing embedded). **cambiar URL** replaces a saved link,
and **comprobar** asks again.
