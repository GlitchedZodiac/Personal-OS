## Apple Companion Scaffold

This folder is the Apple-first native scaffold for `Personal-OS`.

It is intentionally source-only from Windows:
- shared API models and client code live here now
- HealthKit and watch workout managers live here now
- the Xcode project still needs to be created on the Mac and pointed at these files

## Folder layout

- `Shared/Models`
  - mobile auth/session payloads
  - workout sync payloads
  - Apple Health daily snapshot payloads
- `Shared/Networking`
  - backend client for `/api/mobile/*`
- `Shared/Storage`
  - device session persistence
  - offline workout queue persistence
- `iPhone`
  - Apple Health import helpers
- `watchOS`
  - live workout capture manager

## Backend contracts already implemented

- `POST /api/mobile/auth/session`
- `POST /api/mobile/auth/refresh`
- `GET /api/mobile/workouts`
- `POST /api/mobile/workouts/sync`
- `POST /api/mobile/health/daily`

## Mac phase next steps

1. Create an Xcode workspace with:
   - iOS app target
   - watchOS app target
   - shared Swift group pointing at `ios/Shared`
2. Add HealthKit and Background Modes entitlements.
3. Add WatchConnectivity support for queue handoff.
4. Replace the temporary `UserDefaults` token storage with Keychain-backed storage.
5. Bind these source files into the targets and resolve any target-specific imports.

## Design note

The web app now uses the graphite/teal/amber visual system. The native app should mirror that palette and the same metric hierarchy rather than reverting to default Apple blue.
