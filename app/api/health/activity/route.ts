import { NextRequest, NextResponse } from "next/server";
import {
  activityToday,
  getMorningActivityReport,
  getWeeklyActivityReport,
} from "@/lib/activity-reports";
import { ACTIVITY_TIME_ZONE, isCalendarDay } from "@/lib/daily-activity";
import { prisma } from "@/lib/prisma";
import { addDaysToDateString, getWeekStartDateString } from "@/lib/timezone";

// GET — the Activity screen's data (2026-10-17): the morning report for
// `date` (default yesterday, Central) and the Mon–Sun report for the week
// holding `week` (default this week). Cookie-gated like every /api route.

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const today = activityToday();
    const dateParam = params.get("date");
    const weekParam = params.get("week");
    const date = isCalendarDay(dateParam) ? dateParam : addDaysToDateString(today, -1);
    const weekStart = getWeekStartDateString(isCalendarDay(weekParam) ? weekParam : today);

    const [morning, weekly, latest, totalDays] = await Promise.all([
      getMorningActivityReport(date),
      getWeeklyActivityReport(weekStart),
      prisma.dailyActivity.findFirst({
        orderBy: { receivedAt: "desc" },
        select: { date: true, receivedAt: true },
      }),
      prisma.dailyActivity.count(),
    ]);

    return NextResponse.json({
      timeZone: ACTIVITY_TIME_ZONE,
      today,
      morning,
      weekly,
      lastPush: latest ? { date: latest.date, receivedAt: latest.receivedAt.toISOString() } : null,
      totalDays,
    });
  } catch (error) {
    console.error("Activity report error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
