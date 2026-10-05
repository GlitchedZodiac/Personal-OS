# Pitaya Body — handoff bundle

Drop this folder into the repo at `docs/design/pitaya-body/` and copy `assets/` to `/assets/`.

## Included
- docs/Pitaya Body - Claude Code Prompt.md — the task
- docs/Pitaya Body Handoff Spec.md — numbers, easings, copy
- docs/Pitaya Body.dc.html (+ support.js) — interactive reference; open in a browser
- assets/body-front.svg — FRONT view, `color` group with 34 IDs in the prompt's scheme. Trunk muscles are split `-left`/`-right` (one path per side).
- assets/muscleIds.json — the ID list
- vector-pack-raw/ — the original shaded pack (grayscale only, no named paths)

## Not included — and where it comes from
1. **assets/body-back.svg** — doesn't exist. The prototype only ever had a front figure. Options: draw it in Figma over vector-pack-raw/anatomical-muscles-back.svg (name layers per the ID scheme: trunk-lats, trunk-erectors, trunk-rear-delts, leg-*-hamstrings, leg-*-glutes, arm-*-triceps…), or ask the design session to draw an interim one.
2. **`shading` group** — body-front.svg has none. The raw pack's figure has different proportions from this interim art, so its shading can't be overlaid. If you want the pack's detailed look, the color layer must be traced over the pack in Figma; then both groups share one viewBox.

## Tell Claude Code
Front view: proceed with assets/body-front.svg (interim art, no shading — skip the multiply layer). Back view: hide the Front/Back toggle until body-back.svg exists.
