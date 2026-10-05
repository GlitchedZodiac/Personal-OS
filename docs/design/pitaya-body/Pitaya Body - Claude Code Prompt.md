# Pitaya · Body — Build Prompt for Claude Code

Paste this whole file as the task. Companion files in the repo/design project: `Pitaya Body Handoff Spec.md` (exact numbers, easings, copy), `Pitaya Body.dc.html` (interactive reference — the behaviour truth), `/assets/body-front.svg`, `/assets/body-back.svg`.

---

## Task

Rebuild the Body area of Pitaya (Next.js app in this repo, `app/(tabs)/health/body/`) to the attached design. Mobile-first (iPhone), used daily right after weighing in. Keep Pitaya's existing visual language (paper `#F2F1F2`, raspberry `#A63D63`, Familjen Grotesk numbers, Instrument Sans body) and add a dark variant on the same roles. Clean, data-dense, calm. No red alarm styling anywhere; the user is compared against his own history first and a dimmed population band second.

Replace `health/body/page.tsx`; extend `health/body/metric/page.tsx`. Do not touch other tabs.

## Data

Already in the schema (VeSync/RENPHO import): `weightKg, bodyFatPct, bmi, fatFreeMassKg, subcutaneousFatPct, visceralFat, bodyWaterPct, skeletalMusclePct, muscleMassKg, boneMassKg, proteinPct, bmrKcal, metabolicAge`; tape `neckCm, chestCm, armsCm, waistCm, hipsCm, legsCm, calvesCm`.

Add:
- Tape: `forearmsCm`, `shouldersCm`.
- Segmental (RENPHO export): `segFatKg` and `segMuscleKg`, each `{ armLeft, armRight, trunk, legLeft, legRight }` with a parallel `pctOfStd` object.
- Goals: `healthGoals { weightKg, bodyFatPct, byDate }`.
- Milestones: `bodyMilestones { date, title, note?, weightKg, kind: 'auto' | 'logged' }`.
- Training volume per muscle per ISO week, derived from workout logs: `muscleWeeklyVolume { weekStart, muscleId, sets, volumeKg }` (muscleId = the SVG path IDs below).

Start point is fixed: 117.3 kg on 2025-12-15. Every "since start" number derives from it.

## Screen order (one scroll, cards 22px radius, 12px gap)

