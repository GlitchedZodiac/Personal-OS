# Pitaya — Design Tokens & IA (extracted from Pitaya App.dc.html, 2026-08-09)

Source of truth: `docs/design/pitaya-app.dc.html` (+ `pitaya-watch.dc.html`
for the watch lane). This file is the load-bearing summary both lanes build
from. Brand: **PITAYA** · tagline *"It's just you. Prove it."* · mark = 45°-
rotated square (diamond) in raspberry.

## Color

| Token | Hex | Use |
|---|---|---|
| bg | `#F2F1F2` | App background (light-first) |
| bg-raised | `#FAF9FA` | Subtle raised zones |
| card | `#FFFFFF` | Cards |
| ink | `#232227` | Primary text (warm near-black) |
| ink-secondary | `#66646C` | Secondary text |
| ink-muted | `#96949B` | Muted text / icons |
| hairline | `#E4E2E6` | Borders (also `#D9D7DC`) |
| primary | `#A63D63` | Pitaya raspberry — actions, active tab, mark |
| primary-deep | `#8C2F51` | Pressed / emphasis |
| accent-bright | `#DC74A0` | Links, highlights, live states |
| accent-soft | `#DCA8BE` | Soft accents |
| tint | `#F6E3EB` | Pink tint fills (chips, active backgrounds) |
| tint-2 | `#F0E8EC` | Secondary tint |
| success | `#5E9B72` | Positive / done |
| dark-ink | `#454349` | Dark UI elements on light |
| canvas-dark | `#232226` / `#131216` | Dark contexts (watch, appearance=night) |

## Type

- Display: **Familjen Grotesk** 500–700 (titles, big numbers, wordmark)
- Body/UI: **Instrument Sans** 400–600
- Micro-labels: 11–12px, uppercase, letter-spacing ~0.14–0.2em, 600

## Shape & depth

- Pills everywhere interactive (border-radius 99px): buttons, chips, inputs
- Cards 12–18px radius, white on `#F2F1F2`, hairline borders, minimal shadow
- Diamond (rotated square) as brand bullet/mark

## IA (5 tabs, Today center)

`Body | Food | Today | Train | Settings`

- **Today** — date header ("Week 32 · Sunday"), weight quick-log, habit
  checks (Creatine · Mobility · 10k steps · Journal), voice memo, weekly PDF
  teaser, **"THE NOTEBOOK THAT TALKS BACK"** → Chat surface (confirm/reject
  cards: "Reject → Discarded. Nothing saved.")
- **Food** — day timeline, MY USUALS (chicken bowl, salmon plate, double
  shake, PB toast), SUPPLEMENTS (creatine, omega-3, vitamin D), meal photo
- **Train** — Routines (KB Block A/B, EMOM 20), exercise rows with weight
  badges (W25/W32 = PR-ish), "Yesterday's you lifted less.", TRAILS (GPS:
  live recording, GPS LOCKED, elapsed/gain), live workout (watch mirroring)
- **Body** — Weight/Volume/Calories charts (MAY→AUG), tap-a-point body map,
  PROGRESS PHOTOS, RECOVERY (HRV, resting HR, sleep asleep/awake stages)
- **Settings** — WATCH (HRV + recovery, sleep stages, live workout
  mirroring), DATA (CSV import, weekly PDF report/export), APP (PIN lock,
  Units, Appearance Day/Night, Daily prompt)

## Explicitly stripped (hide, never delete data)

Finances, Todos, AI coach/insight/projection surfaces, old dashboard,
trends module (absorbed into Body), graphite/teal identity.

---

# The standard (lane C, 2026-10) — what the code enforces

Everything above is the 2026-08-09 extraction. This section is the system
built from it: where the design is explicit, the value is the design's;
where it is silent, the value is a **standard** defined here. The code is
`app/globals.css` (blocks 1–6); the watch mirror is `ios/Shared/Theme.swift`;
`scripts/design-gate.mjs` stops raw values creeping back in; the kit is
`components/ui/*`, every piece shown at `/settings/design`.

## Text roles and the contrast rule

**Every text role meets WCAG AA (4.5:1) on every surface it sits on —
bg, card, card-2 — in Day and in Night.** WCAG allows 3:1 for text of
18 px and up (14 px bold); the standard does not use that allowance — no
role is "large-only" — so a muted label is readable at any size.
**Graphics** (chart series, the focus ring) reach 3:1 against the card.
`tests/design-tokens.test.ts` proves all of it against the token file, so
a token change that breaks it fails the suite. The web's "faded" look was
`#96949B` section labels at 10.5–11 px: 2.66:1 on the page.

| Role | Day | Night | Use |
|---|---|---|---|
| `ink` | `#232227` | `#F2F1F2` | primary text |
| `ink-2` | `#66646C` | `#B9B7BE` | secondary / muted text — the only "muted" text role |
| `ink-3` | `#96949B` | `#85838B` | **not text**: icons, placeholders, disabled, decoration (2.7:1 in Day) |
| `ink-4` | `#B4B2B8` | `#5F5D65` | **not text**: ghost marks |
| `primary` | `#A63D63` | `#D66A93` | accent text, links, the one accent fill |
| `primary-deep` | `#8C2F51` | `#E795B4` | pressed / emphasis |
| `success-ink` | `#3E7A54` | `#7FB893` | "moved the good way" text |
| `warning-ink` | `#8F6516` | `#E0B45A` | caution text |
| `danger-ink` | `#9E4532` | `#D07A68` | errors only — never a verdict on a body number |

