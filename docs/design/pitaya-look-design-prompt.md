# Pitaya · the phone app, one system — design prompt (round "Look")

**How to use this:** paste everything below the line into Claude on the design
surface. It stands alone. Attach these files from the repo so Claude designs
against the real thing:

- `docs/design/pitaya-app.dc.html` and `docs/design/pitaya-body/Pitaya Body.dc.html` — the two designs the app is built from.
- From `docs/design/screen-audit/` (taken on invented data): `health-workouts--phone-light.png`, `settings--phone-light.png`, `settings-notifications--phone-light.png`, `settings-claude--phone-light.png`, `dashboard--phone-light.png`, `health-food--phone-light.png`, `health-workouts-activities-id--phone-light.png`, and the kit: `settings-design--phone-light.png`, `settings-design--phone-dark.png`.

**When the round is done:** save the bundle to `docs/design/pitaya-look/` (the
`.dc.html`, its `support.js`, the handoff spec, any assets) and tell Claude
Code. Building is then a **port** (CLAUDE.md port gate): nothing is built from
this prompt's prose, only from the design that comes back.

**Why this round exists:** the October audit
([`screen-audit.md`](screen-audit.md), [`look-plan.md`](look-plan.md)) built
the system — tokens, a component kit, Day and Night — and then stopped at the
screens, because three groups of screens have no design to port: the
simplified Train screen, the regrouped Settings, and everything MCP v2 added
in November (targets as rules, the day ledger, corrections with undo, the
exercise library, fields Claude can add). The watch is not in this round; it
gets its own.

*Written by Claude Code from the audit, the plan and the code, in Michael's
voice. Michael: change anything that does not sound like you before you paste.*

---

# Pitaya · the phone app — round "Look"

Pitaya is my personal health app. These days I put almost everything into it
by talking — to Claude through the connector, or to my watch. So the phone
screens have one main job now: **I open them to look.** This round is about
making the looking good, and about giving the newest data a place to be seen
at all.

Keep the identity exactly. This is not a rebrand and not a new direction.

## What I said about the app as it is

- The workouts and data screens are **cluttered** and hard to read.
- Settings is **a wall of text**.
- The app is turning **"AI and text driven"** instead of feature-rich. The new
  things Claude can do for me (set targets, fix a record, explain a movement)
  exist only in conversation. I cannot see any of them in the app.
- Things feel **small and faded** — I said it about the watch first, and it
  is true of the phone too.

The brief I gave for the look: *quiet, dense, fast. The data is the hero. No
gradients, no glow, no cartoon icons, one accent colour.*

## The brand and the system — unchanged, do not redesign

**PITAYA** · *"It's just you. Prove it."* · mark = a 45°-rotated square
(diamond) in raspberry. Display and numerals **Familjen Grotesk** (numbers
always tabular); UI and body **Instrument Sans**; **Literata** only for
Scripture. Pills for everything interactive.

| Role | Day | Night | Use |
|---|---|---|---|
| bg | `#F2F1F2` | `#131217` | page |
| card | `#FFFFFF` | `#1E1D23` | cards |
| card-2 | `#F6F5F7` | `#27262C` | a card inside a card |
| rule / rule-2 | `#EDEBEE` / `#E4E2E6` | `#2B2A30` / `#37363C` | hairlines, borders |
| ink | `#232227` | `#F2F1F2` | primary text |
| ink-2 | `#66646C` | `#B9B7BE` | the only muted **text** colour |
| ink-3 | `#96949B` | `#85838B` | icons, placeholders — **not words** |
| primary | `#A63D63` | `#D66A93` | the one accent |
| primary-deep | `#8C2F51` | `#E795B4` | emphasis, pressed |
| tint / edge | `#F6E3EB` / `#E9CFDC` | `#3A2331` / `#4C2C3E` | pink fills and their border |
| success · warning · danger | `#5E9B72` · `#D9A23E` · `#B4533F` | `#7FB893` · `#E0B45A` · `#D07A68` | status fills |
| slate | `#5E7FA6` | `#86A3C8` | second data series |

