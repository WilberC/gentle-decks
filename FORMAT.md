# Deck format: markdown → presentation

A deck is one markdown file that renders to one self-contained HTML file
(theme CSS + navigation JS inlined, no external requests).

## File layout

```
---
title: Deck title
theme: gentleman-cute   # themes/<name>.css
brand: gentle-decks     # bottom-left brand, optional
brief: One-line purpose # canvas design.json brief, optional
lang: es
---

<slide 1 body>

---

<slide 2 body>
```

## Slides

A top-level `---` (thematic break on its own line) separates slides.
The first slide is the deck cover when it declares `class: cover`.

### Slide directives

Optional `key: value` lines at the start of a slide, before the first blank
line. Unknown keys are ignored.

| Directive | Effect |
| --- | --- |
| `kicker: TEXT` | Small uppercase label at the top of the slide. |
| `class: cover` (space-separated list) | Extra classes on the `<section>`. `cover` also adds falling petals. |
| `lead: TEXT` | Intro paragraph under the title (`.lead`). |
| `id: TEXT` | Stable slide id: lowercase letters, digits, hyphens, starting with a letter. Defaults to `slide-N`. Invalid or duplicate ids fail the build with the slide number. Keep it when moving slides: design artboards and comments follow the id. |
| `layout: TEXT` | Planned component (from `plan.json`); a hint for the writer, not rendered. |

## Markdown mapping

| Markdown | HTML |
| --- | --- |
| `# H1` | `<h1>` (cover title) |
| `## H2` | `<h2>` (slide title) |
| `### H3` | `<h3>` (card/step titles) |
| paragraph | `<p>` |
| `> quote` | `<p class="quote">` |
| pipe table | `<div class="table-wrap"><table>…` |
| `**bold**`, `_em_`, `` `code` ``, `[link](url)` | standard HTML |

### Inline color tokens

`[[class|text]]` → `<span class="class">text</span>`, usable anywhere
including inside `[[...]]`-free markdown. Common classes: `pink`, `gold`,
`mint`, `blue`, `rose`, `peach`, `red`, `muted`, `dim`, `grad`.

## Containers

```
::: name modifier key=value
inner markdown
:::
```

Open with `::: name` plus optional modifiers/attrs, close with a bare `:::`.
Nesting is supported (a container inside a container).

| Container | Children |
| --- | --- |
| `grid-2` / `grid-3` / `grid-4` | Cards, lists, any blocks. Modifier `cards` sets `align-items: stretch`. |
| `split` | Two blocks: left (narrow) and right (wide). |
| `card` `accent` `icon=🎲` | Markdown; `icon=` prepends the icon span. |
| `step` `num=01` `title=Explora` `hl` `bad` | Body becomes the small description. |
| `steps` | Three or more `step` children. |
| `term` | Terminal lines; inline tokens `[[c\|comment]]`, `[[p\|$]]`, `[[k\|Key]]`, `[[s\|string]]`, `[[e\|error]]`. |
| `bars` | List items: `- Label \| 85 \| good` (tone: `good`, `mid`, `bad`). |
| `stat` `big=4.2x` `small=más rápido` | Big number with a caption. |
| `pills` | List items, one pill each. |

## Example slide

```
---

kicker: El problema
class:

## Delegar por costumbre **sale caro**

::: split
- Nuestras reglas asumen lectura de uno a dos minutos.
- Delegar trabajo pequeño cuesta **más**.
::: card accent icon=⚡
### Lo que medimos
[[mint|Una sola razón]] hizo las tareas varias veces más rápidas.
:::
:::

> Delegar es una decisión, no un reflejo.
```

## Plan file (`plan.json`)

The outline the studio and the agent share before any slide is written.

```json
{
  "version": 1,
  "title": "Por qué empezar con Python",
  "topic": "Python para principiantes",
  "audience": "Estudiantes sin experiencia",
  "goal": "Confianza para dar sus primeros pasos",
  "lang": "es",
  "theme": "gentleman-cute",
  "slides": [
    { "id": "cover", "title": "Por qué empezar con Python", "points": ["Una primera lengua para pensar con código"] },
    { "id": "first-win", "title": "La primera victoria llega rápido", "points": ["Sintaxis clara"], "notes": "Comment for the writer", "layout": "grid-2" }
  ]
}
```

Required: `title`, a non-empty `slides`, and each slide's `id` (same rules as
the `id:` directive, unique) and `title`. Titles, points, and metadata are
single-line; points must not start with `---` or `:::`.

- `decks plan check <plan.json>` prints `ok: <N> slides`, or one
  `plan.json: <path>: <problem>` line per problem and exits 1.
- `decks plan scaffold <plan.json> -o <deck.md>` writes a buildable deck: the
  frontmatter carries title, goal (as `brief`), theme, and lang; each slide
  gets `id:`, an optional `layout:`, its title as `#` (cover) or `##`, and its
  points as bullets. It refuses to overwrite an existing file.

## Themes

`themes/CONTRACT.md` lists the selectors every theme must style.
`decks theme check <name|path.css>` prints `ok: <name>` or the missing selectors.
A deck's `theme:` is looked up in `<deck dir>/themes/<name>.css` first, then in
the repository `themes/`; a missing theme fails the build with
`build failed: theme not found: <name>`.

## Deck directory and studio

`decks/<slug>/` holds `plan.json`, the deck `<slug>.md`, optional proposed
themes in `themes/`, and the studio's `requests.json` queue.
`decks studio decks/<slug>` serves the studio on 127.0.0.1 and prints its URL;
see README "Studio" and `odd/tasks/deck-studio-ui.md` (S5-S12) for the API.

## Renderer contract

- `node bin/decks.js <deck.md> -o <out.html>` writes the HTML file and prints
  `<N> slides -> <absolute path>`.
- `node bin/decks.js <deck.md> --design <dir>` writes `slides/<id>.html` per
  slide (static, no script, 1600×900, `data-slide="N"` and `data-slide-id` on
  the section) plus `design.json` for the canvas, in deck order with titles
  `NN · <title>`. Moving a slide keeps its file name. Stale `slides/*.html`
  files are removed; other files such as `comments.json` are kept.
- Exactly one of `-o` or `--design` is required; otherwise the CLI prints the
  usage (all commands) and exits 2.
- Same input → byte-identical output (deterministic; no timestamps).
- Unknown container names fail the build with the slide number (exit 1,
  nothing written), so a typo in the markdown never produces a silently
  broken deck.
