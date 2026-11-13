# Pitaya Look — the design round, slice 1: Train

**Status: first pass, waiting for Michael's reaction. Nothing is built from it yet.**

The round is being designed in the session, on a Design canvas, instead of
being pasted into a separate tool. The brief is
[`../pitaya-look-design-prompt.md`](../pitaya-look-design-prompt.md).

- **Canvas (private to Michael):** https://claude.ai/artifact/5i5E5Fd3d8hb3W9EdGaXJq
- **Drawn from:** the original Train screen in `pitaya-app.dc.html` (its
  header, buttons, cards, record banner, session rows, volume bars and
  sheets), on the tokens and type scale in `pitaya-tokens.md` → "The
  standard". Icons are the app's own, copied from
  `components/pitaya-icons.tsx`. Every number on the canvas is invented.

## What is on the canvas

| Board | What it shows |
|---|---|
| Train · Day | The whole screen. About two phone screens tall; today's is about five. |
| Train · Night | The same screen in Night. |
| Train · states | A planned row opened (Mark done · Skip · Remove) with the hint showing; the volume card switched to movements; a week with no new records. |
| Train · empty week | No sessions, no records, no rope, no trails. |
| All records | New page. Sort by Recent, A–Z or Heaviest; this week's on top. |
| Jump rope | New page. Everything the Train section shows today. |
| Routines sheet | One sheet for both "Start live workout" and "Routines". |
| Live session | The set counter, rest timer, previous and next, end and save. |
| A · quiet / B · pop | Three moments drawn two ways. Press Play, then Replay. |

## Where everything on today's Train went

Read from the code (`app/(tabs)/health/workouts/page.tsx` and the components
it mounts). Nothing is dropped without a ruling.

| Today | In the design |
|---|---|
| Header: "Week N · Kettlebell block", title | Kept. |
| Header pill: tonnage lifted (or time jumped) | **Moved** to the big number in the This-week card. |
| Start live workout | Kept. |
| Start picker sheet (pick the routine) | **Merged** into the Routines sheet. Both lists already start a session on tap. *Needs a ruling.* |
| Routines sheet: list, "→ Watch", build new, the sync note, Close | Kept. The tag reads "On watch"; guided EMOMs are tagged "Guided clock". |
| Live session: clock, set X of Y, − and +, rest timer (tap to skip), Prev, Next, End session & save | Kept, redrawn. |
| Live session: "Saving…" state; the guided EMOM clock | Kept. **Not drawn yet.** |
| This week · planned: rows, state, change state, remove, the count | Kept. Tapping a row shows its actions, as today. |
| This week · planned: the "plan it in Chat" sentence | **Moved** behind the "?" beside the title. |
| Overview: sessions, active time, kcal, outdoor km | Kept, in the This-week card. |
| Overview: rope time | **Moved** to the Jump rope row and page. |
| View activities → · Steps & calories history → | Kept, side by side. |
| Record banner (heaviest ever / best session) | Kept. |
| Today's session: time, duration, routine, rounds, rows, work time, PR tag, check | Kept. |
| Volume · 8 weeks: bars, this week's tonnage | Kept. |
| Volume: change against last week | **Moved** up to the This-week card. |
| By movement · 8 weeks | **Moved** into the Volume card, behind its "Movements" switch: five bars, then "Show more". |
| Jump rope: chart, bests, per-protocol tables, the explainer | **Moved** to its own page. Train keeps one row. The explainer sits behind "What these numbers mean". |
| PR wall: every record; a tile opens its session | Six on Train (this week's first), all of them on the new page. A row or tile still opens its session. |
| Trails: name, distance, day, climb, a small elevation line | Kept, as one row that opens the activity. |
| Trails: average heart rate, minutes, the full elevation line | **Moved** to the activity page the row opens. |
| Trails: "● Record" (only shows a message today) | **Proposed drop.** *Needs a ruling.* |
| Effort · time in zones: session, average heart rate, effort score, zone bar | Kept, as one row with a small zone bar. The audit proposed moving it to the Sunday Report; it stays here. |
| Effort: the Z1–Z5 percentages as text | **Moved** to the activity page the row opens. |
| Empty states | Drawn: no sessions, no records, no rope, no trails. |

## For Michael to rule on

1. **Quiet or pop?** Boards A and B.
2. **One Routines sheet** for both buttons, instead of two near-identical sheets.
3. **Drop "● Record"** on Trails. It does nothing but say recording lives on the watch.

## Departures from the original Train design (all already in the look plan)

- Type sits on the seven-step scale with the 12 px floor (look-plan D12): the
  design's 9.5–13.5 px labels become 11, 12 or 13; the 30 px title is 26.
- Labels use the darker grey, not the faint one (D14).
- Cards are a hairline plus a 1 px shadow, not the soft 12 px shadow.
- The record banner's looping shimmer is gone (the standard removed loops
  that carry no meaning). Option B brings back one sweep, once.

## New glyphs drawn for this round

The design files never had them, and the app borrows them from an icon
library today: check, chevron (right, down, left), info "?", plus, minus,
and the three trend marks (rising, steady, falling). Same grammar as the
app's icons: 24 × 24, one stroke weight, round caps.

## Not drawn yet

Night for the two new pages and the sheets; the guided EMOM clock; the
"Saving…" state; loading skeletons; an error state; the wide desktop column;
and the handoff spec with every number. They follow once the direction is
approved. Motion was checked for rendering, not for feel: that part is
Michael's eye.
