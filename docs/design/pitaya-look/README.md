# Pitaya Look — the design round, slice 1: Train

**Status: fifth pass (Train led by workouts, in the round 3 identity), waiting for Michael's reaction. Nothing is built from it yet.**

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

**Round 2 (same day):** the palette is dragonfruit with **plum and coral**,
its neighbours on the colour wheel; green marks on track and coral off
track; the old blue is retired. Icons are **solid**, and the kettlebell is
redrawn with a round bell and a wide handle.

**Round 3 (same day): identity and feel, decided.** Michael asked for it,
pointing at how the Process Lounge design system got its character: not from
fonts and colour but from choices like big or small numbers, highlights or
detail, words or pictures, and how things move and respond. He answered all
25 questions. The brand kit lists them; in short:

| Group | His picks |
|---|---|
| Scale | Poster numbers (54 px or more) · big full-width buttons (48 px) · large solid icons that lead |
| How much, how it is said | Highlights over detail · pictures before words · exact numbers · an icon as the label |
| Shape and surface | Crisp corners (about 6 px) · floating shadow cards, no outline · one bold dragonfruit card per screen · the two-tone ring with the number inside as the signature |
| Motion | A press shrinks · numbers count up · lines draw themselves · a tapped tile opens into its screen |
| Touch | Detail opens in a bottom sheet · swipes for time, refresh and back · press and hold to peek |
| Sound and feel | A soft tick on saves, a chime for the three moments · light haptics |
| Getting around | Icons-only tab bar · the mic becomes the bar's centre button (the floating dock goes) |
| States | On / off track colours the number itself · loading shimmers · an empty screen says one plain line |

What this changes at port time, beyond the table above: the radius and
shadow tokens (soft 12–24 px corners and hairline cards become crisp
floating cards), the bottom nav (labels go, the voice dock moves into it),
and three things that do not exist in the app yet: sound, haptics and the
tile-to-screen transition. Each needs its own ticket; none is started.

## Fourth and fifth pass — round 3 applied to Train (2026-11-14)

**Fourth pass (rejected).** Train was redrawn taking the picks literally:
icons with no words, one number per tile, the week's calories as the poster
number. Michael's reaction: "why does train have calories? or is this the
home page? train should have workouts so far - calories burned", "it did
get TOO Simplistic", "less modern than I thought it would", "looks offset",
and "remove the journaling we're not doing that".

**Fifth pass (on the canvas now).**

| Part | Shows | Tap opens |
|---|---|---|
| The bold card | A ring with the number of workouts this week inside it, split strength / easy. Beside it: calories burned and active time. Under it: the draggable line of calories by day, and a full-width Start button | Start → the Routines sheet |
| Workouts so far | One card per workout this week, newest first: kind, day, minutes, calories, its heart-rate line. Swipes sideways | That session (exists today) · "All" → all activities |
| Your bell | The bell he is on, a small ring of lifts moved up | All records (drawn) |
| Walking | Distance this week, thin bars by day | Steps & calories history (exists today) |
| 8 weeks | The trend, coloured green when on track | Trends (**not drawn yet**) |

Lessons taken from the rejection:

- A screen leads with what it is about. Train's poster number is workouts;
  calories burned is the second line.
- "An icon as the label" does not mean no words. Each tile keeps a name of
  one or two words and a second number, or it cannot be read.
- "Modern" is depth and glow, not emptiness: the bold card deepens from
  dragonfruit to plum, charts run edge to edge in their cards.

**Journal is cut.** Michael, 2026-11-14: "we're not doing that." The tab bar
is Spirit, Food, the mic, Today, Settings. Read as the Journal tab leaving
the app, not only this screen; he was told so and has not objected. The app
is untouched: see `docs/deferred-items.md`.

Checked in a browser, Day and Night, at rest. Not checked: dragging the line
on the new board, and the swipe on the workouts row.

**Later the same day, from his comments on the canvas:**

- **Quiet or pop is closed.** "pop definitely wins here", on board B (pop,
  three moments only). Board B is marked chosen, A not chosen. Both boards
  still carry the old look, the retired diamond and the cut line
  "Yesterday's you lifted less."; they are redrawn with the other boards.
- **Jump rope: "again line graphs".** The eight-week bars are now a smooth,
  draggable line (tested), and the page moved to the new fonts, floating
  crisp cards and the four-tab bar. Its two session tables remain; whether
  he wants those as lines is asked, not answered.
