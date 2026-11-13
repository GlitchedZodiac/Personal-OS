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
