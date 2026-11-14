# The look — plan (lane C, 2026-10-17)

One token file, one component kit, every screen converged onto it, a
build-time gate that only lets the numbers fall. Companion to
[`screen-audit.md`](screen-audit.md) (what is there today) and
[`pitaya-tokens.md`](pitaya-tokens.md) (the extracted design values, which
this plan extends into a standard where the design is silent).

The brief, in Michael's words: *quiet, dense, fast — the data is the hero;
no gradients, no glow, no cartoon icons, one accent colour, motion under
150 ms and behind reduced-motion.* His notes this weekend: the workouts and
data screens are "clutterry" and hard to read; Settings is a wall of text;
the app is getting "AI and text driven" instead of feature-rich; the watch
"feels small and faded, it doesn't pop."

---

## 0 · The plain-English layer

What will change, screen by screen, in the order he asked for:

1. **Workouts** stops being a 4,000-pixel scroll. One hero (this week:
   sessions · volume · the one record that moved), then short sections
   that open on tap: the PR wall shows six and offers "all records"; the
   jump-rope dashboard becomes one row that opens its own page; the
   "by movement" bars show five. Same data, nothing deleted — it is
   folded, not removed.
2. **Activities, the activity detail, Plan, Routines, Body, Progress,
   Activity, Report, Today** get the same type scale, the same cards, the
   same chips and the same chart frame, so moving between them stops
   feeling like changing apps. Plan, Recovery, Coach, Trends and Finance
   lose their orange/purple/teal leftovers.
