# Pitaya · Body — Round 1 Handoff Spec

Reference implementation (interaction truth, not code to port): `Pitaya Body.dc.html`. Replaces `app/(tabs)/health/body/page.tsx` and extends `health/body/metric/page.tsx`. Data already in schema from the VeSync/RENPHO import (`weightKg, bodyFatPct, bmi, fatFreeMassKg, subcutaneousFatPct, visceralFat, bodyWaterPct, skeletalMusclePct, muscleMassKg, boneMassKg, proteinPct, bmrKcal, metabolicAge`) plus tape (`neckCm, chestCm, armsCm, waistCm, hipsCm, legsCm, calvesCm`). **New tape fields:** `forearmsCm`, `shouldersCm`. **New segmental fields** (RENPHO export): `segFatKg{la,ra,tr,ll,rl}`, `segMuscleKg{la,ra,tr,ll,rl}`, each with `pctOfStd`.

---

## 0 · Tokens

Light = current Pitaya paper, unchanged: paper `#F2F1F2`, card `#FFFFFF`, card-alt `#F6F5F7`, ink `#232227`, secondary `#66646C`, faint `#96949B`, ghost `#B4B2B8`, rules `#EDEBEE`/`#E4E2E6`, raspberry `#A63D63`, deep `#8C2F51`, wash `#F6E3EB`, green `#5E9B72`, slate (fat mode) `#5E7FA6`, reference band `#E2E0E5`.

Dark (new, same roles): bg `#131217`, card `#1E1D23`, card-alt `#27262C`, ink `#F2F1F2`, secondary `#B9B7BE`, faint `#85838B`, ghost `#5F5D65`, rules `#2B2A30`/`#37363C`, raspberry `#D0628C`, deep `#E795B4`, wash `#3A2331`, green `#7FB893`, slate `#86A3C8`, band `#38373E`. Tooltip inverts (ink on paper → paper on ink).

Type unchanged: Familjen Grotesk 700 for numbers/titles (54/46/26/16/15), Instrument Sans for everything else. Kickers 10.5px / 0.16em / 600 / faint. All numbers `font-variant-numeric: tabular-nums`.

**Colour rules.** Green = moved in the good direction (down for weight/fat/visceral/metabolic age/waist/hips/neck; up for muscle/FFM/BMR). Anything else = secondary grey. **No red, no "HIGH".** Out-of-band is explained in a sentence (see Range bar · bandNote), never coloured.

---

## 1 · Today's weigh-in card

- 54px weight, 26px body fat with an `EST` tag (8.5px, 1px rule border, ghost). Tag appears on every bioimpedance-derived number everywhere.
- Row: VS LAST (`−0.3 kg`, with prev date + value under it) · VS 30 DAYS (weight; fat in points under it) · SOURCE (`RENPHO scale` / `via Apple Health`).
- Sync chip top-right: dot + `Synced N min ago`. States: idle (ghost dot) → syncing (raspberry dot, `pulse .9s`, "Syncing from scale…") → done (green dot, "Synced just now", holds 3.5s) → idle. Tap also triggers a sync.
- **Pull-to-sync.** Only when `scrollTop == 0` and no sheet open. Pull distance × 0.55, clamp 90px; threshold 56px flips the label "Pull to sync from scale" → "Release to sync". On release past threshold: hold 44px with a spinning ring (2px, edge colour with raspberry top) while `GET /api/health/sync`, then collapse (`.35s cubic-bezier(.22,.9,.3,1)`). Haptic: `.light` at threshold, `.success` on done. New readings animate in via the normal number transition (no counting — not selected).

## 2 · Target & forecast card

