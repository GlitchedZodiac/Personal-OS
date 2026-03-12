import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

type MobileWorkoutPayload = {
  externalId?: string;
  externalSource?: string;
  startedAt?: string;
  endedAt?: string | null;
  durationMinutes?: number;
  workoutType?: string;
  description?: string | null;
  caloriesBurned?: number | null;
  distanceMeters?: number | null;
  stepCount?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  elevationGainM?: number | null;
  routeData?: Prisma.InputJsonValue;
  metricsData?: Prisma.InputJsonValue;
  exercises?: Prisma.InputJsonValue;
  source?: string;
  syncStatus?: string;
  deviceType?: string | null;
};

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const items: MobileWorkoutPayload[] = Array.isArray(body.items)
      ? body.items
      : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Workout items are required" },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const externalSource =
        typeof item.externalSource === "string" && item.externalSource.trim().length > 0
          ? item.externalSource.trim()
          : "app_watch";
      const externalId =
        typeof item.externalId === "string" && item.externalId.trim().length > 0
          ? item.externalId.trim()
          : null;

      const data = {
        startedAt: item.startedAt ? new Date(item.startedAt) : new Date(),
        endedAt: item.endedAt ? new Date(item.endedAt) : null,
        durationMinutes: Math.max(0, Number(item.durationMinutes || 0)),
        workoutType:
          typeof item.workoutType === "string" && item.workoutType.trim().length > 0
            ? item.workoutType.trim()
            : "other",
        description:
          typeof item.description === "string" ? item.description : null,
        caloriesBurned: toNullableNumber(item.caloriesBurned),
        distanceMeters: toNullableNumber(item.distanceMeters),
        stepCount:
          item.stepCount === undefined || item.stepCount === null
            ? null
            : Math.round(Number(item.stepCount)),
        avgHeartRateBpm:
          item.avgHeartRateBpm === undefined || item.avgHeartRateBpm === null
            ? null
            : Math.round(Number(item.avgHeartRateBpm)),
        maxHeartRateBpm:
          item.maxHeartRateBpm === undefined || item.maxHeartRateBpm === null
            ? null
            : Math.round(Number(item.maxHeartRateBpm)),
        elevationGainM: toNullableNumber(item.elevationGainM),
        routeData: item.routeData ?? Prisma.JsonNull,
        metricsData: item.metricsData ?? Prisma.JsonNull,
        exercises: item.exercises ?? Prisma.JsonNull,
        deviceType:
          typeof item.deviceType === "string" && item.deviceType.trim().length > 0
            ? item.deviceType.trim()
            : session.deviceType,
        externalSource,
        externalId,
        syncStatus:
          typeof item.syncStatus === "string" && item.syncStatus.trim().length > 0
            ? item.syncStatus.trim()
            : "synced",
        source:
          typeof item.source === "string" && item.source.trim().length > 0
            ? item.source.trim()
            : "mobile",
      };

      if (externalId) {
        const existing = await prisma.workoutLog.findFirst({
          where: { externalSource, externalId },
          select: { id: true },
        });

        if (existing) {
          await prisma.workoutLog.update({
            where: { id: existing.id },
            data,
          });
          updated++;
          continue;
        }
      }

      await prisma.workoutLog.create({ data });
      created++;
    }

    return NextResponse.json({
      created,
      updated,
      total: items.length,
    });
  } catch (error) {
    console.error("Mobile workout sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync workouts" },
      { status: 500 }
    );
  }
}