- Still in the old look: All records, the Routines sheet, the live session,
  the two moments boards.

## Routines and the session — his direction (2026-11-14)

Michael, in the session: routines must become "ultra flexible", built from
parts that "mix and mingle", made "via claude" and repeatable. His examples:
a 20-minute EMOM that cycles four moves followed by a 20-minute walk, as one
routine; three rounds of several kettlebell moves that get progressively
harder; a video he gives Claude to follow. "None of this will actually
happen on the phone": workouts run on the watch, "the phone is a repository".
He wants to point a Freestyle back at a routine afterwards, or set one up by
speaking to the watch. And: "I look at a whole session and I can click into
it to view the list of workouts I did in that session + all that data back
on my phone and one small thing telling me my improvement over last week."

**Drawn from that, two boards:**

| Board | Shows |
|---|---|
| Routines · the library | A ring of how many of the week's workouts followed a routine, the Freestyles still unmatched, and one button to match them. Then each routine as a card: its length, how often and when it was last done, how it was made (spoken, told to Claude, from a video), and a **strip of its parts** in proportion (EMOM then walk · three rounds getting heavier · twelve moves from a video). A "New routine" row offers the three ways in. |
| The session | What it was and when, the routine it followed (with Change, which is also where a Freestyle gets matched). A bold card: minutes inside the ring split hard / easy, calories, average heart rate, **one line of improvement over last week**, and the heart-rate line across the session with its rounds marked under it (draggable, tested). Then "What you did": each move with its load round by round. Then six body tiles: top heart rate, minutes in hard zones, recovery, weight lifted, oxygen, temperature. |

Train's big button now reads **Routines** and opens the library, because
nothing starts on the phone. The workout cards on Train open the session.

**What the app cannot do yet** (queued as a feature in
`docs/deferred-items.md`; none of it is design work):

- A routine is one kind with one flat list of steps. It cannot hold two
  parts, or a weight that changes by round.
- A saved workout has no link to the routine it followed, so there is
  nothing to match a Freestyle to.
- Oxygen and wrist temperature are stored per day, not per workout. The
  board says so: "Oxygen, today" and "Outside" (the weather's temperature).

**Where the old Routines sheet went:**

| Old sheet | Now |
|---|---|
| A sheet over Train | A page of its own, the library. |
| A row per routine: name and a line of moves | A card per routine with the strip of its parts. The full list of moves is one tap in (**not drawn yet**). |
| "On watch" pill on every row | One "3 on your watch" marker in the header. |
| "+ Build new routine" | "New routine": say it, chat, or send a video. The by-hand form is **not drawn**. *Needs a ruling.* |
| "Tap one to start it live here", the "Guided clock" pill, the Live session board | **Not carried over.** *Needs a ruling:* the board is kept on the canvas, labelled, until he says. |

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

Changed by the fifth pass:

| Today | In the design |
|---|---|
| Today's session card | Now the "Workouts so far" row: every workout of the week, not only the last. |
| Start live workout · Routines | One full-width **Start a workout** button in the bold card → Routines sheet. *Still needs a ruling.* |
| The voice dock (floating mic) | **Moved** into the tab bar as its centre button (round 3). |
| Tab labels | **Removed** (round 3: icons only). Each tab keeps its accessible name. |
| Journal tab | **Ruled out by Michael** 2026-11-14. |
| Week picker | **New**: a "Week N" control with back / forward in the header (round 3: swipe through time). Tapping it opens a calendar sheet: a month, a dot on each day trained, tap a week to pick it (Michael, 2026-11-14: "clicking should let me do a calendar sorting no?"). Whether it should also switch the page to a month or a custom range is asked, not answered. No week page is drawn yet. |

## For Michael to rule on

1. **Is the fifth pass closer, or still too plain?**
2. **Does the phone keep its own live workout screen** (start a routine, the
   guided EMOM clock, "Saving…"), or does it go now that workouts run on the
   watch? Asked 2026-11-14. This replaces the older "one Start button"
   question.
3. **Does the phone keep a form to build a routine by hand**, or is it
   Claude, voice and video only?
4. **Drop "● Record"** on Trails. It does nothing but say recording lives on the watch.

Settled since the first list: the five highlights stand; quiet motion with
pop for three moments (brand kit).

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