- Header `TARGET · FEB 28` + `Edit targets` (wash button) → Targets sheet: weight stepper (0.5 kg), body fat stepper (0.5 pt), date chips (Dec 31 / Jan 31 / Feb 28 / Mar 31). Persist to `healthGoals {weightKg, bodyFatPct, byDate}`.
- Title `77 kg · 13%` + `5.8 kg to go`.
- Progress bar = the Range bar component with axis fixed to [start, target]: hollow start dot at 0, diamond at 100%, raspberry dot at `(start − now)/(start − target)`; faint raspberry fill behind. Label row `117.3 · DEC` / `86% of the way` / `77 kg`.
- **Pace chart (two lines, one gap).** 320×100 viewBox. x = days from today, scaled to `max(daysToTarget, min(arrivalDays, 1.6×daysToTarget)) × 1.06`. y: 14 = today's weight, 74 = target weight. Dashed ghost line = needed pace (today → target date). Solid raspberry 2.5px = your pace (trailing 30-day slope on the 7-day-smoothed series), running to the arrival point then flat; if arrival is beyond the window the line ends on the right edge above the target — that vertical gap is the shortfall. Dotted vertical hairline at target date. Labels: TODAY, target date, arrival date (deep) above the arrival dot.
- Rate = `(sm(t−3) − sm(t−33)) / 30 × 7` where `sm` is the centred 7-day mean. Needed = `toGo / (daysTo/7)`. Arrival = `toGo / (rate/7)` days; undefined when `rate ≤ 0.02`.
- Two tiles NEEDED / YOU'RE ON (kg/wk, 2 dp), then one plain sentence: "You need 0.28 kg a week to make 77 kg by Feb 28. On your 30-day pace of 0.31 you arrive around Feb 9 — 19 days early." Variants for arrived / not moving.
- Body fat target row (`13% · 0.2 pt to go (13.2)` / `arrived`), and a faint note when targets disagree: body fat at target weight with today's FFM = `(goalW − FFM)/goalW`; if that is >1 pt under the fat target, say so.

## 3 · Composition overview (Range bar ×9)

Rows in default order: Weight, Fat mass, Body fat, Skeletal muscle, Fat-free mass, Water, Visceral fat, BMR, Metabolic age. Tap → metric push-in. Sort chip cycles **Default → Most changed (|Δ30d| / axis span) → Outside band first**.

### Range bar component
```
RangeBar { value, axis:[min,max], band:[lo,hi], start, target?, estimate?, delta30?, direction:'down'|'up' }
```
- Height 22. Track 4px at y=9, `trackBg`, radius 99. Band 8px at y=7, `band` colour, left/width from axis. History line 2px at y=10, raspberry @35%, from `start` to `value`. Start = 6px hollow dot (1.5px faint stroke, card fill). Target = 7px ink square rotated 45°. Now = 10px raspberry dot with 2px card halo, `transition: left .8s cubic-bezier(.22,.9,.3,1)` so a new reading slides.
- Positions are `clamp((x − min)/(max − min), 0, 1)` as percentages; markers are `left: calc(P% − half)`.
- Left column 108px: label 13/600 ink (+ `EST` tag), under it `Δ30d · 30d` 10.5px in green or faint. Right column 72px: value 15/700 Familjen + unit 10.5 faint.
- Bands are population reference for the user's sex/age/height, dimmed. Values above/below band are **not** coloured; the detail screen carries a `bandNote` sentence per metric (see DC `BANDNOTE`).
- Legend row under the list: band · Dec start · now · target · EST meaning.

## 4 · Body map

- Figure: a new muscle-map figure (120×250 viewBox, front view) replaces the old blob silhouette. Base body = one half-path mirrored (`matrix(-1 0 0 1 120 0)`) in the `band` colour, plus head and neck. Muscle groups are drawn as separate shapes with a 0.8px card-colour stroke (the "cut" lines), grouped into the five BIA segments: **trunk** = traps, pecs, 3×2 abs blocks, lower abs, obliques; **each arm** = deltoid cap, biceps, triceps sliver, forearm (brachioradialis + inner sliver); **each leg** = vastus lateralis, rectus femoris, vastus medialis teardrop, two calf heads. Head, neck, hands, knees and feet stay base grey. Exact paths are in the DC; port them as-is.
- Fill colour: raspberry in Muscle mode, slate in Fat mode. Opacity encodes % of standard per segment: muscle `clamp(0.5 + (pct−100)/45, .4, .95)`, fat `clamp(0.32 + (pct−50)/100, .3, .95)`. Deeper = more. Every muscle in a segment shares the segment's opacity (the scale only knows five segments).
- **Muscle ↔ Fat morph.** Segmented control (card-alt pill, raspberry thumb). On switch: each rect transitions `opacity .55s ease` and `fill .55s ease`, staggered 0/.05/.1/.15/.2s (right arm → left arm → trunk → right leg → left leg) so the body "re-reads" top-down. Labels crossfade with the values (no layout shift: fixed widths).
- Labels: RIGHT ARM / RIGHT LEG left column (right-aligned), LEFT ARM / LEFT LEG right column, TRUNK under the figure, each `4.19 kg` + `122% of std`. Subject's right is on the viewer's left — label columns are placed accordingly.
- **Balance meter** (Arms, Legs): 2px rule with a 1px centre tick; raspberry 8px dot offset `(L/(L+R) − 0.5) × 100 × 12px` (1% imbalance = 12px), `transition: left .6s`. Text `L 50.2 · R 49.8`. Verdict in green when both within 1% ("Balanced · within 1%"), otherwise grey "Left arm +3.1%" — still never red.