**Type — seven steps, and a floor.** hero 44/48 · display 26/30 · title 19/24 ·
body 15/22 · ui 13/18 · caption 12/16 · micro 11/14 (uppercase, 0.14em, 600 —
kickers and chart ticks only). **Nothing that carries meaning is under 12 px.**

**Shape.** Radius: pill 999, card 16, large card 22, control 12, sheet 24.
Cards are one hairline plus a 1–2 px shadow; only the dock and sheets float.
Spacing on a 4 px base: gutter 16, card padding 16 or 20, 12 between cards, 24
between sections. Pages end 176 px above the bottom so nothing hides under
the dock.

**Motion as built.** 90 ms for a press, 150 ms for any state change, 220 ms
for sheets and page pushes, exits never slower than entrances, reduced motion
shows the end state. (See "One thing to settle with pictures" below.)

**Rules that hold everywhere.** A change is green only when it moved the good
way, otherwise grey. **Never red on a body number, never the word "HIGH".**
An out-of-range number is explained in a sentence. A missing value stays
missing; it is never shown as zero. Every text colour meets AA on every
surface in both modes.

**The kit that already exists** (see the two `settings-design` screenshots).
Design with these first:

Button (primary, ink, secondary, outline, ghost) · Chip and chip row · Card
with kicker, title, meta · Section header with an optional action · List row
and list group (leading slot, title, optional one-line sub, value or control
on the right, chevron) · Switch (only for things I can change) · Status (a
read-only dot and word) · Disclosure (a "?" that opens one sentence under a
row) · Metric tile, Delta, Num · Chart frame (kicker, range chips, plot,
footer, honest empty state) · Empty state · Skeleton · Field, Select · Sheet ·
Toast.

If a screen needs a pattern the kit does not have, **do not improvise it
inline: name it as a new kit component and spec it once** (states, sizes,
Day and Night). I expect a few; say which.

## Where the app actually is (design against this)

- **Phone first**, 390 × 844, installed to the home screen and inside the
  iPhone app shell. Desktop is the same column, wider.
- **Tab bar:** Spirit · Food · Today · Journal · Settings. **Train and Body
  have no tab**; they open from tiles on Today. A floating dock (chat, mic,
  camera) sits above the tab bar on every page.
- **Confirm before save** stays: the AI proposes, I confirm, then it saves.
- **Day and Night** both ship. Night is the Body screen's dark palette made
  app-wide.
- Screens that are designed and stay as they are: Today, Food, Food history,
  Body, the Sunday Report, Chat, Spirit.

## One thing to settle with pictures: quiet, or pop?

I asked for quiet and fast. Later I also said I wanted **more pop and
animation**. The plan so far keeps it quiet and gets the "pop" from hierarchy:
a bigger hero number, brighter primary text, the accent on one thing per
screen. I would rather choose with my eyes than in the abstract.

Show three moments, each in two treatments — **A**, inside the motion above,
and **B**, as expressive as you think the brand can carry: (1) a new record,
(2) a log saved, (3) the day's target reached. Give real numbers for B
(element, trigger, duration, easing) so it can be built exactly.

## What to design

**The capability lists below are binding.** Each one is what the screen can do
today, read from the code. Every item must be kept, moved (say where), or
handed back to me as "I propose dropping this" — never silently absent. End
Slices 1 and 2 with a short **"where everything went"** table.

### 1 · Train, simplified — plus two new pages

Today Train is one scroll about five phone screens tall with everything open
at once. The audit's proposal, which you may overrule: one hero for this week
(sessions, volume, the one record that moved); records as six tiles with "All
records"; jump rope as one row that opens its own page; by-movement as five
bars with "more"; trails as one row; effort zones moving to the Sunday Report,
which already shows the week's zones.

Design: **Train**, **All records** (new page), **Jump rope** (new page).

What Train does today:

- **Header:** "Week N · Kettlebell block", the title, and a pill with this
  week's tonnage lifted (or time jumped on a rope-only week).
