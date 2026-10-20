// GET — the Coach screen's data (2026-10-17, lane B): the latest live review
// in full, every review as a summary (tests and replaced ones included, the
// screen labels them), the settings and this month's spend. Cookie-gated.
// `?lite=1` (Today's row): the latest live review as a summary, and the switch.
//
// The pre-Pitaya "weekly game plan" API at /api/health/coach is left as it
// is until the screen that calls it is replaced (docs/coach-plan.md D15).

import { NextRequest, NextResponse } from "next/server";
import { reminderZone } from "@/lib/coach/confirm";
import { detailReview, latestLiveReview, listReviews, summarizeReview } from "@/lib/coach/run";
import { getCoachSettings } from "@/lib/coach/settings";
import { getCoachSpend } from "@/lib/coach/spend";
import { getUserTimeZone } from "@/lib/server-timezone";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("lite") === "1") {
      const [settings, latest] = await Promise.all([getCoachSettings(), latestLiveReview()]);
      return NextResponse.json({ latest: latest ? summarizeReview(latest) : null, enabled: settings.enabled });
    }
    const [settings, timeZone] = await Promise.all([getCoachSettings(), getUserTimeZone(null)]);
    const [latest, reviews, spend, zone] = await Promise.all([
      latestLiveReview(),
      listReviews(),
      getCoachSpend({ timeZone, budgetUsd: settings.monthlyBudgetUsd }),
      reminderZone(),
    ]);
    return NextResponse.json({
      latest: latest ? detailReview(latest) : null,
      reviews,
      settings,
      spend,
      timeZone,
      /** the zone a reminder card shows and the confirm route writes in */
      reminderZone: zone,
    });
  } catch (error) {
    console.error("Coach reviews error:", error);
    return NextResponse.json({ error: "Failed to load the Coach" }, { status: 500 });
  }
}
