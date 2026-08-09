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
