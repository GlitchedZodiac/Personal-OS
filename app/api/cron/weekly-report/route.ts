import { NextRequest, NextResponse } from "next/server";
import { getUserTimeZone } from "@/lib/server-timezone";
import { generateWeeklyReport } from "@/lib/weekly-report";
import { getDateStringInTimeZone } from "@/lib/timezone";

export const maxDuration = 60;

// Sunday-night writer (vercel.json: Mon 04:00 UTC = Sun 11 PM Bogotá) —
// generates the week that just ended. Self-authenticating per proxy.ts.

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timeZone = await getUserTimeZone(null);
    const todayStr = getDateStringInTimeZone(new Date(), timeZone);
    const report = await generateWeeklyReport(todayStr, timeZone);

    // "Your week is written up" (2026-08-28, pref-gated). The cron is listed
    // twice in vercel.json; the week-start tag makes the second delivery
    // replace the first instead of stacking.
    let pushed = 0;
    try {
      const { getNotificationPrefs } = await import("@/lib/notification-prefs");
      const { pushConfigured, sendPush } = await import("@/lib/push");
      const prefs = await getNotificationPrefs();
      if (prefs.weeklyReport && pushConfigured()) {
        const result = await sendPush({
          title: "Weekly report ready",
          body: report.headline || `Week of ${report.weekStart} is written up.`,
          url: "/health/report",
          tag: `weekly-report-${report.weekStart}`,
        });
        pushed = result.sent;
      }
    } catch (pushError) {
      console.warn("Weekly report push failed:", (pushError as Error)?.message);
    }

    return NextResponse.json({
      ok: true,
      weekStart: report.weekStart,
      headline: report.headline,
      pushed,
    });
  } catch (error) {
    console.error("Weekly report cron error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
