# gentle-decks

**Ask your agent for a presentation. Get one HTML file you can present anywhere.**

Works in [Gentle Shell](https://github.com/Gentleman-Programming/gentle-shell)
and [Pi](https://pi.dev). The agent writes the slides in markdown; the renderer
handles layout, theme and navigation, and produces one self-contained HTML file
with no external requests.

<p align="center">
  <img src="https://raw.githubusercontent.com/WilberC/gentle-decks/main/docs/images/studio-grid.png" alt="The studio: outline on the left, live slide grid in the center, comments on the right" width="100%" />
  <br />
  <sub>The studio: edit the outline, watch the slides fill in, comment on any slide.</sub>
</p>

## Quick start

```bash
# Gentle Shell
gentle-shell install npm:gentle-decks

# Pi
pi install npm:gentle-decks
```

To try unreleased changes from `main`, install from Git instead:
`pi install git:github.com/WilberC/gentle-decks`.

Restart the session (or `/reload`) and ask: *"Make a presentation about …"*.
Requires Node.js 18 or later.

## What you get

| Feature | What it does |
| --- | --- |
| **Guided flow** | The agent asks about audience, goal and length, proposes an outline, then writes slide by slide. Every content slide carries a visual element: figures with embedded images, charts, terminal blocks, structured layouts. |
| **Studio** | A local web app to edit the outline, pick a theme, and comment on slides while the agent writes. Comments go one by one or in batches; a banner shows the writing queue; approving hands delivery to the agent and shuts the studio down. |
| **One file out** | Theme CSS, navigation and every image are inlined (self-contained HTML, so PDF export never loses images), with slides in the established outline order. Arrows or swipe to navigate, `F` fullscreen, `P` to export to PDF from the browser, `decks pdf` to print the static PDF straight from the CLI, plus an Export download from the studio. |
| **Small diffs** | The same markdown always renders byte-identical HTML, so a fix is an edit to one slide. |
| **Themes** | `gentleman-cute`, `fair-test` and `fair-test-gentle`, or have the agent propose a new one for your topic — from the chat, from a reference image or PDF, or designed as visual directions on the gentle-design canvas before it becomes CSS. Manage your own in the studio's **Mis estilos** view ([where themes live](docs/themes.md)). |

What the rendered slides look like (`gentleman-cute` theme):

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/WilberC/gentle-decks/main/docs/images/slide-cover.png" alt="Cover slide" /></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/WilberC/gentle-decks/main/docs/images/slide-cards.png" alt="Slide with two cards" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Cover slide</sub></td>
    <td align="center"><sub>Cards and a callout</sub></td>
  </tr>
</table>

## Learn more

| I want to… | Read |
| --- | --- |
| Write or fix slides by hand | [FORMAT.md](FORMAT.md) |
| Use the studio | [docs/studio.md](docs/studio.md) |
| Run the CLI directly | [docs/cli.md](docs/cli.md) |
| Make a theme | [themes/CONTRACT.md](themes/CONTRACT.md) |
| Where themes live, and keep my own | [docs/themes.md](docs/themes.md) |
| See what the agent does | [skill/gentle-decks/SKILL.md](skill/gentle-decks/SKILL.md) |
| Contribute or run the checks | [docs/development.md](docs/development.md) |

The canvas preview uses Gentle Shell's `gentle_design` tool; in plain Pi the
renderer and the studio work the same.

## License

MIT. See [LICENSE](LICENSE).

<a href="https://github.com/Gentleman-Programming/gentle-ai">
  <img width="220" src="https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png" alt="Built with Gentle-AI" />
</a>
