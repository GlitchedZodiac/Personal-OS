// GET — the Coach screen's data (2026-10-17, lane B): the latest live review
// in full, every review as a summary (tests and replaced ones included, the
// screen labels them), the settings and this month's spend. Cookie-gated.
//
// The pre-Pitaya "weekly game plan" API at /api/health/coach is left as it
// is until the screen that calls it is replaced (docs/coach-plan.md D15).

import { NextResponse } from "next/server";
import { detailReview, latestLiveReview, listReviews } from "@/lib/coach/run";
import { getCoachSettings } from "@/lib/coach/settings";
import { getCoachSpend } from "@/lib/coach/spend";
import { getUserTimeZone } from "@/lib/server-timezone";

export async function GET() {
  try {
    const [settings, timeZone] = await Promise.all([getCoachSettings(), getUserTimeZone(null)]);
    const [latest, reviews, spend] = await Promise.all([
      latestLiveReview(),
      listReviews(),
      getCoachSpend({ timeZone, budgetUsd: settings.monthlyBudgetUsd }),
    ]);
    return NextResponse.json({
      latest: latest ? detailReview(latest) : null,
      reviews,
      settings,
      spend,
      timeZone,
    });
  } catch (error) {
    console.error("Coach reviews error:", error);
    return NextResponse.json({ error: "Failed to load the Coach" }, { status: 500 });
  }
}
