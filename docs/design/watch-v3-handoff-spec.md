# Pitaya watchOS — v3 implementation spec (in-workout round 3, locked)

> **Extraction contract: adopt 1:1 — do not interpret.** Every color, size, timing,
> haptic, copy string and SVG path here and in `Pitaya Watch Round 3.dc.html` is final.
> Design source of truth: `Pitaya Watch Round 3.dc.html` (§00–§09). Copy assets verbatim
> (PORT GATE: no icon-library substitutions, no SF Symbols on designed surfaces).
> **Picked:** Effort = 3a · Live map = 3c (with 3d's stat row folded in) · Zone-change = 3f ·
> Heart = 3h. **Do NOT build:** 3b, 3d (as a page), 3e, 3g — they stay in the file for the record.
> Code base: branch `claude/watch-app`, `ios/**`. Where a value is missing, ask — don't invent.
>
> Canvas: 45 mm, 396×484 px @2x → pt = px/2 (e.g. 66 px type = 33 pt). 41 mm (352×430)
> adaptations are called out per section. Target hardware: Series 8 — 60 Hz, transform +
> opacity only (no animated blur/filters), all motion event-driven, AOD animates NOTHING ever
> (haptics still fire). Nothing full-screen lives past 2 s.

## 0 · New tokens (Theme.swift) + shared vocabularies

Zone ramp, cool → hot (`Theme.zone1…zone5` + `zoneDim1…zoneDim5`); chip text is always `#131216`:

| Zone | Name · BPM (served by /api/mobile/zones) | Fill | Dim (washes/bands) |
|---|---|---|---|
| Z1 | RECOVERY · <122 | `#7FA6C9` | `#14212B` |
| Z2 | EASY · 123–152 | `#8FBF9C` | `#1E2A22` |
| Z3 | AEROBIC · 153–167 | `#C97D9C` | `#26161C` |
| Z4 | THRESHOLD · 168–182 | `#DC74A0` | `#2A1420` |
| Z5 | MAX · 183+ | `#FFD9E8` | `#3D1526` |

ZoneBar (Components.swift) recolors: active segment takes its zone fill (today: flat accent).

**Motion ladder (constants):** attack 90 ms ease-out · wash-in 140 ms ease-out · arrival
spring 350 ms cubic-bezier(.34,1.4,.5,1) ≈ SwiftUI `.spring(duration: 0.35)` · settle/morph
450 ms ease-in-out · exit 260 ms ease-in · hold ≤ 900 ms.

**Haptic map (WKHaptic), one meaning per pattern:** up-zone `.directionUp` · down-zone
`.directionDown` · km split `.notification` · save/HRR-done/PR `.success` · save failed
`.failure` · EMOM boundary `.start` ×2 (ships) · crest + countdown tick `.click`.
All respect Settings → Haptics ("key moments" keeps every row; "everything" adds per-beat
ticks at Z5 only; "off" silences haptics, visuals still play).

**Carousel order (tag order in LiveWorkoutView's TabView):**
Kettlebell: Metrics → Set logger → **Effort** → Controls ·
Outdoor (walk/run/hike): Metrics → **Live map** → Trail stats → **Effort** → Controls ·
Treadmill: Metrics → **Effort** → Controls ·
Freestyle: Freestyle face (keeps End) → **Effort**.
Every in-workout page header carries a zone chip from this round on.

## 1 · Effort page (3a — strip chart) — NEW `EffortPage.swift`, all kinds

Padding 46/30/34 px. Rows top→bottom:
- Header: "EFFORT" kicker (12 px, tracking .16em, 700, `#DC74A0`) · elapsed right (Familjen 14 px 600, `#66646C`, tabular).
- BPM row (+8): BeatingHeart 26 px (§4) · BPM 66 px Familjen 700 white · right: zone chip (Familjen 19 px 700 on zone fill, radius 9, pad 4×11) over zone name (9.5 px, tracking .14em, zone color).
- Graph (flex, ~158 px): last 10 min of `hrStream`/`timeStream` (~1 Hz), y-range 55–195 bpm. Zone bands behind at his boundaries — fills = zone color at 10/11/10/8/6 % alpha (Z5→Z1), boundary hairlines `rgba(255,255,255,0.05)`, right-edge Z2–Z5 labels 9 px at 50–55 % zone color. Trace `#F2F1F2` 2.6 px round; now-dot r 4.5 in zone fill, opacity 1→0.35→1 over 1 s loop. Redraw snaps per sample — no display-link, no tween. Corner labels "−10 MIN"/"NOW" 9 px `#55535A`.
- Stat grid 2×2 (+16, gap 9×14, **cells centered**): value 24 px Familjen 700 white, label 9.5 px `#66646C` tracking .12em. Cells 1–2 always: KCAL · KCAL / H (burn = kcal delta over trailing 5 min, floor 0). Cells 3–4 **kind-aware**: walk/run/hike/treadmill → STEPS · STEPS / MIN (live via CMPedometer callback — HK stepCount is finish-only); kettlebell/weight/freestyle → AVG BPM · PEAK BPM.
- **Paused:** kicker → "PAUSED" (`#96949B`), elapsed holds, page dims to 62 % (260 ms ease-in), HR trace continues **dotted** (`#66646C`, dash 3 6) so recovery stays visible, burn reads 0, steps hold. Resume: 350 ms spring, haptic `.start`.
- **AOD:** graph frozen at last raise, bands → hairlines `#1D1C21` only, trace `#55535A`, chip outline-only (1.5 px zone at 55 %, no fill), BPM stays at 55 % luminance (`#A5A3AA`), heart outline (§4), stats row leaves, elapsed → "42 MIN". Zone-change while wrist-down: chip outline recolors at next 1 Hz tick.
- 41 mm: graph 122 px, BPM 58 px, grid unchanged.

## 2 · Live map page (3c full-bleed + 3d's stat row) — NEW `LiveMapPage.swift`, outdoor kinds

MKMapView: standard style, dark, POI labels off, north-up, non-interactive; auto-pan 600 ms
ease-in-out whenever the head dot leaves the upper ⅔. Tiles are Apple's; everything on top is ours:
- Route: `route.coordinates`, accent `#DC74A0` 4.5 px round, under-glow = second stroke `rgba(220,116,160,0.22)` 11 px (never a blur filter). New fix extends the last segment with a 450 ms ease-in-out tween.
- Start ring: hollow, r 6, stroke 2.5 accent. Head dot: 16 px accent core, 3 px white ring, pulse ring 2 px accent scaling 0.55→2.1 fading over 1.8 s loop (running + hasFix only).
- Top scrim 118 px `rgba(0,0,0,0.82)→0`; kind kicker left; **GPS pill** right: dot 6 px + label 10 px 700 tracking .1em in a `rgba(0,0,0,0.5)` pill, border `rgba(143,191,156,0.3)`. States from RouteTracker: hasFix → mint "GPS", dot blinks 1.6 s (was 0.8 — retime the shipped GPSPill) · authorized no fix → `#96949B` "SEARCHING", static · unauthorized → muted "NO GPS".
- Bottom scrim 196 px `rgba(0,0,0,0.9) 38%→0`. Distance hero "4.18" 44 px Familjen white + "KM" 10 px `#96949B`. Under it (+12) a 4-cell centered row, values 20 px / labels 9 px `#96949B`: `/ KM · NOW` (trailing 60 s) · `ELEV M` (+elevationGainLive) · `STEPS` · beating heart 13 px + `BPM`.
- **Paused:** kicker → PAUSED, pace empties "—:——", distance labeled "KM · HELD", head dot stops pulsing (solid), route/tiles untouched, GPS pill keeps true state.
- **Offline / no-tiles fallback = the AOD face:** tiles crossfade 260 ms to the brand contour ground — five contour curves `#1C1B20` 2 px spanning the screen (extract paths from the board) on black. Route drops to `#A63D63` 4 px, start ring `#A63D63`, head dot hollow accent ring r 7, no pulse, no blink, heroes at 55 % (`#A5A3AA`), pace label drops "NOW", stat row leaves (distance + pace only). Same face serves both duties.
- Saved-trail target (§5): trail draws as **ghost dashed line** (`#66646C` 2.5 px, dash 4 6) under the live route.
- 41 mm: hero 38 px, row values 18 px, scrim 172 px.

## 3 · Zone-change moment (3f — bloom) — NEW ZonePublisher on WorkoutRecorder

Publisher: classify each hrStream sample against served boundaries; a crossing needs **5
consecutive samples** in the new zone; emits (from, to, direction); **20 s cooldown**, latest
crossing wins, **Z5 entry exempt**; never while paused; never in the first 60 s of a session.
Fires over whichever page is visible.

- Haptic at fire time (before visuals land): `.directionUp` / `.directionDown` — once.
- **Bloom:** pre-baked radial sprite (ellipse ~516×340 px, zone color 55 %→0 at 62 %), slides in
  on transform 500 ms ease-out + fades out 400 ms. Direction encodes: **up rises from the bottom
  bezel, down falls from the top.** Total 900 ms. Page content never covered.
- **Zone chip:** pops scale 1→1.26→1, 350 ms spring, tint crossfades 160 ms at 150 ms after bloom
  start; zone-name line swaps with "↑"/"↓" (e.g. "THRESHOLD ↑") in the new zone color.
- **AOD:** suppressed entirely — haptic fires, outlined chip recolors at next 1 Hz tick. Raise the
  wrist within 6 s of the crossing → the moment plays once from the bloom.

## 4 · Heart pulse (3h — lub-dub) — rewrite `BeatingHeart` (Components.swift)

- Beat period = 60/BPM s from the live sample; timer re-armed per HR sample. Keyframes per cycle:
  scale 1→**1.12 @ 8 %**→1.03 @ 16 %→**1.18 @ 26 %**→1 @ 48 %, rest to 100 %.
- Glow from Z3 up: radial sprite behind (r ≈ 1.6× heart), zone-tinted — Z3 `#C97D9C` · Z4 `#DC74A0` ·
  Z5 `#FFD9E8` — opacity 0.18→0.85 @ 10 %, linear decay per beat. No glow Z1–Z2.
- Z5: heart fill itself crossfades `#DC74A0`→`#FFD9E8` (260 ms); BPM digits read blush with it.
- **Half-beat mode above 180 BPM:** animate every second beat at 1.2× amplitude (3 Hz flutter is
  noise at glance distance and costs frames on Series 8).
- **AOD:** frozen outline — stroke 1.8, no fill, no glow — beside the last BPM at 55 %.
- Applies everywhere BeatingHeart lives: metrics, trail stats, Effort, live map.

## 5 · Save track (outdoor, post-sync) — NEW `SaveTrackView.swift` + Hike submenu

Prompt slides up 350 ms spring, **600 ms after `.synced`** (queued saves skip it — matching needs
the server; trail match + save APIs are in place). Max 2 suggestions sorted by overlap.
- Title "Save this track?" Familjen 27 px white · sub "6.4 km · looks like one you know" 12.5 px `#96949B`.
- Suggestion rows (card `#17161A` r 18, pad 12×14): trail-bookmark glyph in 34 px `#2A1420` circle ·
  name 15 px 600 (wraps, never truncates) · sub "3rd time · 6.4 km · 94% match" 11 px `#66646C` · ›.
- "New trail…" row: mic glyph in outlined circle (`#17161A`, border `#2A292E`), label accent, sub
  "dictate a name" → system dictation → success.
- "Skip" ghost 14 px `#96949B` bottom — stores nothing, never re-asks this session.
- **Success:** 76 px mint ring + check (path draws 350 ms ease-out), "Track saved" 26 px, name mint
  14 px, sub "3 runs · syncs with the workout", haptic `.success`, auto-return to summary 1.2 s.
- **Hike submenu** (replaces the flat Hike row): header ‹ Hike · "Open hike" row (mountain glyph,
  sub "no target · GPS + elevation") · kicker "SAVED TRAILS" · rows: bookmark glyph, name, sub
  "6.4 km · +312 m · Sun". Tapping starts a hike with the trail as ghost target (§2) and skips the
  end-of-run prompt (run count just increments).

## 6 · Saving states (SummaryView CTA)

- Tap Save → label crossfade 160 ms to "Saving…" `#D9A7BD`, pill dims to `#6B2740` (65 % accentDeep),
  **spinner = brand diamond** rotating 900 ms/rev linear, un-tappable, Discard hidden.
- `.synced` → header check strokes mint + CTA morphs to "Done" (220 ms), haptic `.success`.
- `.failed` → pill restores instantly + shakes ±6 px ×3 cycles 260 ms, haptic `.failure`; line
  "couldn't save — try again" (12 px 600 `#E08585`, ! glyph) slides in 220 ms. Workout stays local.
- `.queued` ships unchanged ("offline · queued to sync").

## 7 · Moments (all in scope)

- **Km split (outdoor):** banner top — `#3D1526` card, border `#A63D63`, r 20: "KM 4" Familjen 23 px
  `#FFD9E8` · time right 23 px white · sub "9 s faster than your average" mint (slower: plain ghost
  copy, no mint). Spring in 300 ms, hold 2 200 ms, out 260 ms up. Haptic `.notification`. Never in AOD
  (split still logs). metricsData gains `splits[]` (per-km seconds).
- **HR recovery (post-save, any workout with HR):** full screen — "RECOVERY · 1:00" kicker, 190 px
  mint ring drains linearly over 60 s, live falling BPM 58 px center ("BPM · FALLING"), mint spark
  polyline draws with it; at 0: verdict fades in 260 ms — "−31 in 1:00 · quick" (quick ≥25 · typical
  15–25 · slow <15), haptic `.success`. "Skip" ghost bottom. Recorder already stays alive 60 s (§03
  R1 spec); this feeds the existing HRR summary card. metricsData gains `hrrDelta` + `hrrSeconds`.
- **EMOM halfway (round N/2 boundary):** rides the shipped boundary wash (120/400 ms) + blush diamond
  26 px sweeps across at y 200 px, 700 ms linear + "HALFWAY" Familjen 34 px `#FFD9E8` / "10 down ·
  10 to go" `#E9A8C4`, in 12 px rise, total 1.4 s. Haptic `.success` (boundary keeps `.start` ×2).
- **Elevation crest (hikes, every +100 m of elevationGainLive):** contour lines ripple up −7 px once,
  120 ms stagger, gain counter ticks in blush `#E9A8C4` (220 ms crossfade), 600 ms total, `.click`.
  Trail-stats + map pages only.
- **Streak seeds (save extends streak):** 3 diamond seeds (mint, pink, mint) arc off the mint check —
  PR-burst curve, 700 ms — sync line gains "◆ day N". No streak change → nothing. Never alongside a
  PR banner (PR wins).

## 8 · Riders (HomeView list)

- **Weight training** row (barbell glyph, sub "bar · plates · PRs"): reuses the kettlebell machinery —
  crown weight, tap reps, PR line — with **2.5 kg detents** instead of bell stops.
- **Freestyle** row (pulse glyph, sub "just record · shape it in Pitaya after"): watch-contract flow
  verbatim — start/stop + live HR, syncs `workoutType: "freestyle"`, no structure UI; runs the
  two-page carousel (§0).
- **Hike** row sub becomes "3 saved trails · open goal", opens the §5 submenu.

## 9 · Glyphs — extend `PitayaGlyphs.swift` (24×24 · stroke 2.1 · round caps/joins · verbatim)

- barbell: `M2.8 12h1.6` `M19.6 12h1.6` `M9.2 12h5.6` + rects (4.6,8.2,2.3,7.6 r1.1) (6.9,6.2,2.3,11.6 r1.1) (17.1,8.2,2.3,7.6 r1.1) (14.8,6.2,2.3,11.6 r1.1)
- freestyle: `M3 13h3l2.2-5.4 3.3 10.8 2.3-7.2 1.4 1.8H21`
- trail-bookmark: `M6.5 3.5h11v17l-5.5-4.2L6.5 20.5Z` + `M9 9.5c2-1.5 4 1.5 6 0`
- mic: `M12 3.5a2.8 2.8 0 0 1 2.8 2.8v4.4a2.8 2.8 0 0 1-5.6 0V6.3A2.8 2.8 0 0 1 12 3.5Z` + `M6.2 10.7a5.8 5.8 0 0 0 11.6 0` + `M12 16.5v3.7`
- cadence: rect (5.2,3.6,5,9.2 r2.5, rotate −13° about 7.7,8.2) + rect (13.9,11,5,9.2 r2.5, rotate 11° about 16.4,15.6)
- flame: `M12 3.6c1.1 2.5-.3 4-1.5 5.4-1.3 1.5-2.6 3.1-2.6 5.2a6.1 6.1 0 0 0 12.2 0c0-3.5-2.4-5.2-3.5-7.6-.7 1.2-1.8 2-1.8 3.6 0-2.5-1-4.7-2.8-6.6Z`
- split-flag: `M7 20.5V4` + `M7 4.5h10l-2.6 3.6L17 11.7H7`
- heart (shared by §1/§2/§4 at new sizes): `M12 20.2 C6.2 15.3 3.6 11.9 3.6 8.9 A4.1 4.1 0 0 1 12 7.2 A4.1 4.1 0 0 1 20.4 8.9 C20.4 11.9 17.8 15.3 12 20.2 Z`

## File map

| Area | Files |
|---|---|
| Tokens + zone ramp | `ios/Shared/Theme.swift` (+zone1–5, zoneDim1–5, motion/haptic constants), `Components.swift` (ZoneBar recolor) |
| Effort page | new `EffortPage.swift`; `LiveWorkoutView.swift` (tag order, all kinds), CMPedometer source in `WorkoutRecorder.swift` |
| Live map | new `LiveMapPage.swift` (MKMapView + overlay + contour fallback); `TrailPage.swift` GPSPill retime (0.8→1.6 s); RouteTracker unchanged |
| Zone-change | `WorkoutRecorder.swift` (ZonePublisher: 5 s debounce, 20 s cooldown, Z5 exempt); bloom overlay on the live container |
| Heart | `Components.swift` BeatingHeart rewrite (BPM timer, lub-dub, glow, ½-beat, AOD outline) |
| Save track + saving | `SummaryView.swift` (CTA states), new `SaveTrackView.swift`, `HomeView.swift` (Hike submenu) |
| Moments | split/HRR/crest overlays in live + summary flows; EMOM halfway in the sequence runner |
| Riders + glyphs | `HomeView.swift` rows, `PitayaGlyphs.swift` (+8 paths above) |
| Sync additions | `metricsData.splits[]`, `hrrDelta`, `hrrSeconds`; trail match/save APIs consumed as-is |
