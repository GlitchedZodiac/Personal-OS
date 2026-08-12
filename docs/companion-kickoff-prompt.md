# iOS Companion kickoff prompt (paste into the WATCH-LANE chat)

Michael approved the thin iOS companion as the NOW thing (2026-08-11,
main-lane chat). Paste everything below the line into the watch-lane
session when ready. Prerequisites on the Mac: same as the watch installs
(Xcode signed in, team HDR67SL3JG, device present for install).

---

iOS Companion directive from Michael via main lane — read first:
docs/state.md (2026-08-11 entries), docs/watch-contract.md, and this
file's contract section. The companion is a THIN native wrapper around
the deployed web app plus the three things a PWA cannot do. No redesign,
no new product surface — Pitaya's web UI IS the UI.

Scope, in priority order:

1. **WKWebView shell** pointed at https://personal-os-plum.vercel.app
   with the PIN flow intact: durable cookies (WKWebsiteDataStore
   default persistence), safe-area handling, pull-to-refresh disabled
   (the app owns its scroll), external links out to Safari. Keep the
   bundle id/team consistent with the watch project so both live in one
   workspace.

2. **Durable mic + camera permission** — grant once natively
   (NSMicrophoneUsageDescription + NSCameraUsageDescription), and the
   WKWebView must auto-grant getUserMedia to OUR origin only (iOS 15+:
   WKPermissionDecision.grant in the delegate for
   personal-os-plum.vercel.app) — this kills the every-launch mic
   prompt, Michael's standing complaint.

3. **HealthKit → Pitaya sync** (the real payoff; his scale already
   writes weight to Apple Health):
   - Read: bodyMass, sleepAnalysis, heartRateVariabilitySDNN,
     restingHeartRate, stepCount, activeEnergyBurned.
   - Background delivery (HKObserverQuery + background modes) posting to
     the existing bearer endpoint `POST /api/mobile/health/daily`
     (contract: docs/watch-contract.md; token = same device-session
     bearer the watch uses — reuse the pairing/PIN flow from the watch
     app's Shared/ code).
   - v1 field mapping: steps→steps, restingHeartRate→restingHeartRateBpm,
     activeEnergy→activeEnergyKcal, distance→walkingRunningDistanceMeters;
     put sleep minutes + HRV ms + weightKg inside `rawData` until the
     main lane ships dedicated fields — ANNOUNCE when you start and the
     main lane ships `sleepMinutes`, `hrvMs`, `weightKg` columns +
     scale-weight dedup (vesync near-twin logic) the same session.
   - Weight rule: HealthKit bodyMass entries dedupe against VeSync
     imports server-side — send them all, the server decides.

4. **Push notifications** — APNs registration + a device-token POST
   (main lane will ship `/api/mobile/push/register` + the reminder
   sender when you announce the token flow works; Michael's reminders
   already exist server-side). NO proactive AI content — Michael
   explicitly rejected AI-initiated messages (2026-08-11): pushes are
   for HIS reminders only.

Out of scope: any new screens beyond a minimal native Settings page
(HealthKit toggles + sync status), widgets, Siri, iPad. The watch app
keeps its own lane rules — this is a sibling target in ios/**, same
worktree, never touching app/** or lib/**.

Cross-lane asks back to main via docs/deferred-items.md as usual.
