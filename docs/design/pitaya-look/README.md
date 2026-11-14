# Pitaya Look — the design round, slice 1: Train

**Status: second pass, waiting for Michael's reaction. Nothing is built from it yet.**

The round is designed in the session, on a Design canvas. The brief is
[`../pitaya-look-design-prompt.md`](../pitaya-look-design-prompt.md).

- **Canvas (private to Michael):** https://claude.ai/artifact/5i5E5Fd3d8hb3W9EdGaXJq
- **Drawn from:** the original Train screen in `pitaya-app.dc.html`, on the
  tokens and type scale in `pitaya-tokens.md` → "The standard". Icons are
  the app's own, from `components/pitaya-icons.tsx`. Every number on the
  canvas is invented.

## Second pass — five highlights (2026-11-13)

Michael's reaction to the first pass: too many sections he never looks at,
too much text, too many tables. He asked for highlights with drill-downs,
and for the five things Train must show, chosen from how he actually uses it.

What his logs show (read through the connector, no numbers kept here):

- Most sessions arrive from the watch as Freestyle, or from Claude. The
  phone's own "Start live workout" is rarely the way in.
- Every session carries calories and heart rate. Tonnage is missing on
  about half, so it cannot be the headline number.
- Records have recently moved together, a whole bell size up.
- No week is planned in the app. Rope is mostly rounds inside circuits.
  Named trails are occasional.

**Train is now one phone screen with five tiles.** Each tile is a tap into
detail:

| Tile | Shows | Tap opens |
|---|---|---|
| This week | Calories burned, sessions and active time, a seven-day strip of hard and easy training | The week: its sessions and its plan (**not drawn yet**), then all activities |
| Last session | What it was, minutes, calories, a zone bar, average heart rate | That session's page (exists today) |
| Your bell | The weight he is on now, how many lifts moved up | All records (drawn) |
| Walking | Distance and steps this week | Steps & calories history (exists today) |
| 8 weeks | Weekly burn as eight bars, one line of verdict | Trends (**not drawn yet**): volume, by movement, jump rope, trails, effort |

One small **Start** button in the header replaces the two large buttons and
opens the Routines sheet.

## Brand kit — Michael's decisions (2026-11-14)

The round turned into a brand kit, built together. Michael asked where the
blue came from; the honest answer was "nobody decided it", so the brand got
written down. He picks on a choices page; the kit records what he picked.

- **Brand kit (private to Michael):** https://claude.ai/artifact/6e2pxDUCNvMPtT581Hc2ic
- **Choices page (private to Michael):** https://claude.ai/artifact/DkwFYyWeMBJvwVVwgVo2eV

