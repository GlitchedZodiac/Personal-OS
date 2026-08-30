# Pitaya Watch — in-workout v3: new swipe pages + the motion layer

*Prompt for a Claude Design session (drafted 2026-08-28, per Michael's call
that the v3 swipe pages go through design before they're built). Output
slices land in `docs/design/watch-v3/`; implementation is then a PORT
(CLAUDE.md port gate). The engineering behind every slice is already in
place — recorder plumbing, trail APIs, sync fields — so the port session
builds views only.*

---

## What this is

Pitaya is my personal health OS; its Apple Watch app is the training
companion I use daily (kettlebell routines, EMOMs, walks, trail runs, hikes,
freestyle sessions). The in-workout experience is a vertically swiped
carousel of pages. Several pages are shipped and designed; this round adds
**two new swipe pages, one post-save screen, and — most importantly — the
motion layer**: how the screen breathes, pulses, and alerts while I train.
Design for glanceability mid-effort: sweaty, moving, 1-second looks.

## Design system (already established — stay in this family)

- Fonts: Familjen Grotesk (display/numerals), Instrument Sans (labels/body).
- Dark ground, dragonfruit identity: pink accent, mint for
  confirmation/success, the contour-curve trail motif, zone colors Z1→Z5
  (cool → hot).
- Custom 24×24 glyph grammar — every icon drawn in-file, never a system icon.
- Existing designed pages for reference (do NOT redesign, match them): live
  metrics page (elapsed, beating heart + BPM, zone bar, KCAL + SETS/KM), set
  logger (crown-dialed weight/reps), trail stats page (route line over
  contours, GPS pill, pace, Z2 card), controls page (End/Pause/Lock),
  summary/receipts (§03 delta stats + insight cards), PR banner.
- Canvas: 45mm watch (396×484 px), round-corner safe areas; note anything
  that must adapt at 41mm.

## Deliverables

One SVG artboard per screen/state, assets extractable verbatim. For every
animation: a **motion spec** (element · trigger · duration · easing · repeat
· paired haptic) — implementation will port these timings exactly, so
specify real numbers.

## Slices

**1. EFFORT page** (new swipe page, all workout kinds) — the "how hard am I
working" view: live heart-rate graph of the last ~10 minutes with zone bands
behind it, current BPM large with its zone chip, active calories + burn rate
(kcal/h), live steps + cadence (steps/min). States: active ·
always-on/wrist-down (frozen graph, outlined fills, dimmed) · paused.

**2. LIVE MAP page** (new swipe page, outdoor kinds: walk/run/hike) — my
trail drawn live on a real map (Apple standard map underneath — you design
the overlay chrome, not the tiles): route line in accent, start ring, live
position dot, GPS quality pill, distance + current pace strip. States: map
loaded · no-tiles/offline fallback (route line over the brand contour ground
— this doubles as the always-on face) · paused.

**3. ZONE-CHANGE moment** (the alert/pulse — this is the heart of the motion
ask): what happens the second my heart rate crosses into a new zone. Think:
a full-screen pulse of the new zone's color, the zone numeral taking over
for ~1.5s, then settling back; distinct up-zone vs down-zone treatments; the
paired haptic for each; and how it's suppressed or minimized on the
always-on display. It should be readable without looking — color + haptic
doing the work.

**4. HEART PULSE**: the beating heart currently animates at a fixed rhythm.
Spec the real version — beat synced to live BPM, the scale/glow of each
beat, zone-tinted treatment as intensity climbs, and its frozen always-on
form.

**5. SAVE TRACK prompt** (after saving an outdoor workout): "Save this
track?" — matched-trail suggestion rows with run count ("el Cerro de las
Tres Cruces · 3rd time"), a "New trail…" row (dictation entry), "Skip".
Success state: mint check + trail name. Also: the **Saved trails list**
inside the Hike menu (name, distance, +elevation, last run) — starting a
hike from a saved trail.

**6. SAVING states**: the Save CTA mid-flight ("Saving…", spinner, dimmed,
un-tappable) and the failure line ("couldn't save — try again") — currently
shipping as plain engineering states, waiting for their designed treatment.

**7. Propose more moments** (optional — "among other things"): a km/split
flash during outdoor sessions, the 60-second heart-rate-recovery capture
after a workout, milestone flourishes (halfway through an EMOM, weekly
volume goal met), harmonizing the existing PR banner into the same motion
language. Propose freely; nothing here is required.

**8. Backlog riders** (flagged UNDESIGNED in the shipped app — fold in if
the round has room): the Freestyle list row, the Weight Training row + its
barbell glyph (built to the kettlebell glyph's 24×24 grammar), the Hike
submenu.

## Swipe map (so the carousel reads as one system)

- Kettlebell: Metrics → Set logger → **Effort** → Controls
- Outdoor: Metrics → **Live map** → Trail stats → **Effort** → Controls
- Treadmill: Metrics → **Effort** → Controls
- Freestyle: Freestyle face → **Effort** (freestyle keeps End on its first
  page)

## Hard constraints

- Always-on display: every in-workout page needs its wrist-down form (no
  animation, outlines, dimmed — the shipped pages set the grammar).
- Battery: GPS already dominates outdoor sessions; motion should be
  event-driven (zone change, beat, split), not perpetual full-screen
  animation.
- No system icons on designed surfaces; assets ship in the SVG.
