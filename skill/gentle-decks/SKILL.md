---
name: gentle-decks
description: "Trigger: make a presentation, slides, deck, talk, pitch, Gamma-style deck, presentación, diapositivas. Write a markdown deck, render it with gentle-decks, preview each slide on the gentle-design canvas, and apply canvas comments slide by slide."
license: MIT
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
- Every content slide carries one visual element: a `::: figure` image, a
  `bars`/`stat`/`term` component, a table, or a structured layout (`steps`,
  `grid`). Never deliver a run of text-only slides; prefer a figure whose data
  comes from the slide's own text. Reference real image files under the deck
  directory (`images/...`) or http(s) URLs: builds embed images as data URIs,
  so exports and PDFs keep them.
- Write the deck in the language the user asked for; set `lang:` to match.
- Iterating edits only the slides concerned. Never rewrite the whole deck to fix one slide.

## Paths

| Thing | Path |
| --- | --- |
| Renderer CLI | `node <decks-repo>/bin/decks.js` |
| Format contract | `<decks-repo>/FORMAT.md` |
| Outline | `decks/<slug>/plan.json` in the current project |
| Deck source | `decks/<slug>/<slug>.md` in the current project |
| Studio | `node <decks-repo>/bin/decks.js studio decks/<slug>` |
| Proposed themes | `decks/<slug>/themes/<name>.css` |
| User themes (every deck) | `$GENTLE_DECKS_THEMES`, else `$XDG_CONFIG_HOME/gentle-decks/themes`, else `~/.config/gentle-decks/themes` |
| Canvas preview (optional) | `design/<slug>/` (generated with `--design`) |
| Presentation file | `decks/<slug>/<slug>.html` (generated with `-o`) |

`<decks-repo>` is the gentle-decks package root: the directory two levels above
this skill's folder (`<skill dir>/../..`), which holds `bin/decks.js` and `FORMAT.md`.
Resolve it to an absolute path once per session and use that path in every command;
it works the same for an npm, git, or local install and for a source checkout.
Read its `FORMAT.md` before writing the first slide of a session.

## Flow

1. **Brief.** This is always the first thing the flow does, before any outline
   or markdown. When the request does not name a topic, ask for it in one plain
   chat question and wait. With the topic known, ask the approach questionnaire
   below in a single `ask_user_question` call, then wait for the answers.
   Language and source material (files, notes, repository) come from the
   request or the conversation; ask about them only when they are missing and
   matter for the content.
2. **Outline ("Crear esquema").** Choose a kebab-case slug and write
   `decks/<slug>/plan.json` (see `FORMAT.md`, "Plan file"): the questionnaire
   answers as `audience`/`goal`, one entry per slide with a stable kebab-case
   `id` named after its idea, `title`, `points`, and the planned `layout`
   (`card`, `steps`, `bars`, …). Run `plan check` until it prints `ok`.
3. **Look and feel.** Offer the bundled themes (`fair-test` for bright,
   classroom-friendly decks; `fair-test-gentle` and `gentleman-cute` for Gentle
   decks) and, when none fits, propose one or two more for this topic and audience: write each as `decks/<slug>/themes/<name>.css`
   following `themes/CONTRACT.md`, and run `theme check decks/<slug>/themes/<name>.css`
   until it prints `ok`. Keep the existing themes as options; the studio also
   lists the user's own themes from the user themes directory. When the user
   wants to reuse a proposed theme in other decks, copy it into the user themes
   directory (create it if needed) only after they confirm the destination.
4. **Open the studio.** Start it in the background and watch its output:
   `node <decks-repo>/bin/decks.js studio decks/<slug>` prints
   `studio: http://127.0.0.1:<port>/<token>/`, then one `request <id> <kind> <slide>`
   line per user action. Use a monitor (for example the `monitor` tool on that
   command) so each line reaches you as it happens. Give the user the URL.
   The studio is one workspace: the outline stays on the left, the center
   switches between Estilo, Slide and Grid, and comments are threads on the right.
   Before generation the user edits the outline (text, add, merge, move,
   delete, comment) and picks a theme; the studio writes `plan.json` directly.
   Without the studio (no browser), show the outline as a numbered list in chat
   and apply the user's changes to `plan.json` yourself.
5. **Generate** (request `generate`, or approval in chat). Re-read `plan.json`
   (the user may have changed it), run
   `node <decks-repo>/bin/decks.js plan scaffold decks/<slug>/plan.json -o decks/<slug>/<slug>.md`,
   then write the slides **one at a time in order**, saving the deck after each
   one, so the studio grid fills live. Honor each slide's `notes` and planned
   `layout`; never change an `id:` line. After writing, rebuild once with `-o`
   to catch `build failed` errors and fix the reported slide.
6. **Refine.** Handle every open request (below) as it arrives, then resolve it.
7. **Deliver.** `node <decks-repo>/bin/decks.js decks/<slug>/<slug>.md -o decks/<slug>/<slug>.html`
   produces the single navigable file (arrows/swipe, `F` fullscreen, `P` PDF export;
   images embedded as data URIs, slides in the established plan order).
   The studio's **Present** link shows the same file live. When the user posts an
   `approve` request (the **✓ Aprobar y cerrar** button), deliver the final file, resolve
   the request, and stop the studio: `node <decks-repo>/bin/decks.js studio stop decks/<slug>`.

