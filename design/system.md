# Design system — gentle-decks

Synced from the project's design sources. Values below are copied from the named files;
nothing here is invented. The studio UI is moving toward the Gentle Shell look, so the
Gentle Shell terminal palette is recorded as the reference for tool chrome.

Studio skins: **gentle** (default, Gentle brand from gentlemanprogramming.com) and **flat**
(Gentle Shell terminal palette). Both live in `design/_src/skins.css`; `design/_src/build.py`
inlines them into the studio artboards.

Sources read:

- gentlemanprogramming.com stylesheets `/_astro/business.*.css` — Gentle brand (herdr / st palettes, fonts, radii)

- `studio/studio.css` — current studio UI (light)
- `themes/gentleman-cute.css` — deck theme (slides only)
- Gentle Shell reference: `gentle-pi/themes/Gentle.json` (installed package, Pi terminal theme)

## Colors

### Gentle brand — skin `gentle` (source: gentlemanprogramming.com `/_astro/business.*.css`)

| Token | Value | Usage |
| --- | --- | --- |
| page bg | `#140a12` | App background (`body` on the site) |
| `--st-base` | `#1a1218` | Subtle panels |
| `--st-surface0` / `--herdr-surface-dim` | `#20161e` | Cards, rows |
| `--st-surface1` / `--herdr-surface0` | `#241822` | Selected row |
| `--st-surface2` / `--herdr-surface1` | `#342230` | Selection, strong border |
| `--tm-border` / `--tm-border-soft` | `#ffffff17` / `#ffffff0f` | Hairlines |
| `--herdr-text` | `#f6eff3` | Primary text |
| `--herdr-subtext0` | `#a78e9b` | Secondary text |
| `--st-subtext0` | `#76616b` | Muted text, decoration |
| `--herdr-accent` | `#f095c8` | Accent, primary action, focus |
| `--gentlepi-rose` | `#ff76c3` | Logo rose |
| `--herdr-mauve` | `#ffb1dd` | Soft accent |
| `--st-mauve` | `#d7a0b8` | Tags, headings |
| `--herdr-blue` | `#a9c7ee` | Links, info |
| `--herdr-green` | `#b4e7c7` | Success |
| `--herdr-yellow` | `#e0c27a` | Notes, highlights |
| `--herdr-peach` | `#f2b86d` | Warnings |
| `--herdr-red` | `#ff718f` | Errors, overflow |

Fonts: `--font-sans` `"Inter", "SF Pro Text", system-ui, …`; `--font-mono` `"IosevkaTerm NF", "Iosevka Term", "JetBrains Mono", ui-monospace, monospace`. Radii: `--shape-small` 8px, `--shape-medium` 12px, `--shape-large` 16px, `--shape-full` 999px.


### Gentle Shell terminal — skin `flat` (reference: `gentle-pi/themes/Gentle.json`)

| Token | Value | Usage |
| --- | --- | --- |
| `bg` | `#06080f` | App background, panels |
| `bgSubtle` | `#0d0f14` | Raised surfaces, tool output, info boxes |
| `userMessageBg` | `#161D2E` | Selected / active row background |
| `selection` | `#232A40` | Selection, hover |
| `border` | `#313342` | Panel borders |
| `borderSubtle` | `#232A40` | Dividers, quiet borders |
| `text` | `#F3F6F9` | Primary text |
| `muted` | `#5C6170` | Secondary text, hints (large text or decoration only: below AA on `bg` for body text) |
| `secondary` | `#A3B5D6` | Secondary readable text (AA on `bg`) |
| `heading` | `#B5B2D0` | Headings |
| `blue` | `#7FB4CA` | Accent: focus, links, active tool, borderAccent |
| `accent` (gold) | `#E0C15A` | Brand accent, primary call to action |
| `green` | `#B7CC85` | Success |
| `warning` | `#DEBA87` | Warnings, quotes |
| `red` | `#CB7C94` | Errors, overflow |
| `syntaxKeyword` | `#C99AD6` | Code keyword |
| `syntaxFunction` | `#B99BF2` | Code function |
| `syntaxString` | `#DFBD76` | Code string |
| `syntaxNumber` | `#A4DAA7` | Code number |
| `toolSuccessBg` | `#1a2e1a` | Success surface |
| `toolErrorBg` | `#2e1a1a` | Error surface |

### Current studio UI (`studio/studio.css`, to be replaced)

| Token | Value |
| --- | --- |
| `--bg` | `#f6f7fb` |
| `--panel` | `#ffffff` |
| `--ink` | `#14182b` |
| `--muted` | `#5a6078` |
| `--line` | `#dde1ee` |
| `--accent` | `#3b4fd8` |
| `--accent-soft` | `#eaedfd` |
| `--warn` / `--warn-soft` | `#8a5a00` / `#fff4dc` |
| `--bad` / `--bad-soft` | `#b3261e` / `#fde8e7` |
| `--ok` | `#1d6b3a` |

### Deck theme `gentleman-cute` (`themes/gentleman-cute.css`, slides only)

| Token | Value |
| --- | --- |
| `--bg` | `#060407` |
| `--panel` | `#100A0F` |
| `--user` | `#2A1523` |
| `--border` | `#563040` |
| `--text` | `#F6EFF3` |
| `--muted` | `#A78E9B` |
| `--accent` | `#F095C8` |
| `--champagne` | `#E0C27A` |
| `--mint` | `#B4E7C7` |
| `--powder-blue` | `#A9C7EE` |
| `--error` | `#FF718F` |

## Typography

| Role | Value | Source |
| --- | --- | --- |
| UI sans | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | `studio/studio.css` |
| UI mono | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | `studio/studio.css` |
| Deck sans | `"Inter", "SF Pro Display", -apple-system, "Segoe UI", system-ui, sans-serif` | `themes/gentleman-cute.css` |
| Deck mono | `"JetBrains Mono", "Iosevka", "SF Mono", ui-monospace, Menlo, monospace` | `themes/gentleman-cute.css` |
| Base size | `15px / 1.45` | `studio/studio.css` |
| H1 / H2 | `1.6rem` / `1rem` | `studio/studio.css` |
| Kicker | mono, `1.05rem`, `letter-spacing: .18em`, uppercase | `themes/gentleman-cute.css` |

## Spacing, radius, shadow

| Token | Value | Source |
| --- | --- | --- |
| `--radius` (studio) | `12px` | `studio/studio.css` |
| Card radius (deck) | `18px` | `themes/gentleman-cute.css` |
| Code radius (deck) | `6px` | `themes/gentleman-cute.css` |
| Pill radius | `999px` | both |
| `--shadow` (studio) | `0 1px 2px rgba(20,24,43,.06), 0 4px 16px rgba(20,24,43,.05)` | `studio/studio.css` |
| Bar padding | `.6rem 1.2rem` | `studio/studio.css` |

## Component rules

- Slides are 1600×900 artboards, always shown scaled at 16:9; the studio never restyles slide content.
- Tool chrome uses skin variables only (`--bg`, `--surface`, `--accent`, `--primary-bg`, …), never raw colors, so `gentle` and `flat` stay interchangeable. `gentle` (default): rose `#f095c8` accent and primary action. `flat`: blue `#7FB4CA` accent, gold `#E0C15A` primary action.
- Status and metadata (ids, slide numbers, request kinds, keybindings) use the mono stack.
- Body text uses `text` or `secondary`; `muted` is only for decoration or ≥ 18px text (it is below AA for small text on `bg`).
- Visible focus: 2px `blue` outline, 2px offset.
- Motion respects `prefers-reduced-motion`.
