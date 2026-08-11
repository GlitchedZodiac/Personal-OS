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
    return NextResponse.json({
      ok: true,
      weekStart: report.weekStart,
      headline: report.headline,
    });
  } catch (error) {
    console.error("Weekly report cron error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
