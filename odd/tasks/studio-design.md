# Studio design: Gentle Shell look

Redesign the deck studio UI so it reads as a gentle-shell tool, exploring directions on the
gentle-design canvas before touching `studio/`. Also run the RDD review the user asked for on the
merged studio work. Branch `design/studio-ui`.

## Specs

- S1 — Request (user, verbatim): "gentle-ai es antiguo ahora usamos gentle-shell en su version autocontenida por lo que deberias ser capas de usar RDD. Me parece genial, pero creo que podemos mejorar el diseno sobre todo darle un estilo mas de herramienta de gentle-shell usemos gentle:design para poder afinar el diseno".
- S2 — RDD: run the native review on the studio work through the gentle-shell bundled review controller.
- S3 — Design: directions on the gentle-design canvas under `design/studio-ui/`, using the Gentle Shell palette from `design/system.md`; the user picks and refines one before implementation.

## Tasks

| ID | Specs | Task | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S2 | RDD review of `86f5777..49e1111` (studio) | native review | blocked: reviewer output limit |
| T2 | S3 | Design system sync (`design/system.md`, `design/system.html`) | inline | "design: add studio design system and three Gentle Shell directions" |
| T3 | S3 | Three directions in `design/studio-ui/` | inline | "design: add studio design system and three Gentle Shell directions" |
| T4 | S3 | Apply the chosen direction to `studio/` after feedback | inline | pending (user choice) |

## Log

- L1 (user): see S1 verbatim.
- L2 (evidence, S2): the bundled controller is `gentle-pi/.gentle-ai/v4.3.1/gentle-ai` (RDD global on). First inspect stopped on `managed_assets_outdated`; ran its `sync --agent pi` continuation. Assess with escalate item 2 → tier high, reviewDue true. START lineage `review-08ac1528e60ff198` (lenses risk, resilience, reliability; 25 files, 3124 lines, correction budget 200). Grouped capture forecast 3 runs, acknowledged; the resilience reviewer (`nan/mimo-v2.6-flash`) hit its output limit after ~10 min (stopReason length, 0 text). Nothing was submitted; fresh STATUS reoffers all three slots. Not retried: the same 3124-line candidate would likely hit the same limit.
- L3 (decision, S3): canvas directions — 01 shell-native (Plan), 02 workbench (Editor), 03 command-grid (Grid); each shows a different stage so the user also sees how the style carries across stages.
- L4 (evidence, S3): screenshots of the three artboards reviewed; 01 footer overlap fixed. Canvas: design/studio-ui with the system board first.
