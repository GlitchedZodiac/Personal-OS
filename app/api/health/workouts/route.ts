import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function buildWorkoutMutation(body: Record<string, unknown>) {
  return {
    startedAt: toNullableDate(body.startedAt) || new Date(),
    endedAt: toNullableDate(body.endedAt),
    workoutType:
      typeof body.workoutType === "string" && body.workoutType.trim().length > 0
        ? body.workoutType.trim()
        : "other",
    durationMinutes: Math.max(0, Number(body.durationMinutes || 0)),
    description:
      typeof body.description === "string" ? body.description : null,
    caloriesBurned: toNullableNumber(body.caloriesBurned),
    distanceMeters: toNullableNumber(body.distanceMeters),
    stepCount:
      body.stepCount === undefined || body.stepCount === null
        ? null
        : Math.round(Number(body.stepCount)),
    avgHeartRateBpm:
      body.avgHeartRateBpm === undefined || body.avgHeartRateBpm === null
        ? null
        : Math.round(Number(body.avgHeartRateBpm)),
    maxHeartRateBpm:
      body.maxHeartRateBpm === undefined || body.maxHeartRateBpm === null
        ? null
        : Math.round(Number(body.maxHeartRateBpm)),
    elevationGainM: toNullableNumber(body.elevationGainM),
    routeData: (body.routeData as Prisma.InputJsonValue) ?? undefined,
    metricsData: (body.metricsData as Prisma.InputJsonValue) ?? undefined,
    exercises: (body.exercises as Prisma.InputJsonValue) ?? undefined,
    deviceType:
      typeof body.deviceType === "string" ? body.deviceType : null,
    externalSource:
      typeof body.externalSource === "string" ? body.externalSource : null,
    externalId:
      typeof body.externalId === "string" ? body.externalId : null,
    syncStatus:
      typeof body.syncStatus === "string" && body.syncStatus.trim().length > 0
        ? body.syncStatus
        : "synced",
    stravaActivityId:
      typeof body.stravaActivityId === "string" ? body.stravaActivityId : null,
    source:
      typeof body.source === "string" && body.source.trim().length > 0
        ? body.source
        : "manual",
  };
}

// GET - List workout entries
export async function GET() {
  try {
    const entries = await prisma.workoutLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Workout fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}

// POST - Create a workout entry
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const entry = await prisma.workoutLog.create({
      data: buildWorkoutMutation(body),
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Workout create error:", error);
    return NextResponse.json(
      { error: "Failed to create workout" },
      { status: 500 }
    );
  }
}

// PATCH - Update an existing workout entry
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : null;

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const updates = buildWorkoutMutation(body);
    const data = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    const entry = await prisma.workoutLog.update({
      where: { id },
      data,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Workout update error:", error);
    return NextResponse.json(
      { error: "Failed to update workout" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a workout entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.workoutLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workout delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete workout" },
      { status: 500 }
    );
  }
}
