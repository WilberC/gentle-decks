# Where themes live

gentle-decks has no config file. The only thing you set up is where your
themes live. A theme is one CSS file, and it can sit in three places:

| Where | Path | What goes there | Survives package updates |
| --- | --- | --- | --- |
| **Deck** | `decks/<slug>/themes/<name>.css` | Themes made for one deck. The agent writes the themes it proposes here. | Yes, it is part of your project |
| **Personal** | `~/.config/gentle-decks/themes/<name>.css` | Your own themes, available in every deck. | Yes |
| **Built-in** | `<package>/themes/<name>.css` | `gentleman-cute`, `fair-test`, `fair-test-gentle`. Read-only. | Replaced on every update |

```text
~/.config/gentle-decks/
└── themes/                  # personal: your themes, every deck
    ├── my-brand.css
    └── talk-dark.css

my-project/
└── decks/
    └── intro-talk/
        ├── intro-talk.md    # theme: my-brand
        ├── plan.json
        └── themes/          # deck: themes for this deck only
            └── intro-warm.css

<package>/themes/            # built-in, shipped with gentle-decks
├── CONTRACT.md
├── gentleman-cute.css
├── fair-test.css
└── fair-test-gentle.css
```

## Lookup order

A deck picks its theme with `theme: <name>` in its frontmatter. The name is
looked up in this order, and the first match wins:

1. Deck: `decks/<slug>/themes/`
2. Personal: the personal themes directory
3. Built-in: the package's `themes/`

So a deck theme named `my-brand` overrides your personal `my-brand` for that
deck only, and a personal `gentleman-cute` overrides the built-in one
everywhere. A name found nowhere fails the build with
`build failed: theme not found: <name>`.

In the studio's **Estilo** view, each theme card shows where it came from:
*propuesto* (deck), *mío* (personal), or *plantilla* (built-in).

## Choosing the personal directory

The personal directory is the first of these that applies:

1. `$GENTLE_DECKS_THEMES`, when set: use exactly this directory.
2. `$XDG_CONFIG_HOME/gentle-decks/themes`, when `XDG_CONFIG_HOME` is set.
3. `~/.config/gentle-decks/themes` otherwise, on every platform.

The directory is optional. Nothing is created for you; when it is missing,
only deck and built-in themes are available.

## Add a personal theme

```bash
mkdir -p ~/.config/gentle-decks/themes
cp decks/intro-talk/themes/intro-warm.css ~/.config/gentle-decks/themes/
decks theme check intro-warm   # prints: ok: intro-warm
```

Or ask the agent to "keep this theme for my other decks"; it copies the theme
after you confirm the destination. Every theme must follow
[themes/CONTRACT.md](../themes/CONTRACT.md); `decks theme check` tells you
which selectors are missing.

## Workshop: design a theme on the canvas

New styles do not have to start as CSS. When the studio's agent offers the
gentle-design canvas (the `gentle_design` tool), a theme proposal becomes a
visual workshop:

1. The agent drafts 2–3 theme directions as CSS and renders real sample
   slides with each one: `decks <deck.md> --design design/<slug> --theme
   decks/<slug>/themes/draft-<name>.css` (drafts do not need to pass
   `theme check` yet).
2. The directions open on the canvas; you comment on the actual slides and
   the agent applies the changes to the draft CSS.
3. The approved direction is renamed, passes `theme check`, and appears in
   the studio's Estilo view — where **Mis estilos** can save it as yours.

Every gentle:design improvement (better directions, a sharper design system,
more precise comments) therefore lifts deck styling: the theme you get is the
template of something you saw and approved, not text you imagined.

Do not edit the built-in `themes/` directory of the installed package: the
next `pi update` or reinstall replaces it. Copy the theme into your personal
directory under a new name, or the same name to override it.

## Keep your themes in dotfiles

The personal directory is plain files, so any dotfiles manager can carry it.
With GNU Stow:

```text
~/dotfiles/gentle-decks/
└── .config/gentle-decks/themes/
    └── my-brand.css
```

```bash
cd ~/dotfiles && stow gentle-decks
```

To keep the themes somewhere else, such as a synced folder, point
`GENTLE_DECKS_THEMES` at it from your shell profile.