## Delegation (keep the orchestrator thin)

The orchestrating agent owns the conversation, the studio lifecycle, and
acceptance. Heavy production work goes to subagent workers so the main
context stays small (S16):

- **Generate (step 5):** delegate the slide writing in sequential batches of
  3–5 slides. Give each worker the deck file path, the exact plan entries
  (`id`, `title`, `points`, `notes`, `layout`) for its batch, the
  `FORMAT.md` path, and the visual rule; the worker writes its slides to the
  markdown and saves. Batches run in order (never in parallel: one shared
  file), so the studio grid still fills live between batches. The
  orchestrator reads the result, rebuilds with `-o` once at the end, and
  fixes any `build failed` line itself or with a follow-up worker.
- **Refine (step 6):** when several requests queue up, delegate their
  application to one worker: pass the open-requests JSON (`studio requests`),
  the relevant slide excerpts, and `FORMAT.md`; the worker edits, rebuilds to
  verify, and resolves each id with `studio resolve … --reply`. The
  orchestrator reads the worker's summary and reports to the user.
- **Never delegate:** the brief, the questionnaire, chat replies, theme
  selection with the user, and the final delivery decision.

## Studio requests

The studio queues user actions in `decks/<slug>/requests.json`.
`node <decks-repo>/bin/decks.js studio requests decks/<slug>` prints the open ones as
JSON; `studio resolve decks/<slug> <id...>` closes them. Read the open list
after every `request …` line and whenever you resume.

The user sees comments as a thread per slide. Answer every `comment`, `redo`,
`layout`, and `add-slide` request in that thread: `studio reply decks/<slug> <id> "<text>"`
while you work (for example a question or what you plan), and
`studio resolve decks/<slug> <id> --reply "<what you changed>"` when it is saved.
Keep replies to one or two sentences in the user's language.

| Kind | What to do |
| --- | --- |
| `generate` | Step 5. |
| `comment` | Apply the comment to the slide `slideId` (plan stage: to `plan.json`; after generation: to that slide's markdown). `excerpt`/`selector` point at the element. |
| `redo` | Rewrite slide `slideId` following `text`; keep its `id:`. |
| `layout` | Rewrite slide `slideId` with the container `layout`, keeping its content. |
| `add-slide` | Add a slide after `slideId` about `text`, in `plan.json` and in the deck, with a new unique id. |
| `overflow` | Slide `slideId` is taller than 1600×900: shorten it or split it into two slides. |
| `move` | Slide `slideId`: the user dragged an element in Edit mode; `selector`/`excerpt` name it. Move that element in the slide's markdown (reorder the block), keeping its content. |
| `propose-style` | Theme work, by `mode`: `new` proposes a theme for this deck (honor `text` as the look; there is no `theme` field); `improve` edits the CSS of `theme` following `text` (may be empty); `comment` answers the user's `text` about `theme`. Write the CSS to `decks/<slug>/themes/<name>.css`, follow `themes/CONTRACT.md`, and run `theme check decks/<slug>/themes/<name>.css` until it prints `ok`. |
| `propose-style` with `reference` | The same request may also carry `reference`, a path relative to the deck dir (e.g. `references/marca.png`): the user attached that image or PDF in the studio. Read the file **before** writing the CSS — an image: look at it and derive its palette, typography and character; a PDF: extract its palette and visual hierarchy. Then write the theme as above and run `theme check` as usual. |
| `approve` | The user approved the deck: deliver the final file (`-o` build), resolve the request with what was delivered, then stop the studio with `decks studio stop <deck-dir>`; the URL stops working. |

A `propose-style` request has no slide, so it never appears in a slide thread:
answer it with `studio reply` on its own id and resolve it once the CSS is written
and checked. Never pick the new theme for the user either: the studio lists it as
*propuesto* and the user chooses it.

Text edits made in the studio's Edit mode are already written to the deck; do
not undo them. Resolve each request only after the change is saved; leave a
request open and reply in its thread with why when you cannot apply it.

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

## Canvas comments (optional gentle-design preview)

The studio is the default preview. When the user prefers the gentle-design
canvas, build with `--design design/<slug>` and open it with the `gentle_design`
tool (`action: "open"`).


Comments live in `design/<slug>/comments.json`. Each comment's `file` is a slide
artboard: `slides/<id>.html` is the slide whose `id:` directive is `<id>`
(`slide-N` when the slide has none).

1. List open comments with the `gentle_design_comments` tool (`action: "list"`, `slug`).
2. For each comment: find the slide with that id in the markdown, locate the element with
   `excerpt` (the text the user clicked) and `selector`, and edit only that slide.
   Look at `screenshot` first when present.
3. Rebuild with `--design`, refresh the canvas, then resolve the applied ids with
   `gentle_design_comments` (`action: "resolve"`, `slug`, `ids`). Leave comments you
   did not apply open and say why.

Moving, adding, or removing slides never re-targets a comment, because file
names follow the id. Deleting a slide removes its artboard: resolve or report
its open comments first.

## Output Contract

Return: the slug, the slide count, the files changed this turn, the studio URL,
the request (or canvas comment) ids resolved this turn, and any open question.