- **Start live workout** → a sheet to pick the routine (routines that are
  guided EMOMs are marked) → the **live session**: elapsed clock, "current ·
  set X of Y", the movement and its weight, − and + to count sets, a **rest
  timer** that counts down and skips on tap, Prev and Next step with the next
  movement named, **End session & save** with a "Saving…" state. EMOM
  routines open a guided protocol clock instead.
- **Routines** → a sheet listing each routine with a one-line summary and
  "→ Watch", "+ Build new routine" (opens the routines page), a note that
  routines sync to the watch, Close.
- **This week · planned** (or "Next week · planned"): the week I planned in
  Chat. Each row has a day, a name, a detail line and a state — planned, done
  or skipped — which I can change, and I can remove a row. A count ("1 of 3
  done"). Shows nothing until a week exists.
- **This week · overview:** sessions, active time, kcal, outdoor km, and rope
  time when there is any. Then **View activities →** and **Steps & calories
  history →**.
- **Record banner:** "Heaviest ever" or "Best session", the day, a headline
  and a sub-line.
- **Today's session:** time and duration, the routine and rounds when it came
  from one, then each movement with its detail, work time, a PR tag, a check.
- **Volume · 8 weeks:** eight bars, the change against last week, this week's
  tonnage.
- **Jump rope:** an 8-week chart of jump time; bests; then a block per
  protocol (and one for continuous jumping) with its session count, "best N
  rounds" or "longest", and a table — date, rounds or time, working heart
  rate, heart-rate drop — where each column carries a small trend arrow; and
  a sentence that explains the numbers.
- **By movement · 8 weeks:** one bar per movement with its tonnage.
- **PR wall:** every heaviest-ever (around fifty): movement, weight, "was X",
  date. Tapping one opens the session it was set in.
- **Trails:** the latest trail (name, distance, day; climb, average heart
  rate, minutes), its elevation line, and "● Record", which today only says
  recording lives on the watch. Tapping opens that activity.
- **Effort · time in zones:** the latest heart-rate session, its effort score
  and the Z1–Z5 split.
- **Empty states:** a week with no sessions; no trails yet; no records yet.

For **All records**: the same record facts, with a way to sort (recent, A–Z,
heaviest) and to see which moved this week. For **Jump rope**: everything the
section shows today, with room to breathe.

### 2 · Settings — one line per setting

Twenty settings currently take two and a half screens because every row
prints its explanation. Each row is really one line of information. The
audit's proposal, which you may overrule: five groups (Watch · Data ·
Connections · App · System); one line per row with one thing on the right; a
Status where the row only reports and a Switch only where I can change
something; explanations behind a Disclosure.

Design: **Settings**, and the tail of **Notifications**.

What Settings does today:

- **Watch card:** device name, "Connected · last seen …" or "Not connected",
  **Pair** (opens a short how-to) or **Unpair**. Five feature rows (heart rate
  & zones; HRV + recovery; sleep stages; steps, rings & auto-detect; live
  workout mirroring) that end in a **read-only** on/off. They are not
  controls and must not look like controls.
- **Security, shown only when relevant:** a notice that some devices are
  still on the old sign-in key; "Device pairing is locked" with a way to
  unlock it; **Forget all known devices**.
- **Data and connections:** CSV import (opens a page) · Export data (opens a
  page) · Claude connector (opens a page: the connection steps, making a
  link or token and copying it, the connected Claudes each with Revoke, and
  one switch — may Claude read finance) · Notifications
  (opens a page) · Weekly PDF report (not built yet; say so honestly) ·
  Strava (archived, read-only).
- **Heart-rate zones:** four numbers, the upper bound of Z1–Z4; they must
  ascend and sit between 40 and 230; an error line when they do not; a note
  that past workouts keep their old split.
- **App:** PIN lock (change it: current PIN, new PIN, a busy state) · Units
  (kg · cm or lb · in) · Appearance (System, Day, Night) · Chat language
  (English, Español) · New chat after (a quiet gap, several choices including
  Never).
- **System:** AI and database status with response times, a Test button, the
  three model names, AI spend (today, 30 days, calls), connecting an admin key
  for real costs, a Top up link, and the link to the Design system page.