## 5 · Body-type matrix

- 320×236 viewBox; plot 36..310 × 10..200. x = body fat % 5→40, y = BMI 18.5→40 (inverted). Column rules at 12% and 20%; row rules at BMI 25 and 30. Current cell gets a wash fill (radius 6). Nine cell captions, 9px/600 faint, current cell's caption in deep/700: HEAVY · LEAN, BUILT, CARRYING FAT / DENSE, ATHLETIC, OVER-FAT / VERY LEAN, FIT, LIGHT · SOFT. Axis ticks 18.5/25/30 and 12/20/40.
- Trail: one point per month (monthly mean BMI × BF), polyline 1.5px raspberry @50%, hollow 3.5px dots with month labels; opacity ramps `.35 → .85` oldest→newest. Current = 6px raspberry dot with 2.5px card halo.
- **Draw-on.** When the card enters the viewport (bottom − 140px): polyline `stroke-dasharray = length`, `stroke-dashoffset length → 0` over `1.8s cubic-bezier(.4,0,.2,1)`; dots fade in behind the line; a `ring` pulse (scale 1→2.4, opacity .6→0, 1.8s loop) starts on the current dot. Plays once per visit.
- Footer: `Now Athletic · BMI 26.1 · 13.2% fat` and `Dec: BMI 37 · 34%`.

## 6 · Trend chart

```
TrendChart { metric, range:'7d'|'30d'|'90d'|'6mo'|'all'|'custom', points:[{day,value}], unit, decimals }
```
- 360×160 viewBox, `preserveAspectRatio: none`, plot x 6..354, y 14..146; three hairline gridlines (top/mid/bottom). y-domain = min/max of the raw points in range.
- Raw points as circles: r 3.2/2.2/1.4 and opacity .45/.45/.28 for n ≤20 / ≤60 / >60. Smoothed line = centred 7-day mean (±3), 2.5px raspberry, round joins; wash area under it at 10%. For n < 12 (tape metrics) the line passes through the raw points and the caption reads "tape points".
- Header pill (right): `Δ over range · label` from the smoothed ends, e.g. `−2.1 kg · 90d`.
- Metric chips (pill): Weight · Body fat · Skeletal muscle · Water · BMR · Waist. Range chips (8px radius, smaller): 7d · 30d · 90d · 6mo · Since start · Custom. Custom reveals from/to date chips (dashed border) under the row. Switching chips re-fits the domain; raw dots and line crossfade `.25s`.
- **Scrub.** Pointer capture on the chart box; index = `round((x − 6) / (348/(n−1)))`, clamped. Hairline ink @22% + 5px dot with card halo at the snapped point; tooltip (ink bg, paper text, 11.5/600, radius 8) clamped to `[0, 228]px` left and sits 40px above the point. **Haptic tick on every index change** (`UIImpactFeedbackGenerator(.light)` / `navigator.vibrate(3)` on web); none while the index is unchanged, so a slow drag ticks per point and a fast drag ticks continuously. Release leaves the tooltip on the last point (no snap-back); reselecting a chip resets to the newest.
- Footer: first date · `7-day trend over daily points · touch & drag` · last date.

## 7 · Tape