3. **Settings** becomes five short groups (Watch · Data · Connections ·
   App · System), one line per setting — a status where it only reports
   (the watch's connection), a switch only where he can change something —
   and the explanatory sentences tucked behind a tap instead of printed
   under every row.
   Notifications keeps the last five sent, not forty.
4. **Night mode** finally exists: Settings → Appearance → Day / Night /
   System. The dark palette is the one the Body screen already wears.
5. **Motion** gets one vocabulary: 150 ms for anything that changes state,
   a slightly longer 220 ms only for sheets sliding in, nothing slower, and
   nothing at all if the phone asks for reduced motion. The richness comes
   from real empty, loading and "saved" moments, not from longer
   animations.
6. **The watch** gets bigger and brighter where it matters: every label
   at or above the 7 pt floor, the secondary text one step brighter, hero
   numbers one step larger, and the accent used on the single thing that
   matters on each screen. No glow, no extra colour.
7. **A gate** in the build stops the drift from coming back: a new raw
   colour, a new odd font size, a new hand-rolled button fails the build.

What will not change: no feature is removed, no data moves, the
confirm-before-save flow in Chat stays exactly as it is, and the designed
screens (Body, Food, Report, Spirit) keep their design — they get the
shared tokens underneath, not a new look. **Qualified by D12:** their type
moves onto the one scale (the design's 10 / 10.5 / 11.5 / 12.5 / 13.5 px
steps and Body's 46/54 px numerals map to the nearest step), and by D14
(the faint grey stops carrying words) — both surfaced deviations.

---

## 1 · Tokens — one file, `app/globals.css`

`app/globals.css` is restructured into delimited blocks. Every value below
is either **extracted** from a design file (source named) or **defined**
here because the design is silent (marked *standard*). The watch mirror is
`ios/Shared/Theme.swift`; the human-readable mirror is `pitaya-tokens.md`.

### 1.1 Colour (light)

| Token | Value | Source |
|---|---|---|
| `--bg` | `#F2F1F2` | pitaya-app |
| `--bg-raised` | `#FAF9FA` | pitaya-app |
| `--card` | `#FFFFFF` | pitaya-app |
| `--card-2` | `#F6F5F7` | Body spec §0 (card-alt) |
| `--ink` | `#232227` | pitaya-app |
| `--ink-2` | `#66646C` | pitaya-app (ink-secondary) |
| `--ink-3` | `#96949B` | pitaya-app (ink-muted) |
| `--ink-4` | `#B4B2B8` | Body spec §0 (ghost) |
| `--rule` | `#EDEBEE` | Body spec §0 |
| `--rule-2` / `--border` | `#E4E2E6` | pitaya-app (hairline) |
| `--primary` | `#A63D63` | pitaya-app |
| `--primary-deep` | `#8C2F51` | pitaya-app |
| `--accent-bright` | `#DC74A0` | pitaya-app |
| `--accent-soft` | `#DCA8BE` | pitaya-app |
| `--tint` | `#F6E3EB` | pitaya-app |
| `--tint-2` | `#F0E8EC` | pitaya-app |
| `--edge` | `#E9CFDC` | Body spec §0 |
| `--dark-ink` | `#454349` | pitaya-app |
| `--success` | `#5E9B72` | pitaya-app |
| `--warning` | `#D9A23E` | pitaya-app (3 uses in the file) — *promoted to a status token* |
| `--danger` | `#B4533F` | pitaya-app (2 uses) — *promoted; replaces `#C14040`/`#C24040`/red-500* |
| `--info` / `--slate` | `#5E7FA6` | Body spec §0 (fat mode / second data series) |

Status tints (backgrounds behind a status line) are the status colour at
10 % over `--card` — *standard*. Nothing else is red; the Body spec's rule
("no red, no HIGH") stays: out-of-band numbers are explained in a sentence.

### 1.2 Colour (dark) — a token override only

The only designed dark palette is the Body round's. It becomes the app's
`.dark` block and replaces the earlier ad-hoc one (which nothing could
switch on):

| Token | Value |
|---|---|
| `--bg` `#131217` · `--bg-raised` `#17161B` · `--card` `#1E1D23` · `--card-2` `#27262C` |
| `--ink` `#F2F1F2` · `--ink-2` `#B9B7BE` · `--ink-3` `#85838B` · `--ink-4` `#5F5D65` |
| `--rule` `#2B2A30` · `--rule-2` `#37363C` |
| `--primary` `#D66A93` (the Body spec's `#D0628C` lifted one step for AA — D13) · `--primary-deep` `#E795B4` · `--tint` `#3A2331` · `--edge` `#4C2C3E` |
| `--success` `#7FB893` · `--slate` `#86A3C8` · `--warning` `#E0B45A` · `--danger` `#D07A68` (*standard* — lifted one step like success) |

Rule: a component never reaches for a hex; it reaches for a role. That is
what makes the dark override complete by construction (today the "Open →"
button goes dark-on-dark because it hardcodes `#8C2F51`).

### 1.3 Chart ramp — *standard*

Sequential (one series over intensity, e.g. zone bars on the web):
`--tint` → `--accent-soft` → `--accent-bright` → `--primary` → `--primary-deep`.
Categorical (up to five series): `--primary`, `--dark-ink` (ink-2 in
Night), `--slate`, `--success`, rose dust `#B07A92` (Night `#C08AA2`) — one
accent family, two neutrals, one green; every series reaches 3:1 against
the card in both modes (WCAG 1.4.11; `accent-soft` did not, 2.0:1). The
sequential ramp's faint end is meant to recede and is not held to 3:1.
Reference bands (Body range bars) use `--band` (`#E2E0E5` / `#38373E`).
Keyboard focus is `--focus-ring` — solid accent, ≥ 3:1 on every surface.
Grid: hairlines in `--rule` at 1 px. Reference lines: `--ink-3` dashed
3 · 4. Tooltip: `--ink` on `--card` (inverted in dark), 11.5 px / 600,
radius 8 — the Body spec's. Empty chart: the frame, the axis labels and
one sentence; never an empty box.

The watch keeps the Round-3 zone ramp (`#7FA6C9 … #FFD9E8`) because that
design file is explicit — see Decisions, D4.

### 1.4 Type scale — *standard* (derived from the design's sizes)

Today the app uses thirty-two arbitrary `text-[Npx]` sizes (9 · 9.5 · 10 ·
10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 … 96) plus Tailwind's `text-xs/sm`.
The standard is seven steps with a floor (coordinator, 2026-10-20: "small
and faded" applies to the phone too):

| Token | px / lh | Face | Use |
|---|---|---|---|
| `--text-hero` | 44 / 48 | Familjen 700, tabular | the one number on a screen (today's kcal, weight) — Today's designed hero, verbatim |
| `--text-display` | 26 / 30 | Familjen 700 | page titles, report headline |
| `--text-title` | 19 / 24 | Familjen 600–700 | card titles, tile values |
| `--text-body` | 15 / 22 | Instrument 400–500 | prose, list titles |
| `--text-ui` | 13 / 18 | Instrument 500–600 | buttons, chips, list rows, table cells |
| `--text-caption` | 12 / 16 | Instrument 400–500 | secondary lines, deltas, dates |
| `--text-micro` | 11 / 14 | Instrument 600, 0.14em, uppercase | kickers / section headers (`.micro-label`) and chart axis ticks ONLY |

Rules: **nothing meaning-bearing below 12 px on a phone**; 11 px is the
micro label and axis ticks only; numbers are always Familjen +
`tabular-nums`; serif (Literata) stays reserved for Scripture. Mapping of
today's sizes: 9–11.5 → 12 (or 11 when it is a micro label/tick);
12.5 → 12 or 13; 13.5 → 13; 14/14.5/15 → 15; 17 → 19; 19–22 → 19;
24–26 → 26; 30–54 → 44 (Body's 46/54 px numerals included — D12). **Muted text meets AA (4.5:1) on bg, card and
card-2 in both modes** — `ink-2` is the only muted text role; `ink-3`
(`#96949B`, 2.7:1) is for icons, placeholders and decoration (D14);
`tests/design-tokens.test.ts` proves every text role.

### 1.5 Spacing, radius, elevation

- Spacing scale (4-base): 4 · 8 · 12 · 16 · 20 · 24 · 32. Page gutter 16;
  card padding 16 (compact) / 20 (default); gap between cards 12; gap
  between sections 24. *standard*
- Radius: `--radius-pill` 999 (buttons, chips, inputs — pitaya-app: "pills
  everywhere interactive"); `--radius-card` 16 (pitaya-app 12–18);
  `--radius-card-lg` 22 (Body cards); `--radius-control` 12 (tiles,
  keys); `--radius-sheet` 24 (top corners).
- Elevation: cards are a 1 px `--rule-2` hairline plus
  `0 1px 2px rgba(35,34,39,.04)`; the dock and sheets are
  `0 12px 40px rgba(35,34,39,.14)`; nothing else casts a shadow; no
  gradients, no glow (`.card-glow`, `.gradient-text`, `.glow-*`,
  `.shimmer` are removed). *standard*
- `--dock-inset`: 176 px (dock + tab bar + breathing room) applied as the
  page's bottom padding, so a page's last card can never hide under the
  dock (today the Body metric page's last line does).

### 1.6 Motion — *standard* (overrides the design files' durations)

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 90 ms, ease-out | press, hover, colour swaps (the watch's "attack") |
| `--motion-fast` | 150 ms | every state change: chips, toggles, list-item entrance, metric number change, skeleton → content |
| `--motion-base` | 220 ms | sheets and drawers opening, page push — the only thing allowed over 150 ms (D2) |
| `--motion-exit` | 150 ms, ease-in | everything leaving — never slower than it arrived |
| `--ease-out` | `cubic-bezier(.3,.9,.3,1)` | pitaya-app's sheetUp/pushIn curve |
| `--ease-in` | `cubic-bezier(.5,0,.8,.4)` | the chat round's exit curve |
| `--ease-settle` | `cubic-bezier(.22,.9,.3,1)` | Body spec's marker settle |

Stagger: 30 ms per item, six items at most, then everything lands
together. Loops are allowed only where they carry meaning (listening,
thinking, syncing). `prefers-reduced-motion: reduce` renders the end state:
no transforms, no stagger, loops kept at a gentle rate only where they
carry meaning (the chat round's rule, kept).

Watch mirror (`Theme.Motion`): attack 90 · fast 150 · base 220 · exit 150;
arrival springs stay at the Round-3 350 ms only for moments the design
scripted (PR, zone bloom, km split), haptic-paired; AOD animates nothing.

---

## 2 · The kit — `components/ui/`

shadcn primitives stay where they exist (button, input, select, sheet,
dialog, tabs, skeleton, sonner, badge, card, table, separator, textarea,
label, dropdown-menu, alert-dialog); they are re-tokened, and the gaps are
filled. Everything below is a presentation component — no data logic.

| Component | Replaces | Notes |
|---|---|---|
| `Button` (variants primary · secondary · ghost · destructive; sizes sm · md · lg; `pill` default) | 595 raw `<button>` elements, 3 button styles in one Settings card | press = 90 ms scale .97 |
| `Field` (`Input`/`Textarea` + label + hint + error) | 113 raw inputs/selects | pill, 16 px on phone (no iOS zoom) |
| `Select` | raw `<select>` | shadcn, re-tokened |
| `Switch` | hand-rolled toggles | new (radix) — only for things he can change (notification senders, preferences) |
| `Status` | "ON"/"off" text, sync states | new — a READ-ONLY dot + word ("On", "Connected", "Queued"); the watch rows' connection status is this, never a Switch |
| `Chip` (filter · toggle · tag; selected state) | 10 hand-rolled chip styles | pill, `--text-ui` |
| `Card` + `CardKicker` + `CardTitle` + `CardMeta` | `.glass-card`, `.cockpit-card`, `.health-stage`, `body-card`, inline cards | one hairline, one shadow |
| `Section` (kicker + optional action) | `.micro-label` + ad-hoc headers | the only way a section starts |
| `ListRow` (leading slot · title · sub · trailing value/control · chevron) | Settings rows, Notifications rows, activity rows, routine rows | one line by default; `sub` is optional and single-line |
| `Disclosure` | descriptions printed under every row | a "?" that expands the sentence under the row, 150 ms |
| `MetricTile` (kicker · value+unit · delta · optional spark) | `.metric-orb`, stat grids | Familjen tabular value |
| `Delta` | ad-hoc green/red deltas | sign + colour from status tokens; grey when "not better" |
| `ChartFrame` (title kicker · range chips · plot slot · footer) | 6 chart card styles | hairline grid, one tooltip, honest empty state |
| `EmptyState` (glyph · title · one line · optional action) | 14 different "No … yet" treatments | glyph from `pitaya-icons` |
| `Skeleton` (shadcn, kept) | `animate-pulse` divs, "Loading…" strings | skeleton → content in 150 ms |
| `Toast` (sonner, tokened) | `richColors` defaults | success/warn/danger from status tokens |
| `Sheet` (bottom, `--radius-sheet`) | `sheet-up`/`sheet-down` ad-hoc portals | 220 ms, scrim 150 ms |
| `Kicker`/`Micro` text | `text-[10.5px] tracking-[0.16em]` ×154 | `--text-micro` |

Icons: `components/pitaya-icons.tsx` is the only icon source on designed
surfaces (PORT GATE §1). Legacy surfaces may keep lucide until their slice
lands; the gate makes sure the count only falls. Emoji as icons (Todos,
Finance, Plan) are retired to glyphs.

Kitchen sink: `app/(tabs)/settings/design/page.tsx` renders every kit
component in every state, light and dark — screenshot in both modes is
part of Phase 2's evidence.

---

## 3 · The gate — `scripts/design-gate.mjs` (ratchet)

Counts per file (the metrics in `scripts/design-metrics.mjs`) over
`app/`, `components/` and `lib/` — `.tsx`, `.ts` and `.css`: raw hex;
Tailwind palette colour classes (`text-red-500`, `bg-teal-50`,
`border-blue-500/20` … — the old identity); `text-[Npx]`; inline
`style={{ color | fontSize | background … }}`; raw
`<button>`/`<input>`/`<select>`/`<textarea>` outside `components/ui`;
lucide imports; and motion off the standard — `transition-all`,
`duration-N` other than 90/150/220, `duration-[…]`, and literal timings in
`transition`/`animation` declarations (inline styles, `<style>` blocks,
CSS). `app/globals.css` is the token file: exempt from hex and palette,
not from motion.

The ratchet's unit is the **family** (a tab section, a components folder,
`lib`, the desk, the API): debt may move between files of one family — a
rename, a split, an extracted component — but no family's total may rise,
and a family the baseline does not know must be clean. `--update` refuses
unless the check passes, so it can only lower family totals; a deliberate
raise is a reviewed hand edit of `scripts/design-gate.baseline.json`.
Wired as `npm run design-gate`, first in `npm run build`, and in
a CI job on every pull request and push to main — **staged at
`scripts/ci/design-gate.workflow.yml`, not yet installed**: this lane's
push token lacks GitHub's `workflow` scope, so moving it into
`.github/workflows/` needs his push (filed in followups). Tests (`tests/design-gate.test.ts`) cover each metric, the token-file
and kit exemptions, a family rise, a move within a family, a new family
with and without debt, and deletions.

**Merge order (D11):** lane C merges LAST — rebased on main after lanes A,
D and B — and the baseline is re-taken (`--init`) at that point, so the
other lanes' new files are counted from the merged tree rather than
failing a gate they never saw.

Totals on the "before" tree (e6abccc, today's definitions): hex 2,669 ·
palette 683 · `text-[px]` 1,301 · inline style 1,457 · raw button 595 ·
raw field 113 · lucide 278 · motion 278, across 509 files.

---

## 4 · Convergence order

Michael's priority first, then the rest. Each screen: re-read its design
slice if one exists (PORT GATE §2), list the elements, build to the list,
before/after screenshots into the audit, metrics down, gate green.

| Phase | Screens |
|---|---|
| 3 — Workouts + data | `/health/workouts` (simplified per §0.1) → `/health/workouts/activities` → `/activities/[id]` → `/plan` → `/routines` → `/health/body` → `/body/metric` → `/health/progress` → `/health/activity` → `/health/report` → `/dashboard` |
| 4 — Settings + surfaces | `/settings` (five sections, ListRow, Switch, Disclosure, Appearance wired) → `/settings/notifications` (last 5 sent) → `/settings/claude` → `/export` → `/import` → Today polish → `/chat` + `/health/food` restyle (presentation only; the dock and confirm cards keep their shape) |
| 5 — Watch | `Theme.swift` type/colour pass; every screen against the floor; motion standard; both schemes build |
| 6 — Remaining | Spirit (phone) → Finance → Todos → Journal → Trends → `/oauth/authorize` → Desk, as far as the kit allows; `state.md`, followups, draft PR |

**Frames per phase:** each phase commits only the routes it changed — the
"after" frame in phone light and phone dark, desktop only where the layout
changes — next to the existing "before"; the before set is not retaken.

Settings is restructured into named section components
(`components/settings/*-section.tsx`) so lane B's Coach section and lane
D's RENPHO status card have an obvious home and the merge is additive.

---

## 5 · Decisions (recommended defaults — proceeding on them; his word can reverse any)

- **D1 · Brief vs. "more pop and animation".** Keep the brief's
  constraints (quiet, dense, one accent, ≤150 ms, no glow). Deliver "pop"
  through hierarchy — bigger hero numerals, brighter primary text, dimmer
  tertiary, the accent on one thing per screen — and "richness" through
  fast, purposeful motion and real empty/loading/saved states instead of
  more text. Longer or more animation would work against the "clutterry"
  complaint; it is the same problem in motion.
- **D2 · 220 ms for sheets and page pushes.** A sheet travelling the full
  screen height in 150 ms reads as a snap, not a slide; 220 ms keeps the
  design's curve and stays well under its 380 ms. Everything else is
  150 ms. Default: adopt 220 for those two cases only.
- **D3 · Motion overrides the design files' durations.** pitaya-app
  (380/300/450 ms), the chat round (240–340 ms), the Body spec (500 ms
  rise, 1.8–2.2 s draw-ons) and Round-3 watch (350–900 ms) all exceed the
  brief. Default: the brief's standard wins app-wide; the Body draw-ons are
  capped at 600 ms and play once; the watch's scripted moments keep their
  Round-3 timings because they are haptic-paired events, not UI state.
  Surfaced as a PORT-GATE deviation.
- **D4 · Two zone ramps.** The app design draws zones as a sequential pink
  ramp; Round-3 watch draws them cool→hot. Default: each platform keeps its
  own design's ramp; categorical charts on the web use the ramp in §1.3.
  If he wants one ramp everywhere, the watch's cool→hot is the stronger
  candidate and the web would adopt it.
- **D5 · Night mode is wired, not designed anew.** Settings → Appearance
  cycles **System (default) · Day · Night**; System follows the phone, so the
  PWA and the TestFlight shell match it. The class is set in `<head>` before
  first paint (no flash), and the iPhone shell's own ground follows the
  system. The palette is the Body round's — including its reference-band
  colour, kept as `--band` (`#E2E0E5` / `#38373E`) — and the Body screen's
  own switch now follows the app's. *As built:* the preference is a new `appearance` key,
  not the legacy `theme` field — his stored row says `theme: "dark"`
  because the code default was saved back by every settings write, never
  because he chose it; reading it would have turned his app dark on deploy.
- **D6 · Status colours** come from values already in the design file
  (warning `#D9A23E`, danger `#B4533F`) rather than Tailwind's amber/red.
- **D7 · Legacy surfaces are converged, not redesigned.** Trends,
  Finance, Todos, Recovery, Coach, Outcomes, Automations, Command Center,
  Water, Plan and Progress have no design slice. They get the tokens, the
  kit and the icon rule — presentation only — and stay listed as pending
  slices. Trends in particular: the design says it is absorbed into Body;
  default is to restyle it minimally and recommend retiring the route.
- **D8 · Workouts folds, it does not delete.** All data comes from the
  existing `GET /api/health/train` response — no API change:
  - **Records (six on the page):** `prWall` is every heaviest-ever, newest
    first. Show the records set this week (Mon–today), newest first; fill
    to six with the next most recent. When none moved this week, one line —
    "No new records this week" — above the six most recent. A `SectionAction`
    "All records" opens **`/health/workouts/records`**: the full `prWall`,
    with chips Recent · A–Z · Heaviest.
  - **Jump rope:** one row on the page (sessions and jump time this week,
    from `jumpRope.weeks`) opening **`/health/workouts/jump-rope`**: the
    8-week chart, the bests (`jumpRope.bests`), the per-protocol tables
    (`jumpRope.protocols`) and the explainer sentence — everything the
    page shows today, on its own screen.
  - **By movement:** five bars from `movementTonnage` + "more" (the rest
    inline, same card). **Trails:** one row. **Effort zones:** leave Train
    (the Sunday Report already carries the week's zones).
  - Neither new route has a design slice: built in the kit, listed as
    pending slices in `state.md` (PORT GATE §5). Nothing is removed from
    the data or the API.
- **D9 · Settings rows show one line.** Descriptions move behind a
  Disclosure; the AI/system status card is re-tokened (its teal is an
  old-identity remnant). The watch-feature rows' "ON"/"off" is a
  READ-ONLY connection status ported from pitaya-app.dc.html
  (`{paired ? "ON" : "off"}`) — it becomes a `Status` ("On"/"Off", success
  /neutral), never a Switch: a fake control is worse than the word.
- **D10 · Watch "pop" — a deviation from the Round-3 file.** Tertiary
  (`#96949B`) carries 13 lines on the Summary alone; meaning-bearing subs
  move one step up to secondary (`#A5A3AA`), hero numerals one scale step
  up, every sub-floor type call (listed in the audit) raised to the floor.
  The legibility CURVE is documented in CLAUDE.md; these colour and size
  lifts are not — they depart from `pitaya-watch-round3.dc.html` and are
  surfaced as a PORT-GATE deviation for his word.
- **D11 · The gate is a ratchet, not a wall — and lane C merges last.** It
  never blocks a lane that only edits logic; it blocks new debt per family.
  It runs as `npm run design-gate`, first in `npm run build` (the brief
  asks for a build-time gate), and in its own CI job (staged — see §3). The cross-lane
  collision is solved by merge ORDER, not by weakening the gate: lane C
  merges after A, D and B, rebased on main, with the baseline re-taken at
  that point.
- **D12 · One type scale — a deviation from the design files.** The app
  design types 10 / 10.5 / 11.5 / 12.5 / 13.5 px ~400 times, Body uses
  46/54 px numerals, Today a 44 px hero. The brief asks for one scale and
  his notes say things feel small, so the seven steps stand, with the
  floor. Old → new: 9 · 9.5 · 10 · 10.5 · 11 · 11.5 → 12 (11 only as a
  micro label/tick) · 12.5 → 12 or 13 · 13.5 → 13 · 14 · 14.5 · 15 → 15 ·
  16 · 17 → 15 or 19 · 18–22 → 19 · 24–26 → 26 · 30–54 → 44 (Body's 46 and
  54 shrink to 44; Today's 44 is verbatim).
- **D13 · Night primary `#D66A93`, not `#D0628C`.** The Body spec's dark
  raspberry is 4.15:1 on card-2 — below AA for accent text. One step lighter
  passes on every surface (surfaced deviation).
- **D14 · The design's faint grey stops carrying words.** `#96949B` is
  2.7:1 on the paper; the design uses it for micro-labels and sub-lines.
  Meaning-bearing text moves to `ink-2` (`#66646C`, 5.2:1) as each screen
  converges; `ink-3` remains for icons and placeholders (surfaced
  deviation).
- **D15 · Trends retirement is a recommendation only.** No route is
  deleted in this lane; the PR's Decisions carry it for his word.
- **D16 · Three shadcn glyphs stay lucide for now** (the select chevron,
  the sheet's close ✕, the toast status icons): the design file has no
  chevron, close or status glyph to extract, and re-drawing one is a PORT
  GATE miss of its own. Pending a design slice; counted by the gate.
- **D17 · Night ships only with every screen readable in it.** System is
  the default, so a phone in dark mode opens Night. Screens not yet
  converged still carry hardcoded light colours (S3: Today's voice-memo
  button and habit ticks, the "Open →" buttons; Phase 2 already fixed the
  Settings watch card). Phases 3–6 convert them; before the PR leaves
  draft, every route gets a Night pass, and any route still unreadable is
  either fixed or listed — if that list is not empty, the default falls
  back to Day until it is.

---

## 6 · Out of scope for this lane (filed in `docs/followups.md`)

Bugs that are not styling (the repeated "33:26" durations on September
freestyle rows, the manual workout description rendering as a paragraph in
the activity list, the map crash when WebGL is absent) and anything that
needs an API change go to followups, tagged for their owner.