Fills that are not text keep the design's values: `success #5E9B72`,
`warning #D9A23E`, `danger #B4533F`, `slate #5E7FA6`. The design's
`#96949B` micro-labels and sub-lines move to `ink-2` as each screen
converges (a surfaced deviation: 2.7:1 is below AA). Night's primary is
the Body spec's `#D0628C` lifted one step to `#D66A93` (4.15:1 on card-2
failed AA — surfaced deviation). On a primary fill, labels are white in
Day and `#131217` in Night (white on the Night primary is ~3.4:1).

## Type — eight steps, one floor

**Floor: nothing meaning-bearing below 12 px on a phone.** 11 px exists only
as the micro label (uppercase, 0.14em, 600) and for chart axis ticks.
Numbers are Familjen + `tabular-nums`; Literata stays for Scripture. This
is a surfaced deviation (look-plan D12): the design's 10–13.5 px half-steps
and Body's 46/54 px numerals map onto these steps.

| Token (Tailwind) | px / line | Face |
|---|---|---|
| `text-hero` | 44 / 48 | Familjen 700 — the one number on a screen (Today's designed hero) |
| `text-display` | 26 / 30 | Familjen 700 — page titles |
| `text-title` | 19 / 24 | Familjen 600–700 — card titles, tile values |
| `text-body` | 15 / 22 | Instrument 400–500 — prose, list titles |
| `text-ui` | 13 / 18 | Instrument 500–600 — buttons, chips, rows |
| `text-caption` | 12 / 16 | Instrument 400–500 — secondary lines; **the floor** |
| `text-micro` / `.micro-label` | 11 / 14 | Instrument 600, uppercase, 0.14em — kickers and axis ticks only |

## Status, charts, surfaces

- Deltas: green (`success-ink`) only when the number moved the good way;
  otherwise `ink-2`. Never red, never "HIGH" (the Body rule, app-wide;
  `lib/delta.ts`).
- Chart categorical: `chart-1…5` = primary, dark-ink (ink-2 in Night),
  slate, success, rose dust `#B07A92` (Night `#C08AA2`; accent-soft was
  2.0:1 on the card). Sequential: `chart-seq-1…5` = tint → accent-soft
  → accent-bright → primary → primary-deep (Night: `#3A2331 #5E3047 #8C4466
  #D0628C #F0B3CB`); its faint end is meant to recede.
- `band` `#E2E0E5` / `#38373E` — reference bands behind a value (the Body
  round's band, kept). `focus-ring` `#A63D63` / `#E795B4` — solid, ≥3:1 on
  every surface; the kit's focus is a 2 px ring in it. Grid hairlines `rule` at 1 px; reference lines `ink-3`
  dashed; one tooltip (ink on paper, inverted in Night). An empty chart
  keeps its frame, its grid and one sentence.
- Surfaces: `bg #F2F1F2 / #131217`, `card #FFFFFF / #1E1D23`,
  `card-2 #F6F5F7 / #27262C`, rules `#EDEBEE #E4E2E6 / #2B2A30 #37363C`
  — Night is the Body round's palette made app-wide.

## Space, radius, elevation

- 4-px base. Gutter 16 · card padding 20 (compact 16) · stack 12 · section
  24 · `pb-dock` 176 keeps a page's end above the dock.
- Radius: pill 999 (everything interactive) · card 16 · card-lg 22 (Body)
  · control 12 · sheet 24.
- Elevation: a 1-px `rule-2` hairline plus `0 1px 2px` for cards; `0 12px
  40px` for the dock and sheets; nothing else. No gradients, no glow.

## Motion

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 90 ms ease-out | press, colour swap |
| `--motion-fast` | 150 ms | every state change, entrances, a number that changed, skeleton → content |
| `--motion-base` | 220 ms | sheets, drawers, page push — the only UI motion over 150 ms |
| `--motion-exit` | 150 ms ease-in | anything leaving |
| `--ease-out` | `cubic-bezier(.3,.9,.3,1)` | the design's sheetUp/pushIn curve |
| `--ease-in` | `cubic-bezier(.5,0,.8,.4)` | exits |
| stagger | 30 ms × at most 6 | list entrances |

Tailwind's default `transition` duration and curve are set to 150 ms and
`--ease-out`. Loops only where they carry meaning (listening, thinking,
syncing). `prefers-reduced-motion` renders the end state. The design files'
longer durations (380 ms sheets, 500 ms rises, 1.8–2.2 s draw-ons) are
overridden — a surfaced deviation (look-plan D3). The design gate holds
the code to 90 · 150 · 220 ms. Watch: `Theme.Motion`
`instant · fast · base · leave` for UI state; the Round-3 rungs stay for
the moments that design scripted.

## Appearance

Settings → Appearance: **System** (default, follows the phone) · Day ·
Night — the `appearance` setting (`lib/appearance.ts`). The class is set
in `<head>` before first paint, so the PWA and the TestFlight shell never
flash the wrong theme; the iPhone shell's own ground follows the system
too. The legacy `theme` field is never read (it defaulted to "dark" and
was saved back, so it was never a choice).