- Header `TAPE · TAPED OCT 4`, sort chip (Site order → Most changed → Oldest tape), raspberry `Tape` button with mic glyph.
- Row grid `92px 1fr 64px 76px`: site + "when" (date or `today`) · sparkline (60×20, all points, 1.6px @70%, dot on last) · Δ since first tape (green only for waist/hips/neck going down) · value 16/700 + `cm`.
- Row tap = single-site quick entry (sheet opens straight in **keypad** with that site selected). `Tape` button / dock mic = **voice**.
- **Voice flow (confirm before save):** sheet slides up `.42s cubic-bezier(.32,.86,.3,1)` with scrim `.35s`. Listening state: 96px raspberry mic with two `ring` pulses (1.6s, offset .5s) and six VU bars; hint "Say it like “waist 86.5” — one site or the whole round"; `Type instead`. On transcript: parsed card pops in (`popIn .4s`): SITE · DATE kicker, 44px value, `was 88.0 · Sep 6`, `−1.5 cm` in green. Buttons Again / Edit / **Save** (2:1). A sentence with several sites yields one card per site, stacked, one Save.
- **Keypad:** site chips (scrollable), 48px value (ghost `–` when empty), `last 88.0 cm / Sep 6` on the right, 3×4 grid (1–9, `.`, 0, ⌫), 50px keys, `:active` = wash. Max 5 chars, one decimal. Save button is ghost until the number is valid (10–200), then raspberry `Save waist`. Mic button beside it returns to listening.
- **Save confirmation:** circle draws (`stroke-dasharray 239`, `.6s`), check draws (`.4s` starting at `.45s`), title + "Row updated · trend extended" rise in. Sheet closes at 1.3s; the row's background flashes wash and fades over `.9s`; the sparkline gains the point; `TAPED` date updates. Haptic `.success` on save.

## 8 · Milestones

- `MILESTONES · FROM 117.3` + `42 weeks`. Vertical timeline: 1px rule, 6px raspberry dots with card halo; each row = title (13.5/600), date `· note` (11 faint), weight at the time (12.5/600 secondary, right).
- Content is both automatic (first 10 kg, under 100, 30 kg gone, BMI under 30/27, body fat under 15%) and user-logged (pant sizes, the climb, the swing PR). No badges, no confetti.
- **Reveal.** When the card enters the viewport: the raspberry progress line grows `height 0 → 100%` over `2.2s cubic-bezier(.4,0,.2,1)`; rows fade/rise (`opacity 0→1`, `translateY 14→0`, `.5s`) staggered `0.09s` each, top to bottom. Plays once per visit.

## 9 · Metric push-in

Slides from the right over the main screen (`translateX 100% → 0`, `.42s cubic-bezier(.32,.86,.3,1)`, left shadow). Back pill, kicker `BODY · SMART SCALE`, title, Δ pill for the selected range. Card 1: 46px value + unit, min–max for the range, range chips, Trend chart. Card 2: `AGAINST THE BAND` — one Range bar with axis labels, `band lo–hi`, and the metric's `bandNote` sentence. Card 3: `WEEKLY READINGS` (6 rows, 7 days apart, value + Δ vs previous week) — for tape metrics, `TAPES` lists the actual tapes. Card 4: wash `WHAT IT MEANS` (copy in DC `NOTE`; fat/muscle/BMR/weight unchanged from the current app).

---

## 10 · Motion law (whole surface)

- Easings: enter/slide `cubic-bezier(.32,.86,.3,1)`; settle (markers, bars) `cubic-bezier(.22,.9,.3,1)`; draw-on `cubic-bezier(.4,0,.2,1)`. Durations: state chips `.25s`; marker slides `.6–.8s`; sheets `.42s`; draw-ons `1.8–2.2s`.
- Cards rise on first paint `rise .5s`, staggered `.04s` per card (existing Pitaya pattern).
- Nothing loops except: the sync dot while syncing, the mic rings while listening, and the matrix "now" ring after the trail has drawn.
- Scroll-triggered reveals (matrix, milestones) fire once per visit; respect `prefers-reduced-motion` by rendering the end state.
- Haptics: scrub tick `.light` per index change; pull threshold `.light`; sync done / tape saved `.success`. Nothing else vibrates.
