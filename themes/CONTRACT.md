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
- `@media print` lays out one slide per page at 1600×900.
- `prefers-reduced-motion` disables slide transitions and decorative motion.
- WCAG AA contrast for text on its background.

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
