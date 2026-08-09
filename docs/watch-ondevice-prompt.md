# Watch Lane — Catch-Up + On-Device Prompt (2026-08-09)

(Michael: paste everything below the line into the watch chat.)

---

Catch-up for the Pitaya watch lane. Several things changed since your last
session — read first, then the mission.

## 1. Your home moved (do this first)

The shared-checkout collision you flagged is resolved. **Your directory is
now `~/VibeCoding/personal-os-watch`** — a git worktree on
`claude/watch-app`, aligned with the main lane at the superset tip (all your
work + all Stage A/parity work is there). Open your session in THAT folder
from now on. Never switch branches in `~/VibeCoding/Mikes Personal OS` —
that's the main lane's checkout. CLAUDE.md § Parallel lanes has the rule.

## 2. Read these, in order

1. `docs/state.md` — entries 2026-08-09d/e/f (Pitaya Stage A, parity fixes,
   the worktree split).
2. `docs/watch-contract.md` — NEW: the ownership map that ends lane
   confusion, dispositions for all five of your deferred items, and the
   sequences + pairing-code contracts.
3. `CLAUDE.md` — two new sections bind you: **THE PORT GATE** (designs are
   extracted verbatim, never interpreted — your SF-Symbol dumbbell
   substitution is now a defect class) and the updated **Parallel lanes**.

## 3. News you can use immediately

- **Both your backend asks shipped and are live on prod**:
  `POST /api/mobile/workouts/sync` now runs server-side PR detection and
  returns `prs: [{externalId, newPRs}]` per item, and `GET /api/mobile/prs`
  (bearer auth) returns the same payload as `/api/health/prs`. Adopt both:
  celebrate from the sync response, pull baselines from the endpoint, and
  delete the top-100 rebuild fallback in `ios/Shared/PRBaselines.swift`.
- **Sequences: WAIT.** The contract is defined (watch-contract.md § v1) and
  the main lane implements the model + API + iPhone builder in its Train
  stage, which is starting now. Build the wrist routines UI only after
  `GET /api/mobile/sequences` exists. Rest timer + sleep surfaces also wait.
- **Pairing-code stays deferred** — your PIN-on-wrist flow stands.
- **PORT GATE tasks for you**: bundle Familjen Grotesk + Instrument Sans
  into the watch asset catalog, and extract the kettlebell glyph from the
  design (`components/pitaya-icons.tsx` has the exact path data) to replace
  the dumbbell.fill substitution.

## 4. Mission: get Pitaya onto Michael's actual wrist

The simulator loop is proven; the next milestone is a **real-device stress
test**. Michael will be present (required — signing and trust prompts are
his). Work the checklist, halting on anything that needs his input:

1. **Signing**: Xcode → Settings → Accounts → add Michael's Apple ID.
   Free personal team works for the first install (7-day expiry, HealthKit
   allowed); the $99/yr Developer Program upgrade makes installs last ~1
   year — Michael decides when. Set the team on both targets; keep bundle
   ids stable once chosen (changing them later orphans HealthKit data
   associations).
2. **Devices**: iPhone + watch paired, both with Developer Mode enabled
   (iPhone: Settings → Privacy & Security → Developer Mode; watch:
   Settings → Privacy & Security → Developer Mode, reboots required), Mac
   trusted, devices registered when Xcode prompts.
3. **Build to the phone, then the watch app installs via the paired phone.**
   First run: walk Michael through the HealthKit permission prompts (heart
   rate, workouts, energy) on both devices.
4. **Real-hardware validation** (things the simulator faked): live HR
   during an actual short workout, crown weight dial feel, PR haptic on a
   real set, water-lock behavior mid-workout, background session survival
   (wrist down, screen off), offline queue across a real connectivity drop
   (airplane mode on, log sets, airplane mode off → sync → verify rows +
   `prs[]` land on prod), battery drain over a ~30-min session.
5. **File everything**: device-only bugs as `[watch]` state/deferred
   entries; backend gaps to `docs/deferred-items.md` for the main lane.
6. End with the standard completion report + a 3-item checklist for
   Michael's own first solo workout with it.

Main-lane heads-up while you work: Train + Today-full are being built now —
sequences API and the live-workout-mirroring contract will be announced in
`docs/state.md` as they land. Read state at every session start.
