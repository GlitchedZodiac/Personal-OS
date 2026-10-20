# Screen audit — every screen, as it is (lane C, 2026-10-17)

The look of Pitaya today, one screen at a time, with a screenshot of each
from the real app. This is the "before" of the convergence described in
[`look-plan.md`](look-plan.md); each phase adds its "after" next to the
"before" here.

## How this was made

- **Routes** were listed from the filesystem: 64 `page.tsx` files under
  `app/(tabs)`, `app/(desk)`, `app/oauth` and `app/` (two are redirects),
  plus the PIN gate, which is a state rather than a route.
- **Screenshots** come from `scripts/screenshot-screens.mjs` (Playwright
  Chromium, reduced motion, SwiftShader for the maps): phone 390×844 in
  light and dark, desktop 1280×900 in light; full page, clipped at 4,400 px.
  `manifest.json` beside the images records each page's real scroll height,
  final URL and console errors.
  Every route has all three frames at
  `screen-audit/<slug>--{phone-light,phone-dark,desktop-light}.png`; rows that
  group several routes link the phone-light frame only. Captures over 280 KB
  are re-encoded as 256-colour PNGs; byte-identical frames (the desk has
  no Night yet, two routes are redirects) are stored once and the manifest
  points the duplicate at the kept file (`duplicateOf`).
- **Before = e6abccc.** The "before" frames were (re)taken from a detached
  worktree at commit e6abccc — the app as it was before any convergence —
  so later token changes cannot leak into them.
- **Data.** The committed images are taken against a synthetic database
  seeded by `scripts/seed-screens.mjs` — invented but realistic (a nine-month weight series, 125 workouts, about 50 movement records, a notification history, a term, a church series with its weekly questions, three bank accounts; every profile value is invented) — because the repository is public. The
  judgements below were formed against a copy of production (674 meals,
  169 workouts, 88 records, 262 chat messages) kept in an untracked folder;
  where the two differ in a way that matters it is said. **One real number
  shows in every Body frame:** the start point (weight and month) is
  hard-coded in app logic (`lib/body-view.ts` `BODY_START`) and was already
  public in the repository; the seed does not and cannot change it.
  The writer refuses to put anything under `docs/` unless the server
  carries the seed's marker (`screenSeed`).
- **Dark mode is forced in the "before" set.** `app/globals.css` defines `.dark` tokens, but
  nothing in the app toggles the class — Settings → Appearance reads
  "Night — next build" and `components/ui/sonner.tsx` calls `useTheme()`
  with no provider. The dark shots add `.dark` to `<html>` and emulate
  `prefers-color-scheme: dark` (the Body screen follows the system). They
  show what the existing tokens produce, which is the honest input for
  the dark-mode findings.
- **Metrics** per route come from `scripts/design-metrics.mjs`: raw hex
  values, arbitrary `text-[Npx]` sizes, inline colour/type styles, raw
  `<button>`/`<input>`/`<select>` outside `components/ui`, lucide icons,
  and non-standard motion classes — for the page file plus the components
  it imports directly. "Debt" is their sum. The full table is the appendix.
- **Watch** frames come from the simulator (Series 11 46 mm; judged for his
  Series 8 45 mm) through the DEBUG smoke seams in `ios/WatchApp/Smoke.swift`
  (`PITAYA_SMOKE_*`), paired against the same dev server. Screens the seams
  cannot reach were driven by hand where possible and audited from code
  otherwise; each row says which.

Severity: **P1** — he named it or it blocks reading the data · **P2** —
visibly off-system · **P3** — cosmetic or legacy surface with no design
slice.

---

## Systemic findings (the summary)

**S1 · There is no type scale.** Thirty-two different `text-[Npx]` sizes
are in use (9 · 9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 ·
14.5 · 15 · 16 · 17 · 18 · 19 · 20 · 21 · 22 · 24 · 26 · 30 · 32 · 34 · 38 ·
40 · 44 · 84 · 96 px), 1,301 arbitrary sizes in all, next to 376 `text-xs`
and 334 `text-sm`, and 1,457 inline `fontSize`/colour styles. Half-pixel
steps (10.5, 12.5, 13.5) sit next to whole ones on the same card. A reader
cannot learn the hierarchy because there is none to learn.

**S2 · 139 distinct raw hex colours, 2,581 occurrences**, where the
design has sixteen. `#8C2F51` alone is typed 270 times. The consequence is
S3.

**S3 · Dark mode is defined and unreachable, and where it is forced it
breaks on every hardcoded colour.** Today in dark: the "Open →" buttons go
dark-on-dark, the Voice memo button and the habit ticks stay light, the
Body screen uses its own second dark palette, the desk is `bg-[#F2F1F2]`
regardless. The tokens themselves mostly hold.

**S4 · Two identities are still on screen.** Trends, Finance (11 routes),
Todos, Recovery, Coach, Outcomes, Automations, Command Center, Water, Plan
and Progress are the pre-Pitaya app: glassy cards, orange/purple/teal/blue
tints, gradients, emoji as icons, 278 lucide icons, red/green/yellow
numbers. Settings' AI-status card is teal in the middle of a Pitaya page.
PORT GATE §4 calls these bugs.

**S5 · The long tail is inline.** `/health/workouts` is 3,988 px on a
phone: a 48-tile PR wall, a full jump-rope sub-dashboard (chart, bests,
two tables, a paragraph), an 8-week volume chart, a by-movement chart, a
trails card and an effort-zones card — in one scroll, all at once. This
is the "clutterry" he means. `/settings/notifications` is 4,109 px because
"Recently sent" lists every notification ever. `/health/body` is 4,329 px
(a faithful port, but ten cards). `/trends` runs past the 4,400 px clip.

**S6 · Settings is a wall of text.** Five watch features are rows ending
in a read-only status ("ON"/"off" — the design's connection status,
pitaya-app.dc.html, not a control, though it reads like one); six data rows each carry a sentence and a button
in one of three styles (outlined, filled, "Archived"); the zone editor,
the App rows and the System card all have different row heights, paddings
and type. One line per setting is possible — the rows are one line of
information each.

**S7 · Motion is a dialect per round.** 34 keyframes in `globals.css`;
durations 90 ms → 2.2 s; `page-in` 350 ms on every route; `stagger-in`
450 ms ×10; sheets 380 ms; the chat round 240–340 ms; the Body round
500 ms rises and 1.8–2.2 s draw-ons; the desk its own 380–500 ms set. 89
non-standard `duration-*`/`transition-all` classes. Reduced motion is
honoured app-wide (good), except the desk's inline styles which only
shorten.

