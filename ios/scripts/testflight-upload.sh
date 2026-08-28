#!/bin/bash
# Archive + upload Pitaya to TestFlight — the "no MacBook cable" pipeline.
# Written 2026-08-28 alongside docs/apple-developer-setup.md; UNTESTED until
# the first paid-team upload exercises it end-to-end (expect one iteration).
#
# Usage:  ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxx-xxxx ios/scripts/testflight-upload.sh [ios|watch|all]
#
# Requirements (one-time, see docs/apple-developer-setup.md):
#   - DEVELOPMENT_TEAM in ios/project.yml is the PAID team (guarded below)
#   - App Store Connect API key (App Manager role) downloaded to
#       ~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8
#   - App records exist in App Store Connect for both bundle ids
#
# The API key authenticates BOTH automatic signing (-allowProvisioningUpdates
# mints the Apple Distribution cert + profiles headlessly, cloud-managed) and
# the upload itself (destination: upload in the export options), so no Xcode
# GUI session is involved. manageAppVersionAndBuildNumber lets Apple pick
# build numbers (last + 1) — CURRENT_PROJECT_VERSION never needs a manual
# bump; MARKETING_VERSION changes only when a version should look new.

set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"

ASC_KEY_ID="${ASC_KEY_ID:?set ASC_KEY_ID (App Store Connect API key id)}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:?set ASC_ISSUER_ID (App Store Connect issuer id)}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
[ -f "$KEY_PATH" ] || { echo "API key not found at $KEY_PATH" >&2; exit 1; }

# 2026-08-28 discovery: Individual enrollment upgraded the existing personal
# team IN PLACE — HDR67SL3JG is the paid team (ASC bundleIds seedId matches),
# so no team swap ever happened and no free-team guard applies.
TEAM_ID="$(sed -n 's/^ *DEVELOPMENT_TEAM: *//p' "$IOS_DIR/project.yml" | head -1)"
if [ -z "$TEAM_ID" ]; then
  echo "DEVELOPMENT_TEAM missing from project.yml" >&2
  exit 1
fi

BUILD="$IOS_DIR/build/testflight"
mkdir -p "$BUILD"

PLIST="$BUILD/export-options.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>destination</key><string>upload</string>
	<key>signingStyle</key><string>automatic</string>
	<key>teamID</key><string>${TEAM_ID}</string>
	<key>manageAppVersionAndBuildNumber</key><true/>
</dict>
</plist>
EOF

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

ship() { # scheme, platform, slug
  local scheme="$1" platform="$2" slug="$3"
  local archive="$BUILD/$slug.xcarchive"
  echo "=== [$slug] archiving '$scheme' ==="
  # clean is load-bearing: an incremental archive can reuse a product signed
  # by an earlier non-install build, carrying get-task-allow into the archive
  # — which silently removes app-store-connect from the export methods
  # (hit 2026-08-28 on the watch app after the SKIP_INSTALL fix).
  xcodebuild -project "$IOS_DIR/PersonalOS.xcodeproj" -scheme "$scheme" \
    -destination "generic/platform=$platform" -archivePath "$archive" \
    "${AUTH[@]}" clean archive
  echo "=== [$slug] uploading to App Store Connect ==="
  xcodebuild -exportArchive -archivePath "$archive" \
    -exportOptionsPlist "$PLIST" -exportPath "$BUILD/$slug-export" \
    "${AUTH[@]}"
  echo "=== [$slug] uploaded — App Store Connect processes it in ~5–30 min ==="
}

case "$TARGET" in
  ios|all) ship "PersonalOS" iOS ios ;;
  watch)
    echo "Since 2026-08-28 the watch app ships EMBEDDED in the iOS archive" >&2
    echo "(xcodebuild cannot export watch-only archives for the App Store)." >&2
    echo "Run with 'ios' — one archive carries both apps." >&2
    exit 2 ;;
  *) echo "usage: $0 [ios]" >&2; exit 2 ;;
esac
