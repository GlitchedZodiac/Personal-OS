# Pitaya → Michael's wrist: device install runbook

Everything up to the physical install is done (both targets build green,
core loop + server-truth PRs proven in simulator against prod). The steps
below need Michael at the Mac with his iPhone + Apple Watch — signing,
Developer Mode, and trust prompts are inherently his. Claude drives, Michael
taps. Expected time: 20–30 min first run.

## 0. Facts locked in advance

- Bundle ids (STABLE — never change; HealthKit associations key off them):
  `net.blacksheepglobal.pitaya` (iOS) · `net.blacksheepglobal.pitaya.watchkitapp` (watch)
- The watch app is **standalone** (`WKWatchOnly`) — Xcode installs it
  directly to the watch (the paired iPhone is the conduit; the iOS
  placeholder app does not need to be installed).
- Free personal team is enough for the first install: **7-day cert expiry**
  (reinstall weekly until the $99/yr Developer Program — Michael's call),
  HealthKit IS allowed on free teams.
- Xcode runs through `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  (xcode-select still points at CommandLineTools; harmless).

## 1. Signing (Michael at the Mac)

1. Open Xcode → Settings → Accounts → "+" → sign in with his Apple ID.
2. Note the personal team name it creates ("Michael Giraldo (Personal Team)").
3. Find the team id: Settings → Accounts → select team → the 10-char id,
   or `security find-identity -v -p codesigning` after the first cert lands.
4. Put it in `ios/project.yml` under `settings.base.DEVELOPMENT_TEAM`
   (replacing the empty default), then `cd ios && xcodegen generate`.
   The team lives in project.yml — NOT hand-edited in the pbxproj — so
   regeneration never loses it.

## 2. Devices (Michael on the devices)

1. iPhone: Settings → Privacy & Security → Developer Mode → on → reboot.
2. Watch: Settings → Privacy & Security → Developer Mode → on → reboot.
3. Plug the iPhone into the Mac (first time: "Trust This Computer" on the
   phone). Watch stays on the wrist, near the phone, both unlocked.
4. Xcode → Window → Devices and Simulators: wait until BOTH the iPhone and
   the watch show up (watch appears nested under the phone). First build
   will offer to register the devices — accept.

## 3. Install

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd ~/VibeCoding/personal-os-watch/ios
xcodebuild -project PersonalOS.xcodeproj -scheme "PersonalOS Watch" \
  -destination "platform=watchOS,name=<Michael's Apple Watch name>" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

(or in the Xcode GUI: scheme "PersonalOS Watch" → destination his watch →
Run — the GUI surfaces the trust/keychain prompts more gracefully; first
install may need watch Settings → General → Device Management → trust the
developer certificate.)

## 4. First run on the wrist

1. Open Pitaya on the watch → Welcome → Pair → **Michael types his PIN**.
2. Paired card should show his real workout count + PR exercise count.
3. HealthKit sheets appear on FIRST workout start (write: workouts; read:
   heart rate, active energy, distance) — "All Requested Data Below" → Allow
   on both the write and read pages.

## 5. Real-hardware validation checklist (the things the sim faked)

| # | Check | Pass looks like |
|---|---|---|
| 1 | Live HR | Start Kettlebell, metrics page shows real BPM within ~15s, zone bar tracks it |
| 2 | Crown dial | Weight changes in 2 kg detents with haptic ticks, no lag |
| 3 | Set log + PR haptic | Log a set above a known best → success haptic + PR flash; below → plain click |
| 4 | Water lock | Controls → Lock → screen locks; crown-press unlock ejects per watchOS norm, session keeps running |
| 5 | Background survival | Wrist down 2 min mid-session, raise → elapsed correct, HR still streaming |
| 6 | Offline queue | Airplane mode ON → finish a session → summary says "offline · queued" → airplane OFF → reopen app → row + `prs[]` land on prod (check the web app's Train/History) |
| 7 | Battery | Note % before/after a ~30 min session; expect single-digit drain |
| 8 | Summary → web | The workout appears in Pitaya web with sets/HR/kcal |

File failures as `[watch]` items in docs/state.md + deferred-items; backend
gaps go to deferred-items for the main lane.

## 6. Known device-vs-sim differences to watch for

- HK permission sheets on a real watch can also mirror to the iPhone's
  Health app; if the watch sheet doesn't appear, check iPhone → Health →
  Sharing → Apps.
- Free-team builds die after 7 days: relaunching after expiry shows a
  "no longer available" alert — reinstall from Xcode, data (Keychain +
  queue) survives.
- If prod is unreachable on watch-only cellular-less moments, everything
  queues — that's the designed path, not a bug.
