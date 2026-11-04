# gentle-decks design system

Tokens read from the project sources. Two token families live here: the
**studio chrome** (the agent workspace UI, `studio/studio.css`) and the
**deck themes** (slide palettes, `themes/*.css`). Artboards that show the
studio use the chrome tokens; artboards that show slides use one theme.

## Studio chrome — source: `studio/studio.css`

Two skins share the same variable names; components only use variables.

### Colors (skin `gentle`, default)

| Token | Value | Usage |
| --- | --- | --- |
| `--bg` | `#140a12` | app ground |
| `--bg-subtle` | `#1a1218` | outline / comments columns |
| `--surface` | `#20161e` | cards, buttons, rows hover |
| `--surface-2` | `#241822` | selected rows, tabs |
| `--selection` | `#342230` | selection fills |
| `--border` | `#ffffff17` | component borders |
| `--border-subtle` | `#ffffff0f` | hairlines |
| `--border-strong` | `#342230` | emphasized borders |
| `--text` | `#f6eff3` | primary text |
| `--secondary` | `#a78e9b` | secondary text |
| `--muted` | `#76616b` | tertiary text |
| `--heading` | `#d7a0b8` | section headings |
| `--accent` | `#f095c8` | accent, focus, active |
| `--accent-strong` | `#ff76c3` | accent hover |
| `--accent-soft` | `#ffb1dd` | accent borders, gradients |
| `--on-accent` | `#1a0812` | text on accent |
| `--green` | `#b4e7c7` | ok status |
| `--warning` | `#f2b86d` | draft / open request status |
| `--red` | `#ff718f` | error / overflow status |
| `--blue` | `#a9c7ee` | links |
| `--gold` | `#e0c27a` | spare |
| `--ok-bg` | `#b4e7c71a` | ok chip background |
| `--bad-bg` | `#ff718f1f` | error chip background |
| `--glow` | radial gradients `#f095c824` / `#a9c7ee12` | body backdrop |

### Colors (skin `flat`)

| Token | Value |
| --- | --- |
| `--bg` | `#06080f` |
| `--bg-subtle` | `#0d0f14` |
| `--surface` | `#0d0f14` |
| `--surface-2` | `#161D2E` |
| `--selection` | `#232A40` |
| `--border` | `#313342` |
| `--border-subtle` | `#232A40` |
| `--border-strong` | `#313342` |
| `--text` | `#F3F6F9` |
| `--secondary` | `#A3B5D6` |
| `--muted` | `#5C6170` |
| `--heading` | `#B5B2D0` |
| `--accent` / `--focus` / `--link` | `#7FB4CA` |
| `--accent-soft` | `#A3B5D6` |
| `--on-accent` | `#06080f` |
| `--green` | `#B7CC85` · `--warning` | `#DEBA87` · `--red` | `#CB7C94` · `--gold` | `#E0C15A` · `--blue` | `#7FB4CA` |
| `--primary-bg` | `#E0C15A` (primary buttons) |
| `--glow` | `none` |

### Typography — source: `studio/studio.css`

- Body: `14px/1.45` skin sans. Gentle: `"Inter", "SF Pro Text", system-ui, -apple-system, "Segoe UI", sans-serif`. Flat: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Mono (labels, kbd, meta): `11–12px` skin mono. Gentle: `"IosevkaTerm NF", "Iosevka Term", "JetBrains Mono", ui-monospace, Menlo, monospace`. Flat: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- Outline row title `h3`: `600 13.5px/1.3`; selected row title input: `600 15px/1.35`.
- Section eyebrow: `11.5px mono`, letter-spacing `.18em`, uppercase, accent color.
- Points preview / wireframe bullets: `13–16px` sans.

### Spacing and shape

- Radius: `--r-s 8px`, `--r-m 12px`, `--r-l 16px` (flat: 4/6/8).
- Workspace grid: `420px | 1fr | 300px` (≤1280px: `360px | 1fr | 264px`).
- Row padding `8px`; column gutters `10px`; panels pad `14–18px`.
- Outline row grid: `26px | 88px | 1fr` (selected: thumb 120px).

### Component rules

- Buttons `.btn`: surface bg, border, `6px 12px`; `.btn.primary` = accent bg + `--on-accent` text, bold.
- Segmented control `.seg`: bordered group, active = `--surface-2` bg + accent text.
- Status chips `.st.ok/.w/.over/.p`: colored text on translucent bg, `0 6px` padding, radius 4.
- Tags `.tag`: mono, pill border, `--tag` color.
- Tabs: text buttons, active = inset 2px accent underline.
- Dialogs: `--surface` panel, radius `--r-m`, border, backdrop `--bg` at 70%.
- Focus: `:focus-visible` 2px `--focus` outline, offset 2.
- Motion: respect `prefers-reduced-motion`; transitions only on color/transform.

## Deck themes — slide palettes (for slide previews inside artboards)

| Theme | Source | Ground | Text | Accent | Sans / Mono |
| --- | --- | --- | --- | --- | --- |
| `gentleman-cute` | `themes/gentleman-cute.css` | `#060407` | `#F6EFF3` | `#F095C8` (`#E0C27A` champagne, `#FF718F` error) | Inter / JetBrains Mono |
| `fair-test` | `themes/fair-test.css` | `#ffffff` | `#1b1b3a` | `#2f6bff` + stages `#ff5a5f #ffb020 #22c55e #2f6bff #8b5cf6` | SF Pro Rounded / SF Mono |
| `fair-test-gentle` | `themes/fair-test-gentle.css` | `#140a12` | `#f6eff3` | `#f095c8` + pastel stages `#ff718f #f2b86d #b4e7c7 #f095c8 #a9c7ee` | Inter / IosevkaTerm NF |

Theme layout rules (from the themes): `.slide` is a flex column with `gap: 2.2vh`
and `padding: 6vh 7vw 8vh` (footer safe area); never render content behind
`.brand`/`.counter`.
