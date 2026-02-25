import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDateStringInTimeZone, getZonedDateParts } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/server-timezone";

const RUN_HOUR = 2;
const RUN_WINDOW_MINUTES = 15;
const KEEP_CACHE_DAYS = 90;
const KEEP_FIRED_REMINDERS_DAYS = 30;

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function extractRequestedTimeZone(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("timeZone");
  return value && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestedTimeZone = extractRequestedTimeZone(request);
    const timeZone = await getUserTimeZone(requestedTimeZone);
    const now = new Date();
    const localNow = getZonedDateParts(now, timeZone);
    const localDate = getDateStringInTimeZone(now, timeZone);
    const localTime = `${pad2(localNow.hour)}:${pad2(localNow.minute)}`;

    const isInRunWindow =
      localNow.hour === RUN_HOUR && localNow.minute < RUN_WINDOW_MINUTES;

    if (!isInRunWindow) {
      return NextResponse.json({
        success: true,
        ran: false,
        reason: "outside_window",
        timeZone,
        localDate,
        localTime,
        runWindow: {
          hour: RUN_HOUR,
          minutes: RUN_WINDOW_MINUTES,
        },
      });
    }

    const cacheKey = `cron_daily_refresh_${timeZone}_${localDate}`;
    try {
      await prisma.aIInsightCache.create({
        data: {
          cacheKey,
          insight: "daily_refresh_heartbeat",
          dataHash: localDate,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json({
          success: true,
          ran: false,
          reason: "already_ran",
          timeZone,
          localDate,
          localTime,
        });
      }
      throw error;
    }

    const staleCacheBefore = new Date(
      now.getTime() - KEEP_CACHE_DAYS * 24 * 60 * 60 * 1000
    );
    const staleReminderBefore = new Date(
      now.getTime() - KEEP_FIRED_REMINDERS_DAYS * 24 * 60 * 60 * 1000
    );

    const [settingsRow, staleCacheDelete, staleReminderDelete] =
      await Promise.all([
        prisma.userSettings.findUnique({
          where: { id: "default" },
          select: { data: true },
        }),
        prisma.aIInsightCache.deleteMany({
          where: { createdAt: { lt: staleCacheBefore } },
        }),
        prisma.reminder.deleteMany({
          where: {
            fired: true,
            remindAt: { lt: staleReminderBefore },
          },
        }),
      ]);

    const settingsData =
      (settingsRow?.data as Record<string, unknown> | null) ?? {};
    const existingCron =
      typeof settingsData.cron === "object" && settingsData.cron !== null
        ? (settingsData.cron as Record<string, unknown>)
        : {};
    const nextData: Record<string, unknown> = {
      ...settingsData,
      cron: {
        ...existingCron,
        lastDailyRefresh: {
          localDate,
          localTime,
          timeZone,
          ranAtIso: now.toISOString(),
        },
      },
    };

    await prisma.userSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        data: nextData as Prisma.InputJsonValue,
      },
      update: {
        data: nextData as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      ran: true,
      timeZone,
      localDate,
      localTime,
      cleanup: {
        cacheDeleted: staleCacheDelete.count,
        remindersDeleted: staleReminderDelete.count,
      },
    });
  } catch (error) {
    console.error("Cron daily refresh error:", error);
    return NextResponse.json(
      { error: "Failed to run daily refresh cron" },
      { status: 500 }
    );
  }
}
