# Theme contract

A theme is one CSS file, `<name>.css` (lowercase letters, digits, hyphens),
in a deck's `themes/`, your personal themes directory, or the built-in
`themes/` (see [docs/themes.md](../docs/themes.md)). The renderer inlines it into every deck and design artboard, so any
theme can render any deck. `decks theme check <name>` verifies the selectors
below; a theme missing one fails the check.

## Rules

- Self-contained: no `@import`, `url(http…)`, remote fonts, or images. System
  font stacks only.
- The deck must work at 1600×900 (design artboards and print) and on phones.
- `@media print` lays out one slide per page at 1600×900. Keep print output crisp:
  drop decorative shadows and blur-heavy effects there — the browser rasterizes
  them at low print DPI and the export reads as blurry next to the web preview.
- `prefers-reduced-motion` disables slide transitions and decorative motion.
- WCAG AA contrast for text on its background.
- Vertical rhythm: set a block gap on `.slide` (about 2vh). Themes reset
  margins, so without it bordered blocks, figures, and cards collapse against
  neighboring elements the moment a deck grows beyond plain text.
- Footer safe area: the `.slide` bottom padding must reserve the brand and
  counter zone (at least 8vh on screen): no slide content may render behind
  `.brand` or `.counter`, and nothing should sit so close to them that editing
  it would collide with the footer.

## Quality floor and craft ceiling

`decks theme check` enforces the selector list below: that is the **floor**.
The **ceiling** is the craft bar shared with the gentle:design skill, and it
is expected to rise as that skill improves. When drafting or reviewing a
theme, hold it to at least:

- Fluid type scale (`clamp()`) with a clear hierarchy: kicker, title, lead,
  body, caption — each step visibly distinct.
- One accent family plus a small set of supporting hues; color never replaces
  hierarchy.
- Consistent spacing rhythm (the `.slide` gap, container gaps) and a visible
  footer safe area.
- AA contrast for every text/background pair, including color tokens on cards.
- Motion is decorative only, brief, and disabled under
  `prefers-reduced-motion`.

### Typography

Type carries the first pass of hierarchy, so the scale is measured, not felt.
Check the ratios at 1600×900, the widest render.

- Step ratios against body text: `h1` ≥ 3×, `h2` ≥ 1.8×, `h3` ≥ 1.25×. `h3`
  is never smaller than body text; an `h3` that matches `p` reads as a bold
  paragraph, which is the most common way a deck loses its outline.
- Weight ladder: headings at 700 or above, prose at 400, and at least 200
  between a heading and the prose under it. Neighboring levels that differ by
  only 100 weight read as the same level.
- `.lead` keeps a size step over body (≥ 1.2×) and a weight step (≥ 500). A
  muted lead is allowed only with that weight step, because a dimmer lead at
  body weight reads as de-emphasis rather than hierarchy.
- Family variety: at least two families with distinct jobs — a display/body
  family plus a mono (or serif) role that carries real content, such as
  kickers, measurements, captions, terminal lines, and table keys. A mono that
  appears once does not count, and the themes must differ from each other by
  scale, weight ladder, tracking, or leading rather than by palette alone.
- In the phone breakpoint the ratios may compress with the screen, but the
  order holds: `h3` and `.lead` stay above body text.

#### Emphasis pattern

Decks mark key words with `**strong**` and `_emphasis_` (see
[FORMAT.md](../FORMAT.md)), so a theme styles both instead of inheriting the
browser default:

- `strong` / `b` raise the weight by at least one step (≥ 700) and take
  `--ink`, the theme's highest-contrast text color. Emphasis is weight plus
  color, never color alone.
- `em` adds italic and the same `--ink` lift. Inside `h1`–`h3`, `em` may use
  the accent instead, because display sizes clear AA large-text contrast (3:1)
  even where the accent would fail at body size.
- Both marks keep AA contrast against their own background. A phrase in a
  specific accent color stays the job of the inline tokens (`.pink`, `.gold`,
  `.mint`, …).
- Components that already set a color on `b` for their own reason (`.step b`,
  `.brand b`) keep it; the pattern is for prose.

#### Tracking and leading floors

- Prose and lists: `line-height` ≥ 1.45, `letter-spacing` 0.
- Secondary and small roles (cards, table cells, captions, unit labels,
  `.step small`) set an explicit `line-height` ≥ 1.35. Never leave them at the
  browser's `normal`, whose value drifts with the font metrics and turns into
  uneven rhythm as soon as roles mix on a slide.
- Headings: `h1`/`h2` at 3rem and above use `line-height` ≤ 1.15 with tracking
  of `-.015em` or tighter; smaller headings keep `line-height` ≥ 1.15 and
  tracking within ±.02em, so the change in tightness does not read as a change
  of font.
- Uppercase labels (`.kicker`) need tracking ≥ .08em; prose and headings never
  take positive tracking, and no text renders below 0.8rem.

## Required selectors

| Group | Selectors |
| --- | --- |
| Deck frame | `.deck`, `.slide`, `.slide.active`, `.cover`, `.kicker`, `.lead`, `.quote`, `.table-wrap`, `.brand`, `.counter`, `.progress`, `.hint`, `.touch-nav`, `.petals` |
| Layouts | `.grid-2`, `.grid-3`, `.grid-4`, `.split`, `.steps` |
| Components | `.card`, `.card.accent`, `.icon`, `.step`, `.step.hl`, `.step.bad`, `.term`, `.bars`, `.bar-row`, `.bar-track`, `.bar-fill.good`, `.bar-fill.mid`, `.bar-fill.bad`, `.stat`, `.pill`, `.figure` |
| Color tokens | `.pink`, `.gold`, `.mint`, `.blue`, `.rose`, `.peach`, `.red`, `.muted`, `.dim`, `.grad` |

A theme may hide an element it does not use (for example `.petals { display: none; }`),
but it must still style it on purpose.

## Terminal tokens

Inside `.term`, the classes `.c` (comment), `.p` (prompt), `.k` (key),
`.s` (string), and `.e` (error) color terminal lines. Style them as
`.term .c` etc.

## Adding a theme

1. Copy `gentleman-cute.css` or write a new file under `themes/`.
2. Run `node bin/decks.js theme check <name>` until it prints `ok: <name>`.
3. Build the sample deck with `theme: <name>` and review it with `--design`.
