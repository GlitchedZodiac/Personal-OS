import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { DEFAULT_HR_ZONE_TOPS, ZONE_NAMES } from "@/lib/zones";

// GET - his heart-rate zone boundaries for the watch (bearer device-
// session auth). The wrist binds to this instead of hardcoding, so a
// future recalibration (real watch max instead of age-derived) lands
// everywhere at once. Requested by the Freestyle contract
// (docs/watch-contract.md §Freestyle).

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      // Upper bounds of Z1–Z4; Z5 is everything above the last.
      tops: DEFAULT_HR_ZONE_TOPS,
      names: ZONE_NAMES,
      source: "strava-profile-age-derived",
    });
  } catch (error) {
    console.error("Mobile zones error:", error);
    return NextResponse.json({ error: "Failed to load zones" }, { status: 500 });
  }
}
