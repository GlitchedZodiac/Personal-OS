// POST { mode: "manual" | "test", week?: "YYYY-MM-DD", again?: boolean } —
// run the Coach now (2026-10-17, lane B). Cookie-gated by proxy.ts; it spends
// money, so the cap is enforced here, server-side: a manual run stops at the
// monthly budget (409). A Test run he taps still runs past it (D7) — it reads
// only the synthetic week and writes only its own review row.
//
//   manual           this week's review; returns the existing one if it is healthy
//   manual + again   supersede it (the old one stays readable as "replaced")
//   test             the whole pipeline on the fixture week

import { NextRequest, NextResponse } from "next/server";
import { defaultReviewWeek, detailReview, runCoachReview } from "@/lib/coach/run";
import { getCoachSettings } from "@/lib/coach/settings";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDateStringInTimeZone, getWeekStartDateString } from "@/lib/timezone";

export const maxDuration = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = body.mode === "test" ? "test" : body.mode === "manual" ? "manual" : null;
  if (!mode) return NextResponse.json({ error: 'mode must be "manual" or "test"' }, { status: 400 });

  try {
    const now = new Date();
    const timeZone = await getUserTimeZone(null);
    const settings = await getCoachSettings();
    const currentWeek = getWeekStartDateString(getDateStringInTimeZone(now, timeZone), 1);
    let weekStart = defaultReviewWeek(now, timeZone);
    if (body.week !== undefined) {
      if (typeof body.week !== "string" || !DAY_RE.test(body.week)) {
        return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
      }
      weekStart = getWeekStartDateString(body.week, 1);
      if (weekStart > currentWeek) {
        return NextResponse.json({ error: "that week has not started" }, { status: 400 });
      }
    }

    if (mode === "test") {
      const result = await runCoachReview({ trigger: "manual", kind: "test", weekStart, timeZone, now, settings });
      if (result.outcome === "skipped" && result.reason === "test_limit") {
        return NextResponse.json(
          { error: "test_limit", message: `That's ${result.limit} Test runs today — the limit, since Tests skip the budget. Try again tomorrow.` },
          { status: 429 }
        );
      }
      if (result.outcome !== "ran") return NextResponse.json({ error: "test run did not start" }, { status: 500 });
      return NextResponse.json({ review: detailReview(result.review) });
    }

    if (!settings.enabled) {
      return NextResponse.json({ error: "coach_off", message: "The Coach is switched off in Settings → Coach." }, { status: 423 });
    }
    const result = await runCoachReview({
      trigger: "manual",
      kind: "live",
      weekStart,
      timeZone,
      now,
      settings,
      onExisting: body.again === true ? "supersede" : "supersede_if_unhealthy",
    });
    if (result.outcome === "ran") return NextResponse.json({ review: detailReview(result.review) });
    if (result.reason === "exists") {
      // A run already writing this week is not paid for twice: say so, with it.
      if (result.review.status === "generating") {
        return NextResponse.json(
          { error: "in_flight", message: "This week's review is being written right now.", review: detailReview(result.review) },
          { status: 409 }
        );
      }
      return NextResponse.json({ review: detailReview(result.review), existed: true });
    }
    if (result.reason === "budget") {
      return NextResponse.json(
        {
          error: "budget",
          message: `This month's $${settings.monthlyBudgetUsd} Coach budget is spent. Raise it in Settings → Coach.`,
          spend: result.spend,
          review: result.review ? detailReview(result.review) : null,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "coach_off" }, { status: 423 });
  } catch (error) {
    console.error("Coach run error:", error);
    return NextResponse.json({ error: "Coach run failed" }, { status: 500 });
  }
}
