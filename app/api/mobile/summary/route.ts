import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { getUserTimeZone } from "@/lib/server-timezone";
import { buildHeroMetrics } from "@/lib/mobile-summary";

// GET — the complication's hero metrics (watch Round 1+2 handoff § 2:
// widget-side API fetch replacing the .never timeline). Same bearer auth as
// every mobile route; the widget extension shares the app's keychain session.
// Deliberately just the three hero numbers + date context: widget timeline
// budgets are tight and this must stay cheap to call.
//
// NOTE for the watch lane: field names are the contract — streakDays,
// weight7dAvgKg, weight7dDeltaKg, z2WeeklyMinutes. If the handoff spec names
// them differently, file the rename in deferred-items rather than adapting
// watch-side; the server bends to the spec, not the other way around.
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const timeZone = await getUserTimeZone(
      new URL(request.url).searchParams.get("tz")
    );
    const summary = await buildHeroMetrics(timeZone);

    return NextResponse.json({ timeZone, ...summary });
  } catch (error) {
    console.error("Mobile summary error:", error);
    return NextResponse.json(
      { error: "Failed to load summary" },
      { status: 500 }
    );
  }
}
