// The database half of the activity reports (2026-10-17): load the rows,
// shape them with lib/activity-summary.ts, and send the two pushes he asked
// for — yesterday's report around 7 am Central, the week's on Sunday evening.
//
// TIMING. There is no exact-minute clock on this plan: the notification
// sweep runs hourly (vercel.json, ±59 min) and calls sendActivityReports.
// So the morning report goes out on the first sweep after 07:00 Central
// once yesterday has arrived — if the Shortcut missed last night, each
// sweep until noon looks again, then it lets the day go (the stalled-
// Shortcut alert covers a pipeline that has stopped). The weekly goes out on
// the first sweep after 19:00 Sunday, before quiet hours; if the week has no
// data yet it keeps looking until Monday noon. Each is sent at most once
// (notify's dedupeKey).

import {
  type ActivityRow,
  buildMorningReport,
  buildWeeklyReport,
  morningNotification,
  weeklyNotification,
} from "@/lib/activity-summary";
import { buildActivityHistory, mergeActivitySources } from "@/lib/activity-history";
import { ACTIVITY_TIME_ZONE, type ActivityDay, buildUpsertStatements } from "@/lib/daily-activity";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getHourInTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

/**
 * The Shortcut's days, with the iPhone app's own Health push filling any day
 * the Shortcut has not sent (lib/activity-history.ts mergeActivitySources).
 * Until he builds the Shortcut, the app's days are all there is.
 */
export async function loadActivityRows(from: string, to: string): Promise<ActivityRow[]> {
  const [shortcut, snapshots] = await Promise.all([
    prisma.dailyActivity.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        steps: true,
        activeEnergyKcal: true,
        restingEnergyKcal: true,
        walkingRunningDistanceKm: true,
        source: true,
        receivedAt: true,
      },
    }),
    prisma.dailyHealthSnapshot.findMany({
      where: { localDate: { gte: from, lte: to } },
      select: { localDate: true, steps: true, activeEnergyKcal: true, walkingRunningDistanceMeters: true },
    }),
  ]);
  return mergeActivitySources(shortcut, snapshots);
}

/** Everything since the first day either source holds, through yesterday. */
export async function getActivityHistory(today: string = activityToday()) {
  const rows = await loadActivityRows("2014-09-01", today);
  return buildActivityHistory(rows, today);
}

/**
 * Writes parsed days to daily_activity — one INSERT … ON CONFLICT per set of
 * fields sent (lib/daily-activity.ts), so a key a push left out is never
 * touched. Shared by the Shortcut's route and the iPhone app's.
 */
export async function writeActivityDays(days: ActivityDay[], receivedAt: Date = new Date()): Promise<void> {
  if (days.length === 0) return;
  await prisma.$transaction(
    buildUpsertStatements(days, receivedAt).map((stmt) => prisma.$executeRawUnsafe(stmt.sql, ...stmt.params))
  );
}

/** "Today" for these reports is always Central time — his call. */
export function activityToday(now: Date = new Date()): string {
  return getDateStringInTimeZone(now, ACTIVITY_TIME_ZONE);
}

export async function getMorningActivityReport(date: string) {
  const rows = await loadActivityRows(addDaysToDateString(date, -7), date);
  return buildMorningReport(rows, date);
}

export async function getWeeklyActivityReport(weekStart: string) {
  const rows = await loadActivityRows(addDaysToDateString(weekStart, -7), addDaysToDateString(weekStart, 6));
  return buildWeeklyReport(rows, weekStart);
}

async function alreadySent(dedupeKey: string): Promise<boolean> {
  const row = await prisma.notificationLog.findUnique({ where: { dedupeKey }, select: { id: true } });
  return row !== null;
}

export interface ActivityReportSweep {
  morning: string;
  weekly: string;
}

/** Called by the full (hourly) notification sweep. Cheap outside its windows. */
export async function sendActivityReports(now: Date = new Date()): Promise<ActivityReportSweep> {
  const out: ActivityReportSweep = { morning: "outside window", weekly: "outside window" };
  const today = activityToday(now);
  const hour = getHourInTimeZone(now, ACTIVITY_TIME_ZONE);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday

  const morningWindow = hour >= 7 && hour < 12;
  const weeklyWindow = (weekday === 0 && hour >= 19) || (weekday === 1 && hour < 12);
  if (!morningWindow && !weeklyWindow) return out;

  const prefs = await getNotificationPrefs();
  if (!prefs.activityReports) return { morning: "muted", weekly: "muted" };

  if (morningWindow) {
    const date = addDaysToDateString(today, -1);
    const dedupeKey = `activity-morning:${date}`;
    if (await alreadySent(dedupeKey)) {
      out.morning = "already sent";
    } else {
      const message = morningNotification(await getMorningActivityReport(date));
      if (!message) {
        out.morning = `no data for ${date} yet`;
      } else {
        const result = await notify({
          category: "activityReport",
          ...message,
          url: `/health/activity?date=${date}`,
          tag: "activity-morning",
          dedupeKey,
          now,
        });
        out.morning = result.status;
      }
    }
  }

  if (weeklyWindow) {
    // Sunday evening reports the week ending today; Monday morning, the one that just ended.
    const weekStart = getWeekStartDateString(weekday === 0 ? today : addDaysToDateString(today, -1));
    const dedupeKey = `activity-weekly:${weekStart}`;
    if (await alreadySent(dedupeKey)) {
      out.weekly = "already sent";
    } else {
      const message = weeklyNotification(await getWeeklyActivityReport(weekStart));
      if (!message) {
        out.weekly = `no data for the week of ${weekStart} yet`;
      } else {
        const result = await notify({
          category: "activityReport",
          ...message,
          url: `/health/activity?week=${weekStart}`,
          tag: "activity-weekly",
          dedupeKey,
          now,
        });
        out.weekly = result.status;
      }
    }
  }

  return out;
}
