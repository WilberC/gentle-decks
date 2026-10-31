# Studio design: Gentle Shell look

Redesign the deck studio UI so it reads as a gentle-shell tool, exploring directions on the
gentle-design canvas before touching `studio/`. Also run the RDD review the user asked for on the
merged studio work. Branch `design/studio-ui`.

## Specs

- S1 — Request (user, verbatim): "gentle-ai es antiguo ahora usamos gentle-shell en su version autocontenida por lo que deberias ser capas de usar RDD. Me parece genial, pero creo que podemos mejorar el diseno sobre todo darle un estilo mas de herramienta de gentle-shell usemos gentle:design para poder afinar el diseno".
- S2 — RDD: run the native review on the studio work through the gentle-shell bundled review controller.
- S4 — Brand and skins (user, verbatim): "hay que usar los colores y el estilo de los productos de gentle para que se vea como parte de gentle" and "en la UI tengamos la version gentle y la version flat que usa la gama de colores que me estas proponiendo ahora".
- S5 — Deck template (user, verbatim): "El template de ejemplo para la una presentacion o deck podemos usar este https://gamma.app/docs/Fair-Test-uzu9r5myycogjr4".
- S3 — Design: directions on the gentle-design canvas under `design/studio-ui/`, using the Gentle Shell palette from `design/system.md`; the user picks and refines one before implementation.

## Tasks

| ID | Specs | Task | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2 | RDD review of `86f5777..49e1111` (studio) | native review | blocked: reviewer output limit |
| T2 | S3 | Design system sync (`design/system.md`, `design/system.html`) | inline | "design: add studio design system and three Gentle Shell directions" |
| T3 | S3 | Three directions in `design/studio-ui/` | inline | "design: add studio design system and three Gentle Shell directions" |
| T5 | S4 | Gentle brand tokens in system board; studio artboards with Gentle default + Flat toggle | inline | "design: add Gentle and Flat skins and Fair Test deck templates" |
| T6 | S5 | Deck template directions after Gamma Fair Test in `design/deck-template/` | inline | "design: add Gentle and Flat skins and Fair Test deck templates" |
| T4 | S3 | Apply the chosen direction to `studio/` after feedback | inline | pending (user choice) |

## Log

- L1 (user): see S1 verbatim.
- L2 (evidence, S2): the bundled controller is `gentle-pi/.gentle-ai/v4.3.1/gentle-ai` (RDD global on). First inspect stopped on `managed_assets_outdated`; ran its `sync --agent pi` continuation. Assess with escalate item 2 → tier high, reviewDue true. START lineage `review-08ac1528e60ff198` (lenses risk, resilience, reliability; 25 files, 3124 lines, correction budget 200). Grouped capture forecast 3 runs, acknowledged; the resilience reviewer (`nan/mimo-v2.6-flash`) hit its output limit after ~10 min (stopReason length, 0 text). Nothing was submitted; fresh STATUS reoffers all three slots. Not retried: the same 3124-line candidate would likely hit the same limit.
- L3 (decision, S3): canvas directions — 01 shell-native (Plan), 02 workbench (Editor), 03 command-grid (Grid); each shows a different stage so the user also sees how the style carries across stages.
- L4 (evidence, S3): screenshots of the three artboards reviewed; 01 footer overlap fixed. Canvas: design/studio-ui with the system board first.
- L5 (user): "el diseno no se parece o tiene los colores que tiene normalmente gentle https://gentlemanprogramming.com hay que usar los colores y el estilo de los productos de gentle para que se vea como parte de gentle. El template de ejemplo para la una presentacion o deck podemos usar este https://gamma.app/docs/Fair-Test-uzu9r5myycogjr4 - tambien estaria bueno que en la UI tengamos la version gentle y la version flat que usa la gama de colores que me estas proponiendo ahora"
- L6 (evidence): Gentle brand tokens taken from gentlemanprogramming.com stylesheets (`/_astro/business.*.css`): herdr/st palettes (`#140a12`, `#1a1218`, `#20161e`, `#241822`, `#342230`, text `#f6eff3`, subtext `#a78e9b`/`#76616b`, rose `#f095c8`, mauve `#ffb1dd`, `#d7a0b8`, blue `#a9c7ee`, mint `#b4e7c7`, yellow `#e0c27a`, peach `#f2b86d`, red `#ff718f`, logo `#ff76c3`), fonts Inter + IosevkaTerm/JetBrains Mono, radii 8/12/16/999. The Gamma Fair Test doc and template page block headless browsers (403 / "Just a moment"); only Gamma's own description was available: "A toy-bright science-fair presentation: big isometric dioramas of the experiment sit on a pure white ground, each stage of the scientific method wears its own rainbow color and a labelled pill, headings are heavy rounded sans and every measurement reads in mono."
- L7 (decision): studio skins = `gentle` (default, brand palette above) and `flat` (the previous Gentle Shell terminal palette), switched by a UI toggle. Deck template directions follow the Fair Test description with inline SVG dioramas (no external images).
- L8 (evidence, S4/S5): skins in `design/_src/skins.css` inlined by `design/_src/build.py`; studio artboards 01-03 use only skin variables and carry a Gentle/Flat switch; screenshots checked in both skins. Deck template: `design/deck-template/01-fair-test.html` (faithful) and `02-fair-test-gentle.html` (Fair Test structure, Gentle palette). System board and system.md record the Gentle brand tokens with their source.