- A small **"Saved"** confirmation after any change.

**Notifications** today: eight categories, each a switch with a one-line note;
quiet hours (on/off, start, end, and "let my timed reminders through"); what
is syncing; and **Recently sent**, which lists every notification ever with
its state (delivered, shown in app, held for quiet hours, sending, no device
subscribed, failed, too late, switched off). Keep the switches as they are;
design the tail so it shows the last five and opens the rest.

Slices 3–6 will add rows here (targets, fields, changes). Leave them a home.

### 3 · The day, added up — targets and the ledger (new)

Pitaya now works out the whole day, and I can only hear it, not see it.

**What exists for any day:**

- whether the day counts as **rest or training** (a rule decides: it becomes
  a training day once logged workouts reach a set number of kcal);
- the **target** for that kind of day (kcal, protein, fat, carbs);
- **eaten** (the same four, and how many entries) and what **remains**;
- **workouts** that day with their kcal, and the total;
- **steps**, split into steps inside workouts and outside them, plus resting
  heart rate and HRV;
- **what the body burned**, as a sum I can read: resting burn (and where
  that number came from) + digestion + everyday movement + workouts;
- the **deficit or surplus**: burned minus eaten;
- **data-quality notes** in plain words ("active energy looked wrong, not
  used"; "probably incomplete logging").

**What exists for the week:** the last seven complete days — average intake,
average deficit, the weight change the maths predicts against what the scale
did, the gap in one plain sentence, and flags (no weigh-in for five days,
missing step days, a weigh-in left out as an outlier).

**Targets** are now three things: a rest-day target, an optional training-day
target, and the rule that picks between them. The app's "Daily targets" sheet
(kcal plus a P/C/F split you drag, grams updating live, Cancel and Save) only
knows the rest day.

Design: (a) **the day ledger** — one day, readable top to bottom as a sum,
with a way to step to other days; (b) **the week block** — "is it working?";
(c) **the targets editor**, grown to hold rest, training and the rule, keeping
everything the current sheet does; (d) **how Today and Food show which kind
of day it is** without redesigning those screens.

Today's ring already flips between "kcal in" and "kcal to go" on tap, and Food
has a Targets button and a kcal pill. Propose where the ledger opens from.

A deficit is not a grade. No red, no judgement; the sentence does the work.

### 4 · Corrections and undo (new)

Any record can now be corrected — by Claude when I ask, or in the app — and
every correction is kept: **which record, which field, the old value, the new
value, the reason, when, and who** (Claude, the app, or an undo). One action
can change several fields; they travel together. Any change can be undone,
unless the value has changed again since, in which case that part is skipped
and says so. A corrected workout field is protected: the watch can never
overwrite it.

Records this covers: workouts, meals, measurements, saved recipes, my targets
and settings, movements in the library, and added fields.

Design: (a) **the mark** a corrected record wears in a list and on its own
page; (b) **a record's history** — what changed, why, with Undo; (c) a
**Changes** list across the whole app, newest first, filterable by kind; (d)
**undo** itself: the confirm, and the three results (restored, partly
restored, could not restore because it changed since); (e) the empty state.

The reason is in my words or Claude's. Give it room; it is the useful part.

### 5 · The exercise library and a movement's page (new)

Every movement I log is now a real entry, and Claude explains each new one.
There is no screen for any of it; movement names only appear inside other
screens.

**A movement has:** a name, other names it answers to, a category, whether it
counts as external load or bodyweight, how many times I have logged it, and a
**profile**: how it is done (a short paragraph); its pattern (one of: hinge,
squat, lunge, horizontal push, vertical push, horizontal pull, vertical pull,
carry, core, rotation, locomotion, plyometric, conditioning, mobility);
primary and secondary muscles; equipment; one-sided or not; what it is a
variation of; up to five coaching cues; and the source (a link and a note).
Some movements have **no profile yet**. From my training it also has a
heaviest ever, a volume history and its recent sessions. Routines now carry a
description and a source link too.

Design: (a) **the library** — search, a way to browse by pattern and by
equipment, and an honest "not yet explained" state; (b) **a movement's
page** — the profile and my history with it, on one screen; (c) how a
**family of variations** reads; (d) where the library opens from (Train is
the obvious door), and how a movement name anywhere in the app leads to its
page.

I change these by asking Claude, not by filling in forms. Show the page
**read-only with a clear way to ask Claude to fix something**. If you think
light editing in the app is worth it, show that as a second option and say
what it adds.

### 6 · Fields Claude adds (new)

When I want to track something new, Claude defines a field and from then on
it is stored on every record of that kind. The app shows none of them.

**A field has:** what it belongs to (a meal, a measurement or a workout), a
label, a type (number, whole number, text, one-of-a-list, yes/no), a unit, a
range, a description, and whether it is active or retired. Retired fields
keep their values.

**Already defined:** more tape sites (abdomen; left and right arm, forearm,
thigh and calf), how a tape round was taken (by hand, with an app, at a
clinic), a note on where each tape went, and how sure a meal's numbers are
(from a label, weighed, estimated, estimated from a photo).

Design: (a) **one pattern for "more on this record"** that works for any
future field without another design round — show it on a measurement beside
Body's Tape card, on a meal, and on a workout; (b) how each type renders (a
number with its unit, a chip, a line of text, a yes/no); (c) **the list of
fields** with active and retired; (d) the empty state on a record that has
none.

