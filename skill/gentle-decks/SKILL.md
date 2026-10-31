---
name: gentle-decks
description: "Trigger: make a presentation, slides, deck, talk, pitch, Gamma-style deck, presentación, diapositivas. Write a markdown deck, render it with gentle-decks, preview each slide on the gentle-design canvas, and apply canvas comments slide by slide."
license: Apache-2.0
metadata:
  author: wilber
  version: "0.1"
---

## Activation Contract

Use this skill when the user asks for a presentation, slides, a deck, or a talk.
The agent writes content; the renderer owns layout, theme, and navigation.
Do not hand-write slide HTML and do not use gentle-design artboards for decks.

## Hard Rules

- The source of truth is one markdown file that follows `FORMAT.md` of the
  gentle-decks repository. Never edit generated HTML; edit the markdown and rebuild.
- Use only the containers, directives, and color tokens listed in `FORMAT.md`.
  An unknown container fails the build: fix the markdown, never work around it.
- Realistic content for the stated audience; no lorem ipsum.
- One idea per slide. A slide that needs scrolling at 1600×900 is too dense: split it.
- Write the deck in the language the user asked for; set `lang:` to match.
- Iterating edits only the slides concerned. Never rewrite the whole deck to fix one slide.

## Paths

| Thing | Path |
| --- | --- |
| Renderer CLI | `node <decks-repo>/bin/decks.js` |
| Format contract | `<decks-repo>/FORMAT.md` |
| Deck source | `decks/<slug>/<slug>.md` in the current project |
| Canvas preview | `design/<slug>/` (generated with `--design`) |
| Presentation file | `decks/<slug>/<slug>.html` (generated with `-o`) |

`<decks-repo>` is the gentle-decks checkout (currently `~/Projects/Personal/gentle-decks`).
Read its `FORMAT.md` before writing the first slide of a session.

## Flow

1. **Brief.** This is always the first thing the flow does, before any outline
   or markdown. When the request does not name a topic, ask for it in one plain
   chat question and wait. With the topic known, ask the approach questionnaire
   below in a single `ask_user_question` call, then wait for the answers.
   Language and source material (files, notes, repository) come from the
   request or the conversation; ask about them only when they are missing and
   matter for the content.
2. **Outline ("Crear esquema").** With the answers, propose a numbered outline: one line per slide with its title,
   its one idea, and the component you plan to use (`card`, `steps`, `bars`, …).
   Wait for the user to approve or edit it. This is the Gamma "outline" step;
   skip it only when the user says to go straight to the deck.
3. **Write.** Choose a kebab-case slug and write `decks/<slug>/<slug>.md` with
   frontmatter (`title`, `brief`, `theme`, `brand`, `lang`). The first slide is
   the cover (`class: cover`).
4. **Build for the canvas.**
   `node <decks-repo>/bin/decks.js decks/<slug>/<slug>.md --design design/<slug>`
   writes `NN-slide.html` per slide plus `design.json`. On `build failed`, fix
   the reported slide and rebuild.
5. **Preview.** Call the `gentle_design` tool with `action: "open"` and the slug,
   and report the URL. Call it again after every rebuild to refresh the tab.
6. **Iterate.** Apply chat feedback or canvas comments (below), rebuild, refresh.
7. **Deliver.** `node <decks-repo>/bin/decks.js decks/<slug>/<slug>.md -o decks/<slug>/<slug>.html`
   produces the single navigable file (arrows/swipe, `F` fullscreen, `P` PDF export).

## Approach questionnaire

One `ask_user_question` call with exactly these three questions, in this
order, written in the user's language. Every option is specific to the topic:
never generic labels such as "Beginners" without saying beginners at what.

| Header | Question | Options (3, single-select) |
| --- | --- | --- |
| `Audiencia` | Who is the presentation for? | Three distinct audiences for this topic, from least to most experienced |
| `Objetivo` | What should the audience take away? | Three distinct takeaways: e.g. confidence to start, a practical comparison, motivation to apply it |
| `Extensión` | How long should it be? | `Vista rápida — 8 diapositivas`, `Presentación estándar — 12 diapositivas`, `Explicación completa — 16 diapositivas` |

- Put the option you recommend first and say why in its description.
- Do not add an "Other" option: the tool's free-text row already covers it.
  A typed answer replaces that question's options; for `Extensión` it is a
  custom slide count.
- Header labels stay at most 16 characters and option labels at most 60.
- Without `ask_user_question`, show the same three questions as numbered lists
  in chat, each ending with "Otra: …", and wait for the reply.
- The answers drive the outline: audience sets depth and vocabulary,
  takeaway sets the closing slide and the story arc, length sets the slide
  count including the cover.

## Canvas comments

Comments live in `design/<slug>/comments.json`. Each comment's `file` is a slide
artboard: `NN-slide.html` is slide `NN` of the markdown, counting the cover as 01
(slides are separated by top-level `---` after the frontmatter).

1. List open comments with the `gentle_design_comments` tool (`action: "list"`, `slug`).
2. For each comment: find slide `NN` in the markdown, locate the element with
   `excerpt` (the text the user clicked) and `selector`, and edit only that slide.
   Look at `screenshot` first when present.
3. Rebuild with `--design`, refresh the canvas, then resolve the applied ids with
   `gentle_design_comments` (`action: "resolve"`, `slug`, `ids`). Leave comments you
   did not apply open and say why.

Adding or removing a slide renumbers the ones after it. Apply comments that
reference later slides before inserting or deleting slides, or recompute their numbers.

## Output Contract

Return: the slug, the slide count, the files changed this turn, the canvas URL,
the comment ids resolved this turn, and any open question.
