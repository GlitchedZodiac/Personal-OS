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
   App · System), one line per setting, real switches, and the explanatory
   sentences tucked behind a tap instead of printed under every row.
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
shared tokens underneath, not a new look.

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
| `--primary` `#D0628C` · `--primary-deep` `#E795B4` · `--tint` `#3A2331` · `--edge` `#4C2C3E` |
| `--success` `#7FB893` · `--slate` `#86A3C8` · `--warning` `#E0B45A` · `--danger` `#D07A68` (*standard* — lifted one step like success) |

Rule: a component never reaches for a hex; it reaches for a role. That is
what makes the dark override complete by construction (today the "Open →"
button goes dark-on-dark because it hardcodes `#8C2F51`).

### 1.3 Chart ramp — *standard*

Sequential (one series over intensity, e.g. zone bars on the web):
`--tint` → `--accent-soft` → `--accent-bright` → `--primary` → `--primary-deep`.
Categorical (up to five series): `--primary`, `--dark-ink`, `--slate`,
`--success`, `--accent-soft` — one accent family, two neutrals, one green.
Grid: hairlines in `--rule` at 1 px. Reference lines: `--ink-3` dashed
3 · 4. Tooltip: `--ink` on `--card` (inverted in dark), 11.5 px / 600,
radius 8 — the Body spec's. Empty chart: the frame, the axis labels and
one sentence; never an empty box.

The watch keeps the Round-3 zone ramp (`#7FA6C9 … #FFD9E8`) because that
design file is explicit — see Decisions, D4.

### 1.4 Type scale — *standard* (derived from the design's sizes)

Today the app uses thirty-two arbitrary `text-[Npx]` sizes (9 · 9.5 · 10 ·
10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 … 96) plus Tailwind's `text-xs/sm`.
The standard is eight steps:

| Token | px / lh | Face | Use |
|---|---|---|---|
| `--text-hero` | 40 / 44 | Familjen 700, tabular | the one number on a screen (today's kcal, weight) |
| `--text-display` | 26 / 30 | Familjen 700 | page titles, report headline |
| `--text-title` | 19 / 24 | Familjen 600–700 | card titles, tile values |
| `--text-body` | 15 / 22 | Instrument 400–500 | prose, list titles |
| `--text-ui` | 13 / 18 | Instrument 500–600 | buttons, chips, list rows, table cells |
| `--text-caption` | 12 / 16 | Instrument 400–500 | secondary lines, deltas, dates |
| `--text-micro` | 11 / 14 | Instrument 600, 0.14em, uppercase | kickers / section headers (`.micro-label`) |
| `--text-nano` | 10 / 12 | Instrument 500, tabular | chart ticks and axis labels ONLY |

Rules: nothing that carries meaning is set below 11 px; 10 px is for
chart ticks; numbers are always Familjen + `tabular-nums`; serif
(Literata) stays reserved for Scripture. Mapping of today's sizes: 9/9.5 →
10 (ticks) or 11; 10/10.5 → 11; 11.5/12.5 → 12; 13.5 → 13; 14/14.5/15 → 15;
17 → 19; 19–22 → 19; 24–26 → 26; 30–44 → 40.

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
| `--motion-fast` | 150 ms | every state change: chips, toggles, list-item entrance, metric number change, skeleton → content, confirm tick |
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
| `Switch` | "ON" text standing in for toggles | new (radix) — Settings, Notifications |
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

Counts per file (the metrics in `scripts/design-metrics.mjs`): raw hex,
`text-[Npx]`, inline `style={{ color | fontSize | background … }}`, raw
`<button>`/`<input>`/`<select>`/`<textarea>` outside `components/ui`,
lucide imports, non-standard `duration-*` / `transition-all`. A committed
baseline (`scripts/design-gate.baseline.json`) holds today's numbers. The
gate FAILS when any file's count rises or a new file has any; it passes
when counts fall and rewrites nothing — lowering the baseline is a
deliberate `--update` run that is reviewed in the diff. Wired into
`npm run build` (before `next build`) and into
`.github/workflows/design-gate.yml` on every pull request. Tests cover:
a rise fails, a fall passes, a new file with debt fails, a new clean file
passes, the kit directory is exempt from the raw-element rule.

Today's totals (the baseline the ratchet starts from): hex 2,581 ·
`text-[px]` 1,301 · inline style 1,457 · raw button 595 · raw field 113 ·
lucide 278 · motion 89 across 170 files.

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
  (Day · Night · System) toggles `.dark` on `<html>` through the existing
  `theme` setting; the dark palette is the Body round's. The Body screen's
  own system-following switch folds into the app-wide one.
- **D6 · Status colours** come from values already in the design file
  (warning `#D9A23E`, danger `#B4533F`) rather than Tailwind's amber/red.
- **D7 · Legacy surfaces are converged, not redesigned.** Trends,
  Finance, Todos, Recovery, Coach, Outcomes, Automations, Command Center,
  Water, Plan and Progress have no design slice. They get the tokens, the
  kit and the icon rule — presentation only — and stay listed as pending
  slices. Trends in particular: the design says it is absorbed into Body;
  default is to restyle it minimally and recommend retiring the route.
- **D8 · Workouts folds, it does not delete.** PR wall → six + "All
  records" sheet; jump rope → one row + its own page; by-movement → five +
  "more"; trails → one row; effort zones → stays in the Sunday Report and
  leaves the Train page. Nothing is removed from the data or the API.
- **D9 · Settings rows show one line.** Descriptions move behind a
  Disclosure; the watch-feature rows become real switches; the AI/system
  status card is re-tokened (its teal is an old-identity remnant).
- **D10 · Watch "pop".** Tertiary (`#96949B`) is used for 13 lines on the
  Summary alone; meaning-bearing subs move one step up to secondary
  (`#A5A3AA`), hero numerals one scale step up, every sub-floor type call
  (listed in the audit) raised to the floor. The Round-3 design's faint
  labels are a documented deviation, like the legibility curve itself.
- **D11 · The gate is a ratchet, not a wall.** It never blocks a lane that
  only edits logic; it blocks new debt. Lowering the baseline is explicit.

---

## 6 · Out of scope for this lane (filed in `docs/followups.md`)

Bugs that are not styling (the repeated "33:26" durations on September
freestyle rows, the manual workout description rendering as a paragraph in
the activity list, the map crash when WebGL is absent) and anything that
needs an API change go to followups, tagged for their owner.
