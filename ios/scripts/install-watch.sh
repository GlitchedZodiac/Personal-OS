#!/bin/bash
# Build the watch app from origin/main and install it on the paired Apple
# Watch. Run it with the watch ON YOUR WRIST AND UNLOCKED — a locked or
# charging watch answers "the device rejected the connection request".
#
#   ios/scripts/install-watch.sh
#
# Why this exists beside ~/.local/bin/pitaya-resign.sh: that script's
# --force moves the provisioning profiles aside to mint fresh ones, which
# needs an Xcode account session and fails from a script ("No Accounts").
# The profiles are valid for a year now, so a plain build signs fine with
# the ones already on disk — which is all this does.
set -uo pipefail
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

REPO="${PITAYA_SIGNING_REPO:-$HOME/VibeCoding/personal-os-signing}"
WORK="$HOME/Library/Caches/pitaya-install"
APP="$WORK/dd-watch/Build/Products/Release-watchos/PersonalOS Watch.app"
mkdir -p "$WORK"

if [ ! -d "$REPO/.git" ] && [ ! -f "$REPO/.git" ]; then
  echo "No signing checkout at $REPO (set PITAYA_SIGNING_REPO)"; exit 1
fi

echo "Syncing $REPO to origin/main…"
git -C "$REPO" fetch origin --quiet || { echo "git fetch failed"; exit 1; }
git -C "$REPO" checkout --detach origin/main --quiet || { echo "git checkout failed"; exit 1; }
echo "Building $(git -C "$REPO" rev-parse --short HEAD)…"

if ! xcodebuild -project "$REPO/ios/PersonalOS.xcodeproj" -scheme "PersonalOS Watch" \
    -configuration Release -destination "generic/platform=watchOS" \
    -derivedDataPath "$WORK/dd-watch" build >"$WORK/build-watch.log" 2>&1; then
  echo "Build failed — last lines of $WORK/build-watch.log:"
  grep -E "error:" "$WORK/build-watch.log" | sort -u | head -8
  exit 1
fi

xcrun devicectl list devices --json-output "$WORK/devices.json" >/dev/null 2>&1
DEVICE=$(python3 - "$WORK/devices.json" <<'PY'
import json, sys
try:
    for d in json.load(open(sys.argv[1]))["result"]["devices"]:
        if "Watch" in d.get("hardwareProperties", {}).get("productType", ""):
            print(d["identifier"]); break
except Exception:
    pass
PY
)
if [ -z "$DEVICE" ]; then echo "No paired Apple Watch found by devicectl"; exit 1; fi

for attempt in 1 2 3 4 5 6; do
  if xcrun devicectl device install app --device "$DEVICE" "$APP" >"$WORK/install.log" 2>&1; then
    echo "Installed on the watch (attempt $attempt)."
    exit 0
  fi
  echo "Attempt $attempt: $(grep -m1 -E 'rejected|offline|locked|unavailable' "$WORK/install.log" || tail -1 "$WORK/install.log")"
  sleep 30
done
echo "Not installed. Put the watch on, unlock it, keep it near the phone, and run this again."
exit 1
