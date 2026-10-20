// The Coach's Sunday run (2026-10-17, lane B — docs/coach-plan.md §2.8).
// vercel.json: Mon 00:00 UTC = Sun 19:00 Bogotá (the review covers the week
// through that moment, and says so), and Mon 12:00 UTC = Mon 07:00 Bogotá,
// the catch-up — it writes a week only when no review exists or the one that
// does failed or died mid-run; a good review is never replaced.
//
// Self-authenticating (under /api/cron/, allowlisted in proxy.ts) through
// lib/coach/cron-auth.ts: constant-time, and closed when CRON_SECRET is unset.

import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/coach/cron-auth";
import { defaultReviewWeek, runCoachReview } from "@/lib/coach/run";
import { weekLabel } from "@/lib/coach/review";
import { getCoachSettings } from "@/lib/coach/settings";
import { notify } from "@/lib/notify";
import { getUserTimeZone } from "@/lib/server-timezone";
import { addDaysToDateString } from "@/lib/timezone";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const settings = await getCoachSettings();
    if (!settings.enabled) return NextResponse.json({ skipped: "coach off" });

    const timeZone = await getUserTimeZone(null);
    const weekStart = defaultReviewWeek(now, timeZone);
    const result = await runCoachReview({
      trigger: "cron",
      kind: "live",
      weekStart,
      timeZone,
      now,
      settings,
      onExisting: "supersede_if_unhealthy",
      scheduled: true,
    });
    const label = weekLabel(weekStart, addDaysToDateString(weekStart, 6));

    if (result.outcome === "skipped") {
      if (result.reason === "budget") {
        // Once per week: "the Coach is paused", never a nag.
        await notify({
          category: "coachReview",
          title: "The Coach is paused",
          body: `This month's $${settings.monthlyBudgetUsd} budget is spent. Raise it in Settings → Coach, or it resumes on the 1st.`,
          url: "/settings",
          tag: "coach-paused",
          dedupeKey: `coach-paused:${weekStart}`,
        }).catch((error) => console.warn("Coach paused notice failed:", (error as Error)?.message));
        return NextResponse.json({ skipped: "budget", weekStart, spend: result.spend });
      }
      if (result.reason === "exists") {
        return NextResponse.json({ skipped: "exists", weekStart, reviewId: result.review.id, status: result.review.status });
      }
      return NextResponse.json({ skipped: result.reason });
    }

    const review = result.review;
    let pushed: string | null = null;
    if (review.status === "ready") {
      const headline = (review.reviewJson as { headline?: string } | null)?.headline;
      const sent = await notify({
        category: "coachReview",
        title: `The Coach · ${label}`,
        body: headline || "This week's review is written.",
        url: `/health/coach?review=${review.id}`,
        tag: `coach-review-${weekStart}`,
        dedupeKey: `coach-review:${weekStart}`,
      }).catch((error) => {
        console.warn("Coach review notice failed:", (error as Error)?.message);
        return null;
      });
      pushed = sent?.status ?? null;
    }
    return NextResponse.json({
      ok: review.status === "ready",
      weekStart,
      reviewId: review.id,
      status: review.status,
      costUsd: Number(review.costUsd),
      pushed,
      ...(review.error ? { error: review.error } : {}),
    });
  } catch (error) {
    console.error("Coach weekly cron error:", error);
    return NextResponse.json({ error: "Coach run failed" }, { status: 500 });
  }
}