**S8 · Components are hand-rolled per screen.** 595 raw `<button>`s, 113
raw fields, ten chip styles, six chart-card styles, fourteen different
"No … yet" empty states, and `.glass-card`/`.cockpit-card`/`.health-stage`/
`body-card` all meaning "card".

**S9 · Empty and loading states are strings.** "Loading…", "Loading
trends...", `animate-pulse` divs and 46 `<Skeleton>`s with no shared
shape; empty states range from a designed sentence (Food) to a lucide
camera in a grey box (Progress) to nothing at all (Finance's "Last 7 Days"
chart renders an empty axis).

**S10 · The dock covers content.** Pages pad `pb-20` for the tab bar, but
the floating dock sits above it; the last line of `/health/body/metric`'s
"What it means" card, Chat's composer hints and several list ends are
under the dock.

**S11 · Competing labels.** Cards carry a kicker, a title, a pill and a
right-aligned meta line at once (Workouts' "THIS WEEK · OVERVIEW / 6 this
week", Activity's three-line sub-stats per number). Secondary lines repeat
the primary (a walk's row reads "walk · <time> · walk · <steps>").

**S12 · Icons.** Designed surfaces use `pitaya-icons.tsx` correctly; the
legacy surfaces use lucide (278) and emoji (Todos, Finance, Plan). The
dock's three glyphs and the tab bar are right.

**S13 · Watch — size is at the floor, colour is below it.** Only three
type calls land under 7 pt (SummaryView 288/446/514 at 6.7 pt); the rest
sit between 7 and 8 pt — the floor, not the target. The faded feeling is
the colour roles: `textTertiary #96949B` and `textMuted #66646C` carry
most labels (Summary uses tertiary thirteen times; Home Grid uses muted
eight times), and the stat grids put a white value over a grey kicker at
the same visual weight. 44 `.buttonStyle(.plain)` controls against 18
`.pitayaTappable` calls — the rest are CTAs or tiles, but each needs a
look.

**S14 · Watch motion** uses sixteen different durations (0.1–1.8 s) and
`Theme.Motion` in only four files; the Round-3 ladder exists and is not
the standard in practice.

---

## Phase 2 — the kit (2026-10-20)

The design system in code: one token file (`app/globals.css`, blocks 1–6),
the kit (`components/ui/*`), the ratchet gate (`npm run design-gate`), and
Appearance (Day · Night · System). Every kit piece in every state lives at
`/settings/design` (behind the PIN gate):
[phone light](screen-audit/settings-design--phone-light.png) ·
[phone dark](screen-audit/settings-design--phone-dark.png) ·
[desktop](screen-audit/settings-design--desktop-light.png).

The "before" frames above were taken with `.dark` forced on `<html>`;
from Phase 2 on, dark frames come from the app's own System appearance
under an emulated dark phone. Converged screens get "after" frames next to
their "before" in their own phase.

## Convergence order

As the look plan: Workouts → Activities → Activity detail → Plan →
Routines → Body → Body metric → Progress → Activity → Report → Today;
then Settings ×4, Notifications, Today polish, Chat + Food restyle; then
the watch; then Spirit, Finance, Todos, Journal, Trends, OAuth, Desk.

---

## Today

### `/dashboard` — Today
Purpose: the hub — calories ring and macros, Train and Weight tiles,
Tonight's Page, habits, links to Activity and the Sunday Report.
Shots: [phone light](screen-audit/dashboard--phone-light.png) · [phone dark](screen-audit/dashboard--phone-dark.png) · [desktop](screen-audit/dashboard--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | Hero `0` at 44 px is right; the Train tile crams four facts in two sizes and wraps the rope time onto its own line; "tap to flip" 10.5 px under the hero competes with it |
| Spacing | Cards consistent (16 px gutter, 12 px gaps); habits grid generous while the Train tile is cramped |
| Colour | On-token except `text-[#8C2F51]` on the Open buttons and `#5E9B72` for "left" — both break in dark (S3) |
| Components | Hand-rolled tiles, habit ticks, Open buttons; dock + tab bar are the kit's |
| Dark mode | Ring and cards hold; Open buttons go dark-on-dark; Voice memo button and tick circles stay light |
| Motion | `page-in` 350 ms + `stagger-children` 450 ms on every load; number changes are instant |
| Empty state | A zero day shows an empty ring and "0 / <target> g" bars — honest; no prompt to log |
| Loading | Skeleton-less: the page pops in whole |

Severity **P1** (it is the hub). Clutter: medium — the Train tile. Debt 116 (hex 47 · px 27 · inline 23 · raw button 14). Ad-hoc: ring, macro bars, tile, habit grid, Open button.

### `/chat` — the notebook that talks back
Purpose: the conversational AI; proposals confirm before they save.
Shots: [phone light](screen-audit/chat--phone-light.png) · [phone dark](screen-audit/chat--phone-dark.png) · [desktop](screen-audit/chat--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | Header kicker + 26 px title fine; the empty-state hint is 13 px over a dashed box; chips 13 px |
| Spacing | Generous; the empty state leaves the middle of the screen blank |
| Colour | 85 raw hexes across the page and the drawer; proposal cards hardcode tint/deep pink |
| Components | 28 raw buttons; the confirm card is the signature component and is still bespoke (keep its shape — restyle only) |
| Dark mode | Composer and chips hold; the "New chat" filter row and the history drawer carry light hexes |
| Motion | The most considered motion in the app (msg-in-left/right 300–320 ms, thread-in 240, drawer 340) — above the standard but purposeful |
| Empty state | The best in the app: a sentence with examples and the last chat linked |
| Loading | Typing dots and a stream caret — meaningful loops, kept |

Severity **P2** (presentation only — logic untouched per the lane rules). Clutter: low. Debt 223 (largest file in the app at 2,044 lines; counts include the drawer). Ad-hoc: proposal card, chips, composer, drawer, jump-to-latest.

### `/journal` — Journal (coming soon)
Shots: [phone light](screen-audit/journal--phone-light.png) · [phone dark](screen-audit/journal--phone-dark.png) · [desktop](screen-audit/journal--desktop-light.png)

Designed placeholder; on-token except 8 hexes. Dark: holds. Severity **P3**. Debt 17. Design-blocked (deferred-items: Journal has only the coming-soon slice).

### `/todos` — Todos
Shots: [phone light](screen-audit/todos--phone-light.png) · [phone dark](screen-audit/todos--phone-dark.png) · [desktop](screen-audit/todos--desktop-light.png)

Legacy: emoji icons on rows, violet/blue category labels, lucide trash, a three-segment control in its own style, red "overdue". Dark: the segment control and cards hold; labels keep their blue/violet. Empty state is a bare sentence. Severity **P3** (stripped module per design — functional, no investment). Debt 25.

### `/actions` — App Actions (placeholder)
Shots: [phone light](screen-audit/actions--phone-light.png) · [phone dark](screen-audit/actions--phone-dark.png) · [desktop](screen-audit/actions--desktop-light.png)

A shadcn Card with a lucide `Zap` and "Coming in Phase 3+". Unlinked from any tab. Severity **P3**; candidate for removal (followup).

---

## Train

### `/health/workouts` — Train
Purpose: the kettlebell hub: this week, records, volume, jump rope, by movement, trails, effort.
Shots: [phone light](screen-audit/health-workouts--phone-light.png) · [phone dark](screen-audit/health-workouts--phone-dark.png) · [desktop](screen-audit/health-workouts--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | Fifteen sizes on one page (9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 15 · 17 · 19 · 22 · 24 · 26); kickers at 10.5 px over values at 19 px; the PR tiles print name 11 px / value 17 px / date 9.5 px, forty-eight times |
| Spacing | Sections stack with equal gaps so nothing reads as more important than the next; the rope-time stat orphans onto its own row of the overview grid |
| Colour | 114 raw hexes; `#8C2F51` for every value, `#5E9B72` for every delta; the HEAVIEST EVER banner is the one designed use of deep raspberry and it works |
| Components | 31 raw buttons; two button styles in the header, a third ("View activities →") below the overview; the jump-rope tables are hand-built |
| Dark mode | Banner and charts hold; the two header CTAs (`bg-foreground`) invert correctly; PR tiles and section pills keep light hexes |
| Motion | Rest timer and live session use `count-up`/`fade-up`; the page itself `page-in` + stagger |
| Empty state | A week with no sessions shows zeros, not a prompt |
| Loading | None — the page waits on two fetches then pops in |

Severity **P1** — his first complaint. Clutter: **high** — 3,988 px on the production copy (4,632 px in the seeded "before" frame, which carries a comparable ~50-tile wall): overview (4 stats + an orphan) → two buttons → banner → volume chart → jump-rope sub-dashboard (chart, 3 bests, 2 tables, a paragraph) → by-movement (5 bars) → PR wall (48 tiles) → trails → effort zones. Proposed shape (look plan D8): hero = this week (sessions · volume · the record that moved) + Start/Routines; banner stays; **Records** = six tiles + "All records"; **Jump rope** = one row + its own page; **By movement** = five + more; **Trails** = one row; effort zones leave for the Report. Debt **297** (the worst page). Ad-hoc: overview grid, banner, 3 chart cards, PR tile, trails card, zone bar, rest timer, live session panel.

### `/health/workouts/activities` — Activities
Purpose: every session, filterable (All · Gym · Outdoor · Rope).
Shots: [phone light](screen-audit/health-workouts-activities--phone-light.png) · [phone dark](screen-audit/health-workouts-activities--phone-dark.png) · [desktop](screen-audit/health-workouts-activities--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | Row title 13.5 px / sub 11 px / trailing 13 px — fine; the sub repeats the type ("walk · <time> · walk · <steps> · <kcal>") |
| Spacing | Rows 64 px, consistent; the list is one long card with no month breaks |
| Colour | 55 hexes; icon circles in tint/mint — on-design |
| Components | Chips (one of ten styles), list row (bespoke), count pill |
| Dark mode | Rows hold; chips keep light fills |
| Motion | `page-in` only; rows have no press state |
| Empty state | Not seen with data; from code: a sentence |
| Loading | None |

Severity **P1** (data screen). Clutter: medium — a manual workout's whole description renders as a paragraph inside its row (not styling: filed); no grouping by week. Debt 95.

### `/health/workouts/activities/[id]` — Activity detail
Purpose: one session: map, splits, zones, sets, HR chart, voice log.
Shots: [phone light](screen-audit/health-workouts-activities-id--phone-light.png) · [phone dark](screen-audit/health-workouts-activities-id--phone-dark.png) · [desktop](screen-audit/health-workouts-activities-id--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | 82 arbitrary sizes in `components/activity-detail.tsx` (1,419 lines) — the second-worst file |
| Colour | 102 hexes; two chart ramps (pink and the watch's cool→hot zones) on one page |
| Components | 14 raw buttons, 6 raw fields (inline edit); the voice-log audit list is its own component language |
| Dark mode | The page backgrounds are `bg-[#F2F1F2]` literals — the whole detail stays light in dark |
| Motion | None |
| Empty / loading | A blank `#F2F1F2` div while loading; "That workout isn't here anymore" when missing |
| Bug (not styling) | MapLibre throws `GPUInitializationError` where WebGL2 is absent (the first headless capture); `trail-map.tsx` catches the construction but the console error surfaces — filed |

Severity **P1**. Clutter: high — every metric the row has is shown as a card. Debt 218.

### `/health/workouts/plan` — AI training plan
Shots: [phone light](screen-audit/health-workouts-plan--phone-light.png) · [phone dark](screen-audit/health-workouts-plan--phone-dark.png) · [desktop](screen-audit/health-workouts-plan--desktop-light.png)

Legacy identity in full: an orange "🔥 Streak" tile, a purple "Total" tile, 41 lucide icons, `rounded-2xl` cards with `shadow`, purple "D1–D5" circles, a trophy emoji on Personal Records, blue/orange glyphs on the progress rows. Dark: cards hold, tints stay orange/purple. 2,256 lines across page + components. Severity **P2** (named in his list). Debt 77. No design slice — converge presentation (D7).

### `/health/workouts/routines` — Routines
Shots: [phone light](screen-audit/health-workouts-routines--phone-light.png) · [phone dark](screen-audit/health-workouts-routines--phone-dark.png) · [desktop](screen-audit/health-workouts-routines--desktop-light.png)

Calm and close to the kit: list rows with title/sub, a text "Archive" per row, "+ Build new routine" in primary. 19 hexes, 11 raw buttons, 8 raw fields (the builder). Dark: holds. Severity **P2**. Debt 71.

### `/health/activity` — Activity (Apple Health steps)
Shots: [phone light](screen-audit/health-activity--phone-light.png) · [phone dark](screen-audit/health-activity--phone-dark.png) · [desktop](screen-audit/health-activity--desktop-light.png)

Built from the Report's card language (no design slice — deferred-items 2026-10-17). The header hard-codes \"APPLE HEALTH · CENTRAL TIME\" (`activity/page.tsx:147`) while the app runs on America/Bogota — filed for main. 2,626 px: notice → yesterday hero (deep raspberry) → "Friday vs your week" (four numbers each with three sub-lines) → week card (3 stats, bar chart, 4 sub-cards, a sentence) → History (two chip rows, chart) → Trends table → All time (4 stats, 6 tiles, weekday chart, a paragraph). Typography: 54 arbitrary sizes; the per-number sub-stats (avg · last · vs) are three lines of 10–11 px under every value. Dark: holds except black "Steps" chip. Severity **P1** (data screen). Clutter: high — fold "All time" and "Trends" behind the history chips. Debt 108.

### `/health/progress` — Progress photos
Shots: [phone light](screen-audit/health-progress--phone-light.png) · [phone dark](screen-audit/health-progress--phone-dark.png) · [desktop](screen-audit/health-progress--desktop-light.png)

Legacy: lucide camera in a grey card, two outlined buttons in a generic style, "Track your visual progress over time" sub. Empty state is the generic one. Nothing links here any more (the Body round removed the compare). Severity **P3**. Debt 14.

### `/health/report` — Sunday Report
Shots: [phone light](screen-audit/health-report--phone-light.png) · [phone dark](screen-audit/health-report--phone-dark.png) · [desktop](screen-audit/health-report--desktop-light.png)

The reference for "the data is the hero": a deep-raspberry headline card, then Energy, Macros, Training (with the pink zone ramp), Weight, Coach — each one kicker, one number row, one chart. Still 32 hexes and 37 arbitrary sizes (the same hierarchy typed by hand). Dark: the headline card and charts hold; the coach card's tint hardcodes light pink. Severity **P2** (port it to tokens; change nothing visible). Debt 86.

### `/health/recovery` — Recovery + Readiness
Shots: [phone light](screen-audit/health-recovery--phone-light.png) · [phone dark](screen-audit/health-recovery--phone-dark.png) · [desktop](screen-audit/health-recovery--desktop-light.png)

Legacy: a blue-tinted score card whose number turns red in the recovery state (the seed's "today" is an early morning — breakfast, no water — so the frame shows it), blue progress bars, lucide heart/battery, a raw date input + "Refresh". Severity **P3** (stripped surface; recovery lives in the watch and Body). Debt 6 — small, but every pixel is off-identity.

### `/health/coach` — Weekly game plan
Shots: [phone light](screen-audit/health-coach--phone-light.png) · [phone dark](screen-audit/health-coach--phone-dark.png) · [desktop](screen-audit/health-coach--desktop-light.png)

Legacy: a teal→orange gradient header, pink tiles with teal/yellow lucide icons and monospace numbers, a raw date input. **Lane B is building the Coach** — this lane only converges presentation after their components land, or leaves it to them. Severity **P3** here. Debt 14.

### `/health/outcomes`, `/health/automations`, `/health/command-center`, `/health/water`
Shots: [outcomes](screen-audit/health-outcomes--phone-light.png) · [automations](screen-audit/health-automations--phone-light.png) · [command center](screen-audit/health-command-center--phone-light.png) · [water](screen-audit/health-water--phone-light.png) (dark and desktop alongside)

All four are the old app: raw date inputs, generic pill buttons (Preview Run / Run Now / Add Rule / Save Rules — four button styles on one card), form grids of raw selects, "No activity found for this day." in a card, Water's "Total Fluids" tile in the old blue (`border-blue-500/20 bg-blue-500/5`). None is linked from a designed surface. Severity **P3**; converge to the kit for consistency and list as pending slices. Debt 10 · 13 · 12 · 9.

---

## Body

### `/health/body` — Body
Shots: [phone light](screen-audit/health-body--phone-light.png) · [phone dark](screen-audit/health-body--phone-dark.png) · [desktop](screen-audit/health-body--desktop-light.png)

The Pitaya Body round-1 port: weigh-in, target & forecast, composition range bars, body map, body-type matrix, trends, tape, milestones. On its own tokens (`--b-*`, 182 inline styles — the spec's numbers typed as `style={{}}`), with its own dark palette and its own system-following switch. 4,329 px. Dark: the only screen designed for it, and it tints the chrome too. Motion: the spec's 500 ms rises and 1.8–2.2 s draw-ons (D3). Severity **P2**: keep the design, move `--b-*` onto the app tokens (they are the same values), fold the theme switch into the app's (D5), apply the motion standard. Debt 205 (inline styles). Pending stages (back view, shading, training mode, pull-to-sync, add-a-milestone) stay as listed in `state.md`.

### `/health/body/metric` — Body metric drill-in
Shots: [phone light](screen-audit/health-body-metric--phone-light.png) · [phone dark](screen-audit/health-body-metric--phone-dark.png) · [desktop](screen-audit/health-body-metric--desktop-light.png)

The push-in for one metric: hero value, range chips, trend with scrub, weigh-ins list, "What it means". On-design; 29 hexes from the older port. **The dock covers the last two lines of the "What it means" card** (S10). Dark: follows the Body palette. Severity **P2**. Debt 70.

---

## Food

### `/health/food` — Food
Shots: [phone light](screen-audit/health-food--phone-light.png) · [phone dark](screen-audit/health-food--phone-dark.png) · [desktop](screen-audit/health-food--desktop-light.png)

Design port (screen 2): date header, Targets/kcal pills, day timeline with "not logged" slots, MY USUALS, SUPPLEMENTS. Empty state is designed ("the mic knows"). 42 hexes, 38 arbitrary sizes. Dark: timeline and usuals hold; pills keep light tints. Severity **P2** (restyle to tokens; presentation only — lane D owns the logging logic). Debt 118.

### `/health/food/history` — Food history
Shots: [phone light](screen-audit/health-food-history--phone-light.png) · [phone dark](screen-audit/health-food-history--phone-dark.png) · [desktop](screen-audit/health-food-history--desktop-light.png)

Design port: calorie trend vs goal, by-day rows with macro bars. Clean. 47 hexes. Severity **P2**. Debt 89.

### `/health/water` — see Train above (legacy).

---

## Trends

### `/trends`, `/trends?tab=weekly-report`, `/trends/daily-log`
Shots: [trends](screen-audit/trends--phone-light.png) · [weekly report tab](screen-audit/trends-weekly-report--phone-light.png) · [daily log](screen-audit/trends-daily-log--phone-light.png)

The last fully old-identity module: a gradient "AI Weekly Insight" card, an orange "Consistency" card, orange/purple/teal stat tiles with lucide icons, orange bar charts, blue/purple/teal Recharts lines, nine chart cards in a row, past 4,400 px. The design says Trends is absorbed into Body. Dark: the gradient cards stay light. Severity **P3** (D7: restyle minimally, recommend retiring). Debt 136 · 17.

---

## Settings

### `/settings` — Settings
Shots: [phone light](screen-audit/settings--phone-light.png) · [phone dark](screen-audit/settings--phone-dark.png) · [desktop](screen-audit/settings--desktop-light.png)

| Dimension | Finding |
|---|---|
| Typography | Row labels 12.5 px, values 12 px bold, descriptions 11 px, the zone editor 20 px, the System card 15/13/11 — five row heights on one page |
| Spacing | The watch card, the five feature rows, the six data rows, the zone card, the App rows and the System card are six different paddings |
| Colour | The watch card is mint-tinted; the AI/System card uses a teal icon and a teal "Top up" link (old identity); 16 hexes |
| Components | The watch rows end in a read-only "ON"/"off" status (the design's, pitaya-app.dc.html) that reads like a toggle — it should look like a status, never a control; three button styles (outlined, filled raspberry, grey "Archived"); 8 raw buttons; lucide icons (6) |
| Dark mode | Rows hold; the mint watch card and the model-name code block stay light |
| Motion | `page-in` only |
| Empty / loading | n/a |

Severity **P1** — "a feeling of a wall of text". Clutter: high — 2,053 px for twenty settings. Proposed: five Sections (Watch · Data · Connections · App · System), every setting a `ListRow` with a one-line title and one thing on the right — a `Status` for read-only state (the watch rows: On/Off with the connection), a `Switch` only for something he can change, a value, or a chevron, descriptions behind a Disclosure, the zone editor its own row that opens a sheet, the System card re-tokened. Lane B's Coach section and lane D's RENPHO card get their own named section components. Debt 72.

### `/settings/notifications` — Notifications
Shots: [phone light](screen-audit/settings-notifications--phone-light.png) · [phone dark](screen-audit/settings-notifications--phone-dark.png) · [desktop](screen-audit/settings-notifications--desktop-light.png)

Real switches (the only ones in the app) in a clean list — then "Recently sent" lists every notification ever, each with a red "No device subscribed" badge, to 4,109 px. Severity **P1** for the tail (show five, "show all"); the switch list is the model for Settings. Debt 23.

### `/settings/claude`, `/settings/export`, `/settings/import`
Shots: [claude](screen-audit/settings-claude--phone-light.png) · [export](screen-audit/settings-export--phone-light.png) · [import](screen-audit/settings-import--phone-light.png)

Claude: on-token, 20 arbitrary sizes, a token box. Export: legacy shadcn cards with 9 lucide icons. Import: legacy, a large textarea and 12 lucide icons. Severity **P2** (part of "the settings too"). Debt 32 · 10 · 28.

---

## Spirit (phone)

### `/spirit` — Spirit home
Shots: [phone light](screen-audit/spirit--phone-light.png) · [phone dark](screen-audit/spirit--phone-dark.png) · [desktop](screen-audit/spirit--desktop-light.png)

Round-2 port: memory deck strip, the black University card, Carrying, four tiles, Sunday, Track 2, Transcript. On-design; 60 hexes, 30 arbitrary sizes (the design's numbers typed by hand). Dark: the black card and tiles hold; the tint strip and "Did it" button keep light hexes. Severity **P2** (tokens only). Debt 122.

### `/spirit/study` — The study
Shots: [phone light](screen-audit/spirit-study--phone-light.png) · [dark](screen-audit/spirit-study--phone-dark.png) · [desktop](screen-audit/spirit-study--desktop-light.png)

Designed journey; 83 hexes, 57 sizes, 13 raw buttons. Severity **P2**. Debt 174.

### `/spirit/read` — the Reader
Shots: [phone light](screen-audit/spirit-read--phone-light.png) · [dark](screen-audit/spirit-read--phone-dark.png) · [desktop](screen-audit/spirit-read--desktop-light.png)

`components/spirit/reader.tsx` is the single largest debt file (2,174 lines; 87 hexes, 102 sizes, 149 inline styles, 44 raw buttons): three reader themes (light/dark/night) implemented as hex tables rather than tokens. Scripture itself in Literata is right. Severity **P2** — converge the chrome to tokens; the reader themes become the app's light/dark plus a "night" variant. Debt 396.

### `/spirit/bible`, `/spirit/term`, `/spirit/term/start`, `/spirit/notebook`, `/spirit/notebook/page/[id]`, `/spirit/memory`, `/spirit/church`, `/spirit/library`, `/spirit/track2`, `/spirit/transcript`, `/spirit/settings`
Shots: [bible](screen-audit/spirit-bible--phone-light.png) · [term](screen-audit/spirit-term--phone-light.png) · [term/start](screen-audit/spirit-term-start--phone-light.png) · [notebook](screen-audit/spirit-notebook--phone-light.png) · [page](screen-audit/spirit-notebook-page-id--phone-light.png) · [memory](screen-audit/spirit-memory--phone-light.png) · [church](screen-audit/spirit-church--phone-light.png) · [library](screen-audit/spirit-library--phone-light.png) · [track2](screen-audit/spirit-track2--phone-light.png) · [transcript](screen-audit/spirit-transcript--phone-light.png) · [settings](screen-audit/spirit-settings--phone-light.png)

All designed (round-2 ports) and largely consistent with each other: kicker + title header, back pill, cards, chips. **Church needs care:** its "this week" card reads `weeks[].questions` with no guard, so a series week saved without questions renders the error page instead of the screen (the phase-1 frame showed exactly that, because the first seed omitted them; the seed now carries them) — filed. Shared faults: the design's values typed as hexes (8–58 per page) and sizes (11–35 per page); Notebook stacks three chip rows plus a colour row before the first entry; the notebook page view is 115 hexes (ink rendering + replay bar). Dark: the designed cards hold; chips and tints keep light hexes. Severity **P2** across the set (tokens and chips only; no visual change intended). Debt 40 · 87 · 72 · 73 · 192 · 62 · 122 · 44 · 42 · 39 · 66.

---

## Desk (iPad)

### `/home`, `/spirit/desk`, `/spirit/notebooks`, `/spirit/recordings`, `/spirit/hymns`, `/spirit/desk-settings`
Shots: [home](screen-audit/desk-home--desktop-light.png) · [desk](screen-audit/desk-spirit-desk--desktop-light.png) · [notebooks](screen-audit/desk-spirit-notebooks--desktop-light.png) · [recordings](screen-audit/desk-spirit-recordings--desktop-light.png) · [hymns](screen-audit/desk-spirit-hymns--desktop-light.png) · [desk settings](screen-audit/desk-spirit-desk-settings--desktop-light.png) (the phone shots show the compact fallback — the phone Spirit page)

The V3 iPad port: full-bleed, its own motion block inline in the layout (fade-only on anything containing ink — a law, kept), every colour a literal (`bg-[#F2F1F2]`, 152 hexes on Home, 225 on Recordings), no dark mode at all. Severity **P3** (a separate surface with its own design; tokens only, no dark mode until a slice says so). Debt 253 · 158 · 187 · 370 · 211 · 232.

---

## Finance

### `/finances` and its ten sub-routes
Shots: [overview](screen-audit/finances--phone-light.png) · [transactions](screen-audit/finances-transactions--phone-light.png) · [budget](screen-audit/finances-budget--phone-light.png) · [goals](screen-audit/finances-goals--phone-light.png) · [pockets](screen-audit/finances-pockets--phone-light.png) · [obligations](screen-audit/finances-obligations--phone-light.png) · [inbox](screen-audit/finances-inbox--phone-light.png) · [sources](screen-audit/finances-sources--phone-light.png) · [merchants](screen-audit/finances-merchants--phone-light.png) · [reports](screen-audit/finances-reports--phone-light.png) · [import](screen-audit/finances-import--phone-light.png)

The pre-Pitaya app intact: a mint Quick Capture card, emoji icons on rows, blue/orange/purple/teal tiles, green/red/yellow numbers, generic segment tabs, 20 lucide icons on the overview, 13 raw fields on Transactions, an empty "Last 7 Days" axis. No design slice; stripped module per the design (functional, no investment). Dark: tints stay light. Severity **P3** across the module: tokens, kit buttons/fields/chips, glyphs for emoji — no layout change. Debt 79 · 61 · 44 · 31 · 10 · 14 · 9 · 16 · 0 · 0 · 20.

---

## Auth

### PIN gate
Shots: [phone light](screen-audit/pin-gate--phone-light.png) · [phone dark](screen-audit/pin-gate--phone-dark.png) · [desktop](screen-audit/pin-gate--desktop-light.png)

The first thing he sees. Designed (the "fine notebook, not a bank vault" brief); lucide lock/loader icons remain. Severity **P2**.

### `/oauth/authorize`
Shots: [phone light](screen-audit/oauth-authorize--phone-dark.png) · [dark](screen-audit/oauth-authorize--phone-dark.png) · [desktop](screen-audit/oauth-authorize--desktop-light.png)

The claude.ai connector consent screen: 16 hexes, 9 sizes, on-brand. Severity **P3**. Debt 30.

### `/`, `/health`
Redirects to `/dashboard`; recorded for completeness.

---

## Watch (Series 8 45 mm, 198×242 pt)

Frames from the simulator (Series 11 46 mm, judged for the 45 mm) through
the DEBUG smoke seams, paired against the dev server running on the
synthetic seed — the app was uninstalled and its keychain reset first, so
no production pairing or cache can appear in a committed frame. Pages
inside a live workout were reached by swiping the carousel by hand. Most
frames were taken on 2026-10-17; Home and the workout list were retaken on
2026-10-20 after the seed moved to that day.
Floor: type ≥ 7 pt via `Theme.r3TypeSize`/the wrist scale; every tappable
≥ 38 pt; no `minimumScaleFactor` below 0.8 (all 39 uses are at 0.8 —
compliant).

| Screen | Frame | Reached by | Findings |
|---|---|---|---|
| Welcome / pairing | [welcome](screen-audit/watch/welcome.png) | fresh install | The tagline truncates to "Your training,…" — meaning-bearing text cut; "Enter your Pitaya PIN" in tertiary under a strong CTA |
| PIN pad, paired intro | — | needs typing | Audited from `PairingViews.swift`: keys are PitayaCTA-sized; intro text in secondary |
| Home grid | [home](screen-audit/watch/home.png) · [with sample routines](screen-audit/watch/home-sample-circuit.png) | launch | Tiles are the design's; the date line ("Tuesday · 2 of 2 this week") and the tile subs ("spirit vs journal · soon") in muted at ~7.7 pt, and a routine name in the Workouts sub truncates when one is due; the week diamonds top-right read as decoration; the Workouts tile is the one accent — right |
| Workout list | [workout-list](screen-audit/watch/workout-list.png) | `OPEN=workouts` | Strong: 20 pt titles; subs in tertiary ("just record · shape it in Pitaya after") are the faded layer |
| Hike menu | — | needs a tap | From `HomeView.swift`: rows mirror the list; "SAVED TRAILS" kicker in muted |
| Jump rope setup | [rope-setup](screen-audit/watch/rope-setup.png) | `ROPE_SETUP` | Segmented control + steppers are large and clear; WORK/REST kickers in tertiary |
| Jump rope live | [rope-live](screen-audit/watch/rope-live.png) | `ROPE … ROPE_HOLD` | Hero clock is the right size; "ROPE · 6/4 / JUMP" kicker stack in accent at ~8 pt; BPM/KCAL labels tertiary |
| Summary (rope, unsaved) | [rope-summary](screen-audit/watch/rope-summary.png) | `ROPE … NOSAVE` | The faded case: values white, every label tertiary, "review · save or discard" tertiary; the three sub-floor calls (6.7 pt) are this screen's row sub-labels |
| Summary (circuit, saved) | [circuit-summary](screen-audit/watch/circuit-summary.png) | `SAMPLE_CIRCUIT CIRCUIT_TWICE` | "Saved / synced to Pitaya" in mint — good; "· vs <date>" and "Full breakdown in Pitaya" in tertiary; the delta in mint at ~7 pt |
| Set logger | [set-logger](screen-audit/watch/set-logger.png) | `HOLD` | The best screen: one accent (the crown weight), one CTA, kickers readable; "set 1 · … today" tertiary |
| Freestyle face | [freestyle-face](screen-audit/watch/freestyle-face.png) · [with a voice entry](screen-audit/watch/voice-live.png) | `FREESTYLE` / `VOICELOG VOICE_HOLD` | BPM hero takes the zone colour (mint at Z1) — the one accent; zone chip, elapsed and kcal in one line; End in dim raspberry; "LOG ›" chip — on design |
| Voice log sheet | [voice-log-sheet](screen-audit/watch/voice-log-sheet.png) | `VOICELOG VOICE_LOG` | Titles white, quotes tertiary, the "0:00" timestamps tertiary at ~8 pt — three greys on one card |
| Walk — metrics | [walk-metrics](screen-audit/watch/walk-metrics.png) | `WALK FAKEGPS`, page 1 | Elapsed hero and BPM read well; "ZONE 1 · RECOVERY" kicker and the KCAL/KM/STEPS labels in tertiary at the floor; KM value in accent while BPM's heart is also accent — two accents |
| Walk — live map | kept private | page 2 | Renders correctly (route, head dot, GPS pill, 4-cell stat row). **Not committed:** the smoke seam's fake-GPS start is a real trailhead he uses and the Apple Maps tiles name the streets around it |
| Walk — trail stats | [trail-stats](screen-audit/watch/trail-stats.png) | page 3 | Contour ground + route; distance hero 0.08 KM large; the elevation "— — M" placeholder is as loud as the hero |
| Effort | [effort](screen-audit/watch/effort.png) | freestyle, page 2 | Header, BPM row, zone chip and the band graph are the Round-3 spec; KCAL/H, AVG/PEAK labels at muted 7 pt — the floor with the dimmest role. The doubled trace is a test artefact (the seam's synthetic HR plus the simulator's own samples), not a rendering bug |
| Controls | [controls](screen-audit/watch/controls.png) | page 5 | Three 50 pt circles (End · Pause · Lock), white labels — clear; on design |
| Sequences list / detail, EMOM ring, circuit runner | — | need taps | From `SequenceViews.swift`: 7 plain buttons, 2 tappable; detail rows mix bright/primary/secondary/tertiary/muted/faint — six text roles in one file |
| Settings | — | needs a tap | From `SettingsView.swift`: 5 plain buttons / 2 tappable; six muted labels; option sheets at r3 12–14 px (7–8.4 pt) |
| Ready (readiness verdict) | — | needs a tap | From `ReadyView.swift`: an 8 pt system-font label (off-brand face); four muted lines |
| Recovery (HRR), Save track, moments (zone bloom, split, PR, streak seeds), bell rack, exercise picker, weight dial, voice confirm cards | — | event-driven | Audited from code: on the Round-3 spec; `SaveTrackView` has a 10 pt system-font label; `VoiceConfirmViews` two faint lines |

Phase 5 captures the screens marked "needs a tap" by driving the
simulator, before and after.

Summary for Phase 5: raise the three sub-floor calls; move meaning-bearing
subs from tertiary/muted to secondary (`#A5A3AA`); hero numerals one step
up on Summary and the metrics pages; replace the four `.system(size:)`
labels with Theme faces; check the 26 plain buttons without
`pitayaTappable`; adopt `Theme.Motion` everywhere (sixteen ad-hoc
durations today).

---

## Appendix A — metrics per route

Generated by `node scripts/design-metrics.mjs` on the e6abccc tree (the
"before" code), with the definitions the gate uses since Phase 2: page
file + direct component imports, kit excluded, Tailwind palette colours
and literal motion timings counted. Debt = sum of the eight counts. (The
"Debt N" figures in the rows above are the phase-1 count, before palette
classes and literal timings were added to the definition.)

| Route | Lines | Hex | Palette | text-[px] | Inline style | Raw button | Raw field | lucide | Motion | Debt |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/actions` | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | **1** |
| `/chat` | 3050 | 85 | 0 | 78 | 26 | 28 | 5 | 0 | 7 | **229** |
| `/dashboard` | 1297 | 47 | 0 | 27 | 23 | 14 | 3 | 0 | 5 | **119** |
| `/finances` | 1301 | 0 | 109 | 31 | 1 | 11 | 6 | 20 | 10 | **188** |
| `/finances/budget` | 696 | 0 | 29 | 16 | 0 | 8 | 8 | 10 | 2 | **73** |
| `/finances/goals` | 422 | 0 | 23 | 5 | 0 | 12 | 5 | 8 | 1 | **54** |
| `/finances/import` | 289 | 0 | 20 | 6 | 0 | 3 | 4 | 7 | 0 | **40** |
| `/finances/inbox` | 548 | 0 | 8 | 3 | 0 | 1 | 1 | 4 | 0 | **17** |
| `/finances/merchants` | 90 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| `/finances/obligations` | 294 | 0 | 4 | 0 | 0 | 1 | 8 | 5 | 0 | **18** |
| `/finances/pockets` | 394 | 0 | 7 | 4 | 0 | 1 | 1 | 4 | 0 | **17** |
| `/finances/reports` | 147 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | **4** |
| `/finances/sources` | 643 | 0 | 8 | 3 | 0 | 2 | 4 | 7 | 0 | **24** |
| `/finances/transactions` | 1012 | 0 | 37 | 20 | 0 | 14 | 13 | 13 | 1 | **98** |
| `/health` | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `/health/activity` | 791 | 31 | 0 | 54 | 14 | 9 | 0 | 0 | 0 | **108** |
| `/health/automations` | 379 | 0 | 0 | 8 | 0 | 0 | 0 | 5 | 0 | **13** |
| `/health/body` | 2658 | 8 | 0 | 0 | 182 | 13 | 2 | 0 | 48 | **253** |
| `/health/body/metric` | 617 | 29 | 0 | 16 | 23 | 2 | 0 | 0 | 2 | **72** |
| `/health/coach` | 282 | 0 | 11 | 4 | 0 | 0 | 0 | 10 | 0 | **25** |
| `/health/command-center` | 163 | 0 | 6 | 5 | 0 | 0 | 0 | 7 | 0 | **18** |
| `/health/food` | 991 | 42 | 0 | 38 | 17 | 19 | 2 | 0 | 0 | **118** |
| `/health/food/history` | 466 | 47 | 0 | 25 | 9 | 8 | 0 | 0 | 2 | **91** |
| `/health/outcomes` | 213 | 0 | 3 | 8 | 0 | 0 | 0 | 2 | 0 | **13** |
| `/health/progress` | 453 | 0 | 5 | 2 | 0 | 1 | 2 | 9 | 0 | **19** |
| `/health/recovery` | 178 | 0 | 9 | 1 | 0 | 0 | 0 | 3 | 2 | **15** |
| `/health/report` | 458 | 32 | 0 | 37 | 14 | 3 | 0 | 0 | 1 | **87** |
| `/health/water` | 338 | 0 | 2 | 2 | 0 | 1 | 0 | 6 | 0 | **11** |
| `/health/workouts` | 2155 | 114 | 0 | 111 | 40 | 31 | 0 | 0 | 3 | **299** |
| `/health/workouts/activities` | 788 | 55 | 0 | 20 | 11 | 9 | 0 | 0 | 2 | **97** |
| `/health/workouts/activities/[id]` | 1470 | 102 | 0 | 82 | 14 | 14 | 6 | 0 | 1 | **219** |
| `/health/workouts/plan` | 2256 | 0 | 114 | 23 | 0 | 5 | 0 | 41 | 8 | **191** |
| `/health/workouts/routines` | 530 | 19 | 0 | 22 | 11 | 11 | 8 | 0 | 0 | **71** |
| `/home` | 1044 | 152 | 0 | 0 | 86 | 15 | 0 | 0 | 6 | **259** |
| `/journal` | 78 | 8 | 0 | 7 | 2 | 0 | 0 | 0 | 0 | **17** |
| `/oauth/authorize` | 172 | 16 | 0 | 9 | 2 | 2 | 1 | 0 | 0 | **30** |
| `/page.tsx` | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `/settings` | 734 | 16 | 6 | 30 | 10 | 8 | 1 | 6 | 2 | **79** |
| `/settings/claude` | 218 | 5 | 0 | 20 | 2 | 5 | 0 | 0 | 0 | **32** |
| `/settings/export` | 442 | 0 | 9 | 0 | 0 | 0 | 1 | 9 | 0 | **19** |
| `/settings/import` | 578 | 0 | 30 | 15 | 0 | 0 | 1 | 12 | 0 | **58** |
| `/settings/notifications` | 521 | 6 | 0 | 5 | 1 | 1 | 2 | 5 | 3 | **23** |
| `/spirit` | 500 | 60 | 0 | 30 | 14 | 14 | 0 | 0 | 4 | **122** |
| `/spirit/bible` | 198 | 18 | 0 | 13 | 5 | 4 | 0 | 0 | 0 | **40** |
| `/spirit/church` | 498 | 58 | 0 | 35 | 13 | 14 | 2 | 0 | 0 | **122** |
| `/spirit/desk` | 1218 | 99 | 0 | 0 | 47 | 11 | 1 | 0 | 5 | **163** |
| `/spirit/desk-settings` | 1016 | 136 | 0 | 0 | 76 | 17 | 3 | 0 | 7 | **239** |
| `/spirit/hymns` | 904 | 115 | 0 | 0 | 70 | 20 | 6 | 0 | 7 | **218** |
| `/spirit/library` | 180 | 20 | 0 | 16 | 5 | 3 | 0 | 0 | 0 | **44** |
| `/spirit/memory` | 274 | 24 | 0 | 23 | 10 | 5 | 0 | 0 | 0 | **62** |
| `/spirit/notebook` | 302 | 37 | 0 | 24 | 7 | 4 | 1 | 0 | 0 | **73** |
| `/spirit/notebook/page/[id]` | 650 | 115 | 0 | 7 | 60 | 10 | 0 | 0 | 1 | **193** |
| `/spirit/notebooks` | 1033 | 116 | 0 | 0 | 55 | 15 | 1 | 0 | 8 | **195** |
| `/spirit/read` | 2261 | 90 | 0 | 102 | 150 | 45 | 5 | 0 | 4 | **396** |
| `/spirit/recordings` | 1864 | 225 | 0 | 0 | 112 | 32 | 1 | 0 | 13 | **383** |
| `/spirit/settings` | 341 | 29 | 0 | 20 | 9 | 7 | 0 | 0 | 1 | **66** |
| `/spirit/study` | 739 | 83 | 0 | 57 | 21 | 13 | 0 | 0 | 0 | **174** |
| `/spirit/term` | 322 | 40 | 0 | 33 | 9 | 3 | 0 | 0 | 2 | **87** |
| `/spirit/term/start` | 275 | 35 | 0 | 31 | 4 | 2 | 0 | 0 | 0 | **72** |
| `/spirit/track2` | 180 | 8 | 0 | 11 | 18 | 2 | 0 | 0 | 3 | **42** |
| `/spirit/transcript` | 157 | 22 | 0 | 12 | 4 | 1 | 0 | 0 | 0 | **39** |
| `/todos` | 519 | 0 | 12 | 8 | 0 | 7 | 0 | 8 | 2 | **37** |
| `/trends` | 2042 | 24 | 108 | 65 | 18 | 3 | 0 | 20 | 6 | **244** |
| `/trends/daily-log` | 226 | 0 | 8 | 9 | 0 | 1 | 0 | 6 | 1 | **25** |

Totals across app + components + lib (509 files): hex 2669 · palette 683 · text-[px] 1301 · inline style 1457 · raw button 595 · raw field 113 · lucide 278 · motion 278

## Appendix B — vocabularies in use

- **Hex, most typed:** `#8C2F51` ×270 · `#A63D63` ×258 · `#FFFFFF` ×239 ·
  `#232227` ×190 · `#96949B` ×181 · `#E4E2E6` ×155 · `#66646C` ×119 ·
  `#F2F1F2` ×115 · `#454349` ×92 · `#FAF9FA` ×81 · `#F6E3EB` ×81 ·
  `#A9A7AE` ×76 (not in any design file) · `#EDEBEE` ×58 · `#D9D7DC` ×52 ·
  `#DCA8BE` ×44 · `#3E7A54` ×36 (not in any design file) · `#5E9B72` ×32 ·
  `#B4533F` ×24 · `#D9A23E` ×22 — then a tail of 120 colours used 1–21 times.
- **Inline font sizes:** 10 ×93 · 10.5 ×72 · 11 ×68 · 12 ×63 · 9.5 ×59 ·
  12.5 ×51 · 11.5 ×48 · 13 ×42 · 9 ×35 · 8.5 ×32 · 14 ×23 — and 6.5, 7.5, 8 px
  exist.
- **Radius:** `rounded` ×367 · `rounded-full` ×310 · `rounded-lg` ×136 ·
  `rounded-xl` ×101 · `rounded-2xl` ×37 · `rounded-md` ×25 — six card radii.
- **Motion:** 34 keyframes in `globals.css`; durations 45 ms → 2.2 s; the
  desk defines twenty more inline; `transition-all` ×52.
- **Shadows:** `shadow` ×120 · `shadow-lg` ×11 · `shadow-2xl` ×3 ·
  `shadow-red`/`shadow-purple` ×1 each; 14 files use gradients.
- **Empty states:** fourteen distinct phrasings; six `animate-pulse`
  loaders; five "Loading…" strings.

## Appendix C — bugs seen while looking (not styling; filed in `docs/followups.md`)

- On the production copy, a run of freestyle sessions in one month all
  show the same duration in the Activities list — a duration leak, not a
  rendering fault.
- A manual workout's full description renders as a paragraph inside its
  Activities row (no clamp).
- MapLibre throws `GPUInitializationError` where WebGL2 is unavailable;
  the page should degrade to the static polyline.
- The Activity page's header says "CENTRAL TIME" while the app runs on
  America/Bogota.
- The church "this week" card crashes the page when a series week has no
  `questions`.
- Settings → Appearance says "Night — next build" while `lib/settings.ts`
  already carries a `theme` field defaulting to `"dark"` that nothing reads.