| Part | Decision | What it changes in the app when ported |
|---|---|---|
| Fonts | Space Grotesk for titles and numbers, Inter for the rest | Replaces Familjen Grotesk and Instrument Sans everywhere, the watch included |
| Default look | Day first | Appearance defaults to Day, not System; this also settles look-plan D17 |
| Logo | The dragonfruit, alone | The diamond bullet goes (record banner, kickers, the tokens doc's "mark") |
| Glow | Strong, under lines and rings | Reverses the brief's "no glow" for charts |
| Under a line | A fade | Reverses the brief's "no gradients" for charts only |
| Motion | Quiet, with pop for a record, a save, a target reached | Settles look-plan D1 |
| Tagline | Serving God's Kingdom With Mind, Body & Spirit | Replaces "It's just you. Prove it." |
| Voice | No slogans, alerts or cheerleading on screens; numbers and trends | "Yesterday's you lifted less.", "Best week yet" and clever empty states are cut |
| On track / off track | Coloured | Reverses the Body round's "never red, never HIGH"; `lib/delta.ts` and the Body screen need a pass |

**Still open:** the palette (five colour-wheel options built on the
dragonfruit colour) and the icon style (three redraws; the kettlebell gets a
round bell and a wide handle). Train on the canvas already uses the decided
fonts, glow and fade; its colours wait for the palette.

## Third pass — the chart language (2026-11-14)

Michael's reaction to the five tiles: right content, but the bars "look
old". He asked for modern, tappable or draggable line graphs and sent two
reference screenshots (dark analytics dashboards: rings with a number in the
middle, smooth glowing lines with a marker and value tag, thin rounded bars,
a pink-and-blue pair).

The reference set the chart forms, not the brand. Pitaya's colours stay.

| Tile | Chart now |
|---|---|
| This week | A two-tone ring (hard / easy) with the week's calories inside, and a smooth line of the week's days with a marker and a value tag. **Draggable.** |
| Last session | A smooth heart-rate line. |
| Your bell | A small progress ring: lifts moved up, of all lifts. |
| Walking | Seven thin rounded bars. |
| 8 weeks | A smooth line with a marker and a value tag. **Draggable.** |

Train · highlights is drawn in Day and Night from one file (a `night`
switch), so the two cannot drift apart.

**Three choices that depart from the original brief, for his ruling:**

1. A soft glow under lines and rings. The brief said no glow; his references
   show it. Kept restrained.
2. A second colour, the palette's slate blue, for easy days and walking. The
   brief said one accent.
3. No colour fades: the fill under a line is a flat tint. The brief said no
   gradients, and this keeps to it.

For the port: the draggable lines need a pure function from a pointer
position to the nearest point, with unit tests, and a keyboard path (the
canvas uses a native range input for both). The pages the taps open still
use the old bar charts and follow once this style is approved.

## Where everything on today's Train went (second pass)

Read from the code (`app/(tabs)/health/workouts/page.tsx` and the components
it mounts). Nothing is dropped without a ruling; most things moved one tap
down.

| Today | In the design |
|---|---|
| Header kicker and title | Kept. The kicker is trimmed to "Week N". |
| Header pill: tonnage lifted | **Moved** to Trends. The week's headline is calories burned. |
| Start live workout · Routines (two buttons) | **Merged** into one Start button → Routines sheet. *Needs a ruling.* |
| Start picker sheet | **Merged** into the Routines sheet. |
| Live session, "Saving…", the guided EMOM clock | Kept, behind Start. The last two are not drawn yet. |
| This week · planned | **Moved**: planned days appear as outlines in the week strip only when a plan exists; rows and their actions live on the week page. |
| Overview: sessions, active time, kcal | Kept, in the This-week tile. |
| Overview: outdoor km, rope time | **Moved**: distance to the Walking tile, rope time to Trends → Jump rope. |
| View activities → | **Moved**: the This-week tile opens it. |
| Steps & calories history → | **Moved**: the Walking tile opens it. |
| Record banner | **Replaced** by the Your-bell tile. The banner itself returns as the moment a record is set (see A / B). |
| Today's session card | **Replaced** by the Last-session tile; the movement rows are on the session's page. |
| Volume · 8 weeks, By movement · 8 weeks | **Moved** to Trends. Train keeps eight bars. |
| Jump rope section | **Moved** to its own page, reached from Trends. |
| PR wall | **Moved** to All records. |
| Trails card | **Moved** to Trends. |
| Trails: "● Record" (only shows a message) | **Proposed drop.** *Needs a ruling.* |
| Effort · time in zones | The latest session's zones are on the Last-session tile; the rest moved to Trends. |
| Empty states | To be redrawn for the five tiles. |

## For Michael to rule on

1. **Are these the right five?**
2. **Quiet or pop?** Boards A and B.
3. **Drop "● Record"** on Trails. It does nothing but say recording lives on the watch.

## Also on the canvas

- **Where the taps lead:** All records, Jump rope, the Routines sheet, the
  live session.
- **A · quiet / B · pop:** three moments drawn two ways. Press Play, then Replay.
- **First version:** the long Train page in Night, its states and its empty
  week, kept at the bottom for comparison.

## Departures from the original Train design

- The first pass kept the original's structure. The second pass does not: it
  keeps the original's language (cards, the raspberry accent, the bar ramp,
  the pill button) and changes what the screen is for.
- Type sits on the seven-step scale with the 12 px floor (look-plan D12);
  labels use the darker grey (D14); cards are a hairline plus a 1 px shadow.

## New glyphs drawn for this round

Check, chevron (right, down, left), info "?", plus, minus, and the trend
marks (rising, steady, falling). Same grammar as the app's icons.

## Not drawn yet

The week page and the Trends page; Night and the empty state for the new
Train; Night for the other pages and sheets; the guided EMOM clock; the
"Saving…" state; loading and error states; the wide desktop column; the
handoff spec. Motion was checked for rendering, not for feel.