### 7 · Riders, if the round has room

- **Glyphs the design never drew**, in Pitaya's own 24 × 24 grammar: chevron
  (right, down), close, info "?", and the three toast marks (done, caution,
  error). The app borrows these from an icon library today.
- **The "corrected" mark** from Slice 4 as a glyph.
- **Activity** (steps and calories history, opened from Train) was built
  without a design. Restyle it only if time allows; it is long for the same
  reason Train is.

## For every screen

- **Day and Night.**
- **Empty**, **loading** (skeleton, not a spinner or the word "Loading…") and
  **error**.
- **The awkward case:** fifty records; a movement name that wraps; a reason
  three lines long; Spanish strings; a day with no food logged.
- A note wherever the wide desktop column needs something different.

## Hard constraints

- The tab bar, the dock and confirm-before-save do not change.
- **Nothing is removed** except by my say-so (the binding lists above).
- One accent. No gradients, no glow, no emoji, no system or library icons;
  every icon is inline SVG in the file.
- Nothing meaning-bearing under 12 px; AA contrast in both modes; controls at
  the kit's sizes or larger (buttons 40 px, large 48; list rows at least 48
  tall).
- No red on body numbers, no "HIGH", missing stays missing.
- Motion inside 90 / 150 / 220 ms, except what you propose under "quiet, or
  pop?".
- **Invent every number in the mock-ups.** This repository is public; do not
  use my real weight, targets, measurements or meal data, even if a file you
  were given shows them.

## What to produce

In the existing `.dc.html` idiom, phone frames at 390 × 844, each screen in
Day and in Night:

1. **Train**, **All records**, **Jump rope**, and the live-session and
   routine sheets in the new language.
2. **Settings** and the Notifications tail.
3. **The day ledger**, the week block, the targets editor, and the day-type
   mark on Today and Food.
4. **Corrections:** the mark, a record's history, the Changes list, undo.
5. **The library** and a movement's page.
6. **Added fields** on a measurement, a meal and a workout; the fields list.
7. **Quiet or pop:** the three moments, A and B.
8. **A handoff spec** (`.md`): every number, easing and line of copy; each
   new kit component with its states; the two "where everything went" tables;
   and for Slices 3–6, which piece of data each element shows.

## The archive

`pitaya-app.dc.html` (the app), `pitaya-body/` (Body, and the model for a
handoff bundle), `pitaya-tokens.md` (tokens, and "The standard" the code
enforces), `look-plan.md` (the plan and its decisions D1–D17),
`screen-audit.md` and `screen-audit/` (every screen as it is, on invented
data). Where this round departs from an earlier design, the departure is
deliberate: call it out.
