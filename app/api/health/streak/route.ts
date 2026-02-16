import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, subDays, format, getDay } from "date-fns";

// GET - Calculate current logging streak
export async function GET() {
  try {
    // Get all distinct dates that have food logs, going back 365 days
    const since = subDays(new Date(), 365);

    const foodLogs = await prisma.foodLog.findMany({
      where: { loggedAt: { gte: since } },
      select: { loggedAt: true },
      orderBy: { loggedAt: "desc" },
    });

    // Build set of dates that have logs (formatted in local time)
    const loggedDates = new Set<string>();
    for (const log of foodLogs) {
      loggedDates.add(format(log.loggedAt, "yyyy-MM-dd"));
    }

    // Calculate streak from today backwards
    let streak = 0;
    let currentDate = startOfDay(new Date());
    const todayStr = format(currentDate, "yyyy-MM-dd");

    // Check if today has logs
    if (loggedDates.has(todayStr)) {
      streak = 1;
      currentDate = subDays(currentDate, 1);
    } else {
      // If today has no logs yet, check if yesterday started a streak
      currentDate = subDays(currentDate, 1);
    }

    // Count consecutive days backwards
    while (loggedDates.has(format(currentDate, "yyyy-MM-dd"))) {
      streak++;
      currentDate = subDays(currentDate, 1);
    }

    // Total days logged
    const totalDaysLogged = loggedDates.size;

    // Build a map of which days this week were logged
    // weekLogged[0] = Monday, weekLogged[6] = Sunday
    const weekLogged: boolean[] = [];
    const today = startOfDay(new Date());
    // getDay: 0=Sun, 1=Mon, ..., 6=Sat
    const todayDow = getDay(today); // 0-6 (Sun-Sat)
    // Convert to Monday-based: Mon=0, Tue=1, ..., Sun=6
    const todayMondayBased = todayDow === 0 ? 6 : todayDow - 1;

    let weekDays = 0;
    for (let i = 0; i < 7; i++) {
      // i=0 is Monday of this week
      const daysBack = todayMondayBased - i;
      const dayDate = daysBack >= 0
        ? subDays(today, daysBack)
        : subDays(today, daysBack + 7); // shouldn't happen but safety
      const dayStr = format(dayDate, "yyyy-MM-dd");
      const logged = loggedDates.has(dayStr);
      weekLogged.push(logged);
      if (logged) weekDays++;
    }

    return NextResponse.json({
      streak,
      totalDaysLogged,
      weekDays,
      weekLogged, // [Mon, Tue, Wed, Thu, Fri, Sat, Sun] as booleans
      loggedToday: loggedDates.has(todayStr),
    });
  } catch (error) {
    console.error("Streak error:", error);
    return NextResponse.json(
      { error: "Failed to calculate streak" },
      { status: 500 }
    );
  }
}