1. **Today's weigh-in** — weight 54px, body fat 26px with `EST` tag, VS LAST / VS 30 DAYS / SOURCE row, sync chip (`Synced N min ago`), pull-to-sync from the top of the page.
2. **Target & forecast** — `77 kg · 13% · by Feb 28`, progress from start to target, pace chart with two lines (dashed = pace needed, solid = pace you're on) and one gap, NEEDED / YOU'RE ON tiles, one plain sentence with the projected arrival date, body-fat target row, `Edit targets` sheet.
3. **Composition overview** — nine range-bar rows (weight, fat mass, body fat, skeletal muscle, fat-free mass, water, visceral fat, BMR, metabolic age); sort chip Default → Most changed → Outside band; tap pushes the metric screen.
4. **Body map** — see the BodyMap section below.
5. **Body-type matrix** — BMI × body fat grid, current position, monthly trail that draws on scroll.
6. **Trends** — metric chips + time chips (7d · 30d · 90d · 6mo · Since start · Custom), smoothed line over raw dots, scrub with haptic ticks.
7. **Tape** — nine sites with sparkline, Δ since first tape, latest value; `Tape` button opens voice entry; row tap opens keypad for that site.
8. **Milestones** — plain timeline from 117.3; auto and logged entries; line draws on scroll.

Every exact dimension, colour, easing and copy string is in `Pitaya Body Handoff Spec.md` §0–§3 and §5–§10. Follow it; where it and this prompt disagree on the body map, this prompt wins.

## Components to build (shared, typed, no third-party chart libs)

### RangeBar
`{ value, axis:[min,max], band:[lo,hi], start, target?, estimate?, delta30?, direction:'down'|'up' }` — 4px track, 8px dimmed band, 2px history line from start to now, hollow start dot, ink diamond target, 10px raspberry "now" dot that slides (`left .8s cubic-bezier(.22,.9,.3,1)`) when a new reading lands. Also used, with axis = [start, target], as the progress bar on the forecast card. Spec §3.

### TrendChart
`{ metric, range, points:[{day,value}], unit, decimals, onScrub? }` — 360×160, raw dots sized by density, centred 7-day mean line, wash area, pointer-captured scrub that snaps to real points and fires one haptic per index change (`UIImpactFeedbackGenerator(.light)` in the native shell, `navigator.vibrate(3)` on web). Tooltip stays on release. Spec §6.

### BodyTypeMatrix
`{ current:{bmi,bf}, trail:[{bmi,bf,label}] }` — 320×236, cells at BF 12/20 and BMI 25/30, current cell washed, captions top-right of each cell, trail draws once on viewport entry (`stroke-dashoffset` over 1.8s), then only the current dot rings. Spec §5.

### PaceChart
`{ todayWeight, targetWeight, daysToTarget, ratePerWeek }` — 320×100. Rate = `(sm(t−33) − sm(t−3)) / 30 × 7` on the centred 7-day mean (positive = losing). Needed = `toGo / (daysTo/7)`. Arrival = `toGo / (rate/7)` days, undefined when `rate ≤ 0.02`. Spec §2.

### BodyMap  ← replaces the hand-drawn figure in the DC

Artwork is provided; do **not** redraw, simplify, trace, or re-path it. Only recolor by ID.

**Assets.** `/assets/body-front.svg` and `/assets/body-back.svg`. Each file has:
- a `shading` group — the original grayscale anatomical contours (the vector pack's shaded illustration), and
- a `color` group — one flat path per muscle, IDs in the form `{segment}-{side?}-{muscle}`, e.g. `arm-left-biceps`, `arm-left-forearm`, `arm-right-deltoid`, `trunk-pecs`, `trunk-abs`, `trunk-obliques`, `trunk-traps` (back: `trunk-lats`, `trunk-erectors`, `trunk-rear-delts`…), `leg-left-quadriceps`, `leg-left-adductors`, `leg-right-calves` (back: `leg-left-hamstrings`, `leg-left-glutes`…).
  Segment prefix is one of `arm-left`, `arm-right`, `trunk`, `leg-left`, `leg-right`. Enumerate the IDs from the files at build time (a small script that emits `muscleIds.ts`); do not hand-type the list.

Precondition to verify first: the raw vector pack (`uploads/anatomical-muscles-vector-pack/*.svg`) is shading only — its README states the paths are not named or segmented. If `/assets/body-front.svg` / `body-back.svg` do not yet contain a `color` group with IDs, stop and report; do not invent regions.

**Rendering.**
- Inline the SVG (fetch once, parse, mount as React elements or via `dangerouslySetInnerHTML` inside a wrapper — IDs must be reachable from CSS/JS). Keep the original `viewBox` and aspect ratio; width fills a 150–180px column on phone.
- Order: `color` group first, `shading` group above it with `mix-blend-mode: multiply`. Shading paths keep their own fills; never recolor them.
- Default fill for every `color` path = `band` token (`#E2E0E5` light / `#38373E` dark) so an uncoloured body reads as the neutral silhouette.
- Dark mode: the shading layer's grayscale multiplies to near-black on dark backgrounds, so in dark mode either (a) set the shading group `opacity: .55` and `mix-blend-mode: screen` → no, keep multiply but lift the `color` base to `#4A4950` — pick (b) after checking contrast on `#1E1D23`; the silhouette must still read, the muscle cuts must still show. Test both themes.
- Anatomical left/right: in the **front** view the subject's left is the viewer's right; in the **back** view the subject's left is the viewer's left. Labels and the balance meter always say the subject's side. Position the LEFT/RIGHT label columns per view accordingly (front: RIGHT column on the viewer's left; back: swapped).
- Transitions: `fill .55s ease, opacity .55s ease` on every `color` path, staggered by segment 0/.05/.1/.15/.2s (right arm → left arm → trunk → right leg → left leg) when the mode or view changes.

**Mode "composition"** (RENPHO five segments).
- Sub-toggle Muscle / Fat (segmented pill). Hue: raspberry for muscle, slate `#5E7FA6` / `#86A3C8` for fat.
- Map each segment's `pctOfStd` to every `color` path with that prefix. Single-hue intensity: muscle `opacity = clamp(0.5 + (pct−100)/45, .4, .95)`, fat `opacity = clamp(0.32 + (pct−50)/100, .3, .95)`. Deeper = more. All muscles in a segment share one value; that is honest to what the scale knows.
- Side labels per segment: `4.19 kg` + `122% of std`; TRUNK under the figure.
- Balance meter (Arms, Legs): 2px rule, centre tick, raspberry dot offset `(L/(L+R) − 0.5) × 100 × 12px`; verdict `Balanced · within 1%` in green, otherwise grey `Left arm +3.1%`. Never red.

**Mode "training"** (workout logs).
- Colour individual muscles by trailing-7-day `volumeKg` (or sets, toggle in settings) relative to that muscle's own 8-week median: `opacity = clamp(0.3 + 0.6 × (vol / median), .3, .95)`; a muscle with zero volume this week stays `band`. Hue: raspberry.
- Legend under the figure: `This week vs your 8-week usual`. Side labels show the top two muscles per segment by volume with `sets · kg`.
- Week chips above: this week · last week · 4-wk avg.

**Interaction.**
- Front / Back toggle (pill, right of the kicker). Switching crossfades the two SVGs (`opacity .35s`) and re-maps labels.
- Tap any `color` path → a small detail card slides up under the figure (not a sheet): muscle name, segment, in composition mode the segment's kg and % of std, in training mode last 4 weeks of volume as four bars. Tapping the same region again or outside closes it. Hit targets: paths are small; add `pointer-events: all` and a transparent 6px `stroke` on `color` paths for touch slack.
- Accessible names on each path (`aria-label="Left biceps"`), figure as `role="img"` with a summary sentence.

**Props.**
```
BodyMap {
  view: 'front' | 'back'; onViewChange;
  mode: 'composition' | 'training'; onModeChange;
  compositionSub?: 'muscle' | 'fat';
  segments: { armLeft, armRight, trunk, legLeft, legRight } of { muscleKg, fatKg, musclePct, fatPct };
  training?: { weekStart, byMuscle: Record<muscleId, { sets, volumeKg, median8w }> };
  onSelectRegion?(muscleId); selectedRegion?: muscleId | null;
  theme: 'light' | 'dark';
}
```

## Tape entry

- `Tape` button and the dock mic open the sheet in **voice**: listening state (pulsing mic, VU bars, hint "Say it like “waist 86.5” — one site or the whole round"), then a **confirm card** per parsed site (SITE · DATE, value 44px, `was 88.0 · Sep 6`, Δ in green), buttons Again / Edit / Save. Nothing saves until Save.
- Parsing: site word (synonyms: waist/belly, hips, chest, neck, arm/arms/bicep, forearm, leg/legs/thigh, calf/calves, shoulders) + number with optional decimal; accept "and" / commas between sites. Unknown → stay listening with a one-line nudge.
- Row tap opens **keypad** for that site (3×4, 50px keys, one decimal, max 5 chars, valid 10–200 cm). Save button is ghost until valid.
- Save: draws circle + check (`.6s` / `.4s @ .45s`), closes at 1.3s, row flashes `wash` and fades `.9s`, sparkline gains the point, `TAPED <date>` header updates. Haptic `.success`.

## Motion law

Enter/slide `cubic-bezier(.32,.86,.3,1)`; settle `cubic-bezier(.22,.9,.3,1)`; draw-on `cubic-bezier(.4,0,.2,1)`. Chips `.25s`, markers `.6–.8s`, sheets `.42s`, draw-ons `1.8–2.2s`. Cards rise on first paint staggered `.04s`. Only three things loop: the sync dot while syncing, the mic rings while listening, the matrix "now" ring after its trail has drawn. Scroll reveals (matrix, milestones) fire once per visit; `prefers-reduced-motion` renders end states. Haptics: scrub tick `.light`, pull threshold `.light`, sync done / tape saved `.success`. Nothing else vibrates.

## Theme

Implement as CSS variables on the Body route root with `data-theme="light|dark"`; token table in Spec §0. Default follows the system; the rest of Pitaya stays light until told otherwise.

## Done means

- All eight cards render with real data from the import; empty states for no segmental data ("Your scale hasn't sent segmental readings yet") and no training logs.
- BodyMap recolors only by ID, works in both views and both themes, and the artwork is byte-identical to the assets apart from fill/opacity/aria attributes.
- Forecast sentence, arrival date and NEEDED / YOU'RE ON tiles agree with the formulas above on a fixture (117.3 → 82.8 over 294 days, target 77 by Feb 28 → arrival early Feb).
- Voice entry parses "waist 86.5 and hips 96" into two confirm cards and saves both on one tap.
- No red anywhere. No "HIGH"/"LOW" labels. Out-of-band values get a sentence, not a colour.
