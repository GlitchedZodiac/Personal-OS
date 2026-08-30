// The planned-workout morning nudge (12:00 UTC = 7am Bogotá): names what HE
// planned for today, and stays silent once he has already trained — or when
// nothing is planned. His plan, his words; never an AI summons.

import { NextRequest, NextResponse } from "next/server";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { getTrainingWeek } from "@/lib/planner";
import { prisma } from "@/lib/prisma";
import { pushConfigured, sendPush } from "@/lib/push";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  getDateStringInTimeZone,
  getUtcDayBoundsForTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ sent: 0, skipped: "push not configured" });
  }
  const prefs = await getNotificationPrefs();
  if (!prefs.plannedWorkout) {
    return NextResponse.json({ sent: 0, skipped: "plannedWorkout pref off" });
  }

  const timeZone = await getUserTimeZone(null);
  const today = getDateStringInTimeZone(new Date(), timeZone);
  const week = await getTrainingWeek(timeZone, getWeekStartDateString(today));
  const todays = week.plans.filter(
    (p) => p.localDate === today && p.status === "planned"
  );
  if (todays.length === 0) {
    return NextResponse.json({ sent: 0, skipped: "nothing planned today" });
  }

  const { dayStart, dayEnd } = getUtcDayBoundsForTimeZone(today, timeZone);
  const trained = await prisma.workoutLog.count({
    where: { startedAt: { gte: dayStart, lte: dayEnd } },
  });
  if (trained > 0) {
    return NextResponse.json({ sent: 0, skipped: "already trained" });
  }

  const body = todays
    .map((p) => {
      const context = p.trailName ?? p.sequenceName;
      const weight = p.targetWeightKg ? ` @ ${p.targetWeightKg} kg` : "";
      return context && context !== p.title ? `${p.title} · ${context}${weight}` : `${p.title}${weight}`;
    })
    .join(" — ");

  const result = await sendPush({
    title: "Training today",
    body,
    url: "/health/workouts",
    tag: "training-nudge",
  });

  return NextResponse.json({ ...result, planned: todays.length });
}
