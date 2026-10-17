import { NextRequest, NextResponse } from "next/server";
import { writeActivityDays } from "@/lib/activity-reports";
import { parseActivityPayload } from "@/lib/daily-activity";
import { requireMobileSession } from "@/lib/mobile-session";

// POST — the iPhone app's own Apple Health activity push (2026-10-17):
// per-day steps, active and resting energy, walk/run distance, read with
// HKStatisticsCollectionQuery so iPhone + Watch overlap is de-duplicated the
// way the Health app does it. The last 8 days on every sync (foreground, or
// woken by HealthKit background delivery), and the whole history once.
//
// Same body and rules as the Shortcut's /api/health/daily
// (lib/daily-activity.ts) — `{ days: [...] }`, upsert by date, a key left
// out is left alone — but authenticated by the device session, so the phone
// needs no second credential. Counts come back instead of date lists: a
// history push is thousands of days.

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const parsed = parseActivityPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { days, empty, rejected } = parsed.value;
  try {
    await writeActivityDays(days);
    if (rejected.length > 0) {
      console.warn(`[mobile/health/activity] ${rejected.length} day(s) rejected:`, rejected.slice(0, 3));
    }
    return NextResponse.json({
      upserted: days.length,
      skipped: empty.length,
      rejected: rejected.length,
      firstDate: days[0]?.date ?? null,
      lastDate: days.at(-1)?.date ?? null,
    });
  } catch (error) {
    console.error("[mobile/health/activity] upsert failed:", error);
    return NextResponse.json({ error: "Failed to store the days" }, { status: 500 });
  }
}
