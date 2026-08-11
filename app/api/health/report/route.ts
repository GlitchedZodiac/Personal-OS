import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { generateWeeklyReport, type WeeklyReportData } from "@/lib/weekly-report";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

export const maxDuration = 60;

// GET ?week=YYYY-MM-DD — the Sunday Report for the week containing that
// date (default: the most recent COMPLETED week). Reports are persisted;
// a missing past week generates on demand (backfill), but the current
// in-progress week never does — it "writes itself Sunday night".

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const todayStr = getDateStringInTimeZone(new Date(), timeZone);
    const currentWeekStart = getWeekStartDateString(todayStr, 1);

    const weekParam = searchParams.get("week");
    const requestedWeekStart =
      weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
        ? getWeekStartDateString(weekParam, 1)
        : addDaysToDateString(currentWeekStart, -7); // last completed week

    if (requestedWeekStart >= currentWeekStart) {
      return NextResponse.json(
        { pending: true, weekStart: requestedWeekStart },
        { status: 200 }
      );
    }

    const stored = await prisma.weeklyReport.findUnique({
      where: { weekStart: requestedWeekStart },
    });
    let report = (stored?.data ?? null) as WeeklyReportData | null;
    if (!report) {
      report = await generateWeeklyReport(requestedWeekStart, timeZone);
    }

    const available = await prisma.weeklyReport.findMany({
      orderBy: { weekStart: "desc" },
      take: 12,
      select: { weekStart: true },
    });

    return NextResponse.json({
      report,
      availableWeeks: available.map((w) => w.weekStart),
    });
  } catch (error) {
    console.error("Weekly report error:", error);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}
