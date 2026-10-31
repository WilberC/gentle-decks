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

## Renderer contract

- `node bin/decks.js <deck.md> -o <out.html>` writes the HTML file and prints
  `<N> slides -> <absolute path>`.
- `node bin/decks.js <deck.md> --design <dir>` writes `NN-slide.html` per slide
  (static, no script, 1600×900, `data-slide="N"` on the section) plus
  `design.json` for the gentle-design canvas. Slide `NN` is the NN-th slide of
  the markdown, cover included. Stale `NN-slide.html` files are removed; other
  files such as `comments.json` are kept.
- Exactly one of `-o` or `--design` is required; otherwise the CLI prints
  `usage: decks <deck.md> (-o <out.html> | --design <dir>)` and exits 2.
- Same input → byte-identical output (deterministic; no timestamps).
- Unknown container names fail the build with the slide number (exit 1,
  nothing written), so a typo in the markdown never produces a silently
  broken deck.
