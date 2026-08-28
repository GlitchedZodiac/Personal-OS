# Apple Developer Program — post-enrollment setup

Written 2026-08-28, the day Michael enrolled ($99 Individual, the Apple ID
behind team HDR67SL3JG — michaelg458@gmail.com). This is the follow-through
plan for deferred-items #81: get Pitaya onto every device **over the air via
TestFlight** (no more MacBook cable, no more 7-day expiry — the iPad build
dies ~2026-08-30 without this), and unlock the capabilities the free personal
team blocked (APNs, App Groups).

Facts this plan is grounded in:

- `ios/project.yml` pins `DEVELOPMENT_TEAM: HDR67SL3JG` — the **free personal
  team**. `project.pbxproj` is generated; project.yml is the source of truth.
- Four targets: iOS app `net.blacksheepglobal.pitaya` (+ embedded
  `…pitaya.phonewidgets`) and a **standalone watch-only app**
  (`WKWatchOnly: true`) `…pitaya.watchkitapp` (+ embedded
  `…pitaya.watchkitapp.widgets`). The watch app is a sibling, NOT embedded in
  the iOS app — that means it is its own application to App Store Connect.
- Free-team workarounds currently in place: keychain sharing
  (`$(AppIdentifierPrefix)net.blacksheepglobal.pitaya.shared`) instead of App
  Groups; **no `aps-environment`** (the APNs provisioning incident). Server
  side, the push pipeline is already half-built and waiting: `PushDevice`
  model + `POST /api/mobile/push/register`; the companion wires the token
  flow and surfaces "needs Apple Developer Program" (deferred #183). What's
  missing: the entitlement (watch lane) and the APNs sender (main lane).
- Auth is single-user: one PIN (`AuthCredential` id `"default"`),
  `DeviceSession` per device but no user column anywhere in the 43 models.

---

## Phase 0 — confirm the membership is live and get the new Team ID

1. Wait for the "Welcome to the Apple Developer Program" email (activation is
   usually minutes-to-hours; occasionally a day).
2. Xcode → Settings → Accounts → select the Apple ID → you should now see
   **two teams**: "Michael Giraldo (Personal Team)" (HDR67SL3JG) and
   "Michael Giraldo" — the paid one. If only the personal team shows, press
   the refresh/Download Manual Profiles button or re-sign-in; if it still
   doesn't, the enrollment hasn't activated yet.
3. Get the paid **Team ID**: https://developer.apple.com/account →
   Membership details. It will almost certainly be a NEW id, not HDR67SL3JG.

## Phase 1 — switch the project to the paid team

One line in [`ios/project.yml`](../ios/project.yml) (currently line 19):

```yaml
DEVELOPMENT_TEAM: <new team id>   # was HDR67SL3JG (free personal team)
```

then `cd ios && xcodegen generate`. (This is `ios/**` — watch-lane territory;
either lane's session can be handed the new Team ID to make the edit, or
Michael changes the one line himself.)

While in there, add one Info property to the **PersonalOS** and
**PersonalOS Watch** targets' `info.properties` so every upload skips the
export-compliance questionnaire (the app only uses standard HTTPS):

```yaml
ITSAppUsesNonExemptEncryption: false
```

**Consequences of changing teams — expect these, they are not bugs:**

- iOS will **refuse to upgrade the installed dev builds in place** (same
  bundle ID, different signing team). Delete Pitaya from iPhone, iPad, and
  Watch first; the first paid-team install is a fresh install.
- The keychain access group is prefixed by the Team ID, so the stored bearer
  session is unreadable under the new team even aside from the reinstall →
  **re-pair each device with the PIN** once.
- Apple Health **data survives** (it lives in the Health store, not the app),
  but Health read/write permissions must be re-granted on first launch, and
  home-screen/Smart Stack **widgets must be re-added**.
- Server sessions: old `DeviceSession` rows just go stale; nothing to clean.

## Phase 2 — App Store Connect app records (one-time)

At https://appstoreconnect.apple.com (same Apple ID):

1. If prompted, accept the latest Apple Developer Program License Agreement
   (Business → Agreements). The free-apps agreement is all that's needed —
   no banking/tax forms unless the app is ever sold.
2. **Apps → ＋ → New App** for the iOS app: platform iOS, bundle ID
   `net.blacksheepglobal.pitaya` (pick from the dropdown — it appears after
   the App ID exists in the portal; the first Xcode build/archive on the paid
   team registers it automatically, or add it manually at developer.apple.com
   → Identifiers with the HealthKit capability), SKU anything (`pitaya-ios`),
   name must be unique on the App Store — if "Pitaya" is taken, any variant
   works; TestFlight testers see it, nobody else ever will.
3. The **watch app is a separate application** (standalone/`WKWatchOnly`), so
   it gets its **own app record**: platform watchOS, bundle ID
   `net.blacksheepglobal.pitaya.watchkitapp`, SKU `pitaya-watch`.
   - Possible wrinkle: `.watchkitapp` is the legacy *companion* suffix. If
     App Store Connect refuses to treat it as an independent app, rename the
     watch bundle to `net.blacksheepglobal.pitaya.watch` (and widgets to
     `…pitaya.watch.widgets`) in project.yml — cheap now, nothing has
     shipped; Health keeps historical workouts and the server has everything.
   - Alternative for later, not now: embed the watch app in the iOS app
     (companion architecture). One app record, one TestFlight row, and it
     unlocks WatchConnectivity / the Live-Activity mirror idea (deferred
     #119.2) — but it reverses a deliberate standalone decision, so it's a
     Michael call, not a setup step.

## Phase 3 — first TestFlight upload, then OTA forever

1. In Xcode: scheme **PersonalOS**, destination "Any iOS Device (arm64)" →
   Product → **Archive** → Organizer → **Distribute App → TestFlight & App
   Store → Upload**. Automatic signing creates the Apple Distribution
   certificate and profiles on first run. Repeat with the **PersonalOS
   Watch** scheme for the watch record.
2. Processing takes ~5–30 min (email arrives). First build of a version may
   ask the export-compliance question unless the Info key from Phase 1 is in.
3. In the app's TestFlight tab: **Internal Testing → ＋ group** ("Me"), add
   yourself (Account Holder) as tester, leave automatic distribution on.
   Internal testing needs **no review of any kind** — builds are installable
   the moment processing finishes.
4. On iPhone/iPad: install the **TestFlight** app, sign in, install Pitaya.
   The watch app installs from TestFlight on the paired iPhone (it lists
   watch-only apps and pushes them to the watch).
5. **From now on, shipping an update =** bump `CURRENT_PROJECT_VERSION` in
   project.yml (must strictly increase per upload; `MARKETING_VERSION` only
   when it feels like a release) → `xcodegen generate` → Archive → Upload.
   TestFlight notifies every device and auto-updates. No cable, ever.
6. Two rhythms to know: TestFlight builds **expire after 90 days** (upload at
   least quarterly — TestFlight nags before expiry), and internal testing
   caps at 100 testers on the account (irrelevant here).
7. Optional later: **Xcode Cloud** (25 free compute-hours/month with the
   membership) can archive + upload to TestFlight on every push to a branch,
   removing the MacBook from the build step too. Not needed to get going.

## Phase 4 — what the membership newly unlocks (queued work, not setup)

- **APNs → real reminders on the phone** (the reason `PushDevice` exists).
  - Watch lane: add `aps-environment` to the iOS app's entitlements in
    project.yml (deferred #81/#183 anticipated exactly this) — the companion's
    registration flow then stops reporting "needs Apple Developer Program".
  - Michael, one-time: developer.apple.com → Certificates, Identifiers &
    Profiles → **Keys → ＋ → Apple Push Notifications service** → download
    the `.p8` **(single download — file it somewhere safe)**, note Key ID +
    Team ID.
  - Main lane: an APNs HTTP/2 sender (Node `http2` to `api.push.apple.com`,
    JWT from the .p8) + `APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` env
    vars in Vercel. Distinct from the existing **web push** (VAPID,
    `lib/push.ts`) — that one serves the PWA and stays as-is.
- **App Groups** — allowed on paid teams; would let the watch Smart Stack
  live tile idea (deferred #119.1) be revisited. Keychain sharing keeps
  working; nothing must migrate.
- Year-long dev installs — cable installs now last a year instead of 7 days,
  but TestFlight makes them mostly irrelevant.

## Phase 5 — letting another person use the app

Two independent layers; the second is the real one.

**Getting the app onto their phone (easy):**

- *Internal tester* — App Store Connect → Users and Access → invite their
  Apple ID (App Manager or Developer role is fine), then add them to the
  internal group. No review, instant builds. If an Individual-membership
  account won't offer the invite, fall back to:
- *External tester* — TestFlight → External Testing → invite by email or
  public link (up to 10,000). The **first external build needs Beta App
  Review** (usually ~a day) — and the reviewer will hit the PIN lock, so the
  review notes must include a working PIN. That means: set a throwaway PIN,
  submit, change it back — or prefer the internal route.
- *Unlisted App Store distribution* exists as a later option (real App
  Review, link-only listing) if TestFlight's 90-day treadmill ever grates.

**Their own profile (the hard truth):** Personal OS is architecturally
single-user. One PIN row, no `User` model, no `userId` on any of the 43
models, and the AI prompts speak to Michael by name. Handing someone the
current build + PIN doesn't give them a profile — it gives them **Michael's
entire account** (health, finance, journal), and worse, their Apple Health
sync would upsert into the same `DailyHealthSnapshot` rows
(`@@unique([localDate, timeZone, source])`) — the two phones would silently
overwrite each other's steps/sleep/weight. Do not share the PIN as a
shortcut.

Real options, in order of sanity:

1. **A deployment per person (recommended).** Their own Vercel project +
   Supabase DB + PIN — "Personal OS" stays literally personal. One genuine
   code change makes the same TestFlight build serve everyone:
   `MobileAPIClient.productionBaseURL`
   ([MobileAPIClient.swift:28](../ios/Shared/Networking/MobileAPIClient.swift))
   is hardcoded — the pairing screen needs a server-URL field (default =
   Michael's). Small, clean watch-lane item; the web PWA needs nothing (each
   deployment IS the URL). File it only when a real second user exists.
2. **True multi-tenancy** — `User` model + `userId` threaded through every
   model, query, uniqueness constraint, and AI context, plus per-user
   integrations (Strava/Gmail OAuth, OpenAI billing). That's turning Pitaya
   into a product — weeks of work and a different privacy posture (health
   data). Only worth discussing if that's ever the actual ambition.

---

## Michael's checklist (do these in order, ~30 min of clicking + waits)

1. Welcome email arrived → Xcode → Settings → Accounts shows a second
   "Michael Giraldo" team without "(Personal Team)".
2. developer.apple.com → Membership → copy the new Team ID → hand it to a
   Claude session (or edit `ios/project.yml` line 19 yourself) →
   `cd ios && xcodegen generate`.
3. Delete Pitaya from iPhone, iPad, and Watch (team change = fresh install).
4. appstoreconnect.apple.com → accept agreement → New App for iOS
   (`net.blacksheepglobal.pitaya`) and watchOS (`…watchkitapp`).
5. Xcode: Archive + Upload both schemes → TestFlight → internal group with
   yourself → install TestFlight on iPhone/iPad → install Pitaya everywhere,
   re-enter PIN, re-grant Health, re-add widgets.
6. Confirm the iPad build no longer has a death date (deferred #55 closes).
7. When you want reminders: create the APNs key (.p8) and say the word —
   the entitlement + sender are queued work (deferred #81/#183).
