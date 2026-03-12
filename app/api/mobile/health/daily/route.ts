import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const localDate =
      typeof body.localDate === "string" ? body.localDate.trim() : "";
    const timeZone =
      typeof body.timeZone === "string" ? body.timeZone.trim() : "";
    const source =
      typeof body.source === "string" && body.source.trim().length > 0
        ? body.source.trim()
        : "apple_health";

    if (!localDate || !timeZone) {
      return NextResponse.json(
        { error: "localDate and timeZone are required" },
        { status: 400 }
      );
    }

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: {
        localDate_timeZone_source: {
          localDate,
          timeZone,
          source,
        },
      },
      create: {
        localDate,
        timeZone,
        steps: Math.max(0, Number(body.steps || 0)),
        restingHeartRateBpm:
          body.restingHeartRateBpm === undefined || body.restingHeartRateBpm === null
            ? null
            : Math.round(Number(body.restingHeartRateBpm)),
        activeEnergyKcal:
          body.activeEnergyKcal === undefined || body.activeEnergyKcal === null
            ? null
            : Number(body.activeEnergyKcal),
        walkingRunningDistanceMeters:
          body.walkingRunningDistanceMeters === undefined ||
          body.walkingRunningDistanceMeters === null
            ? null
            : Number(body.walkingRunningDistanceMeters),
        source,
        rawData: {
          deviceSessionId: session.id,
          payload: body.rawData ?? null,
        },
      },
      update: {
        steps: Math.max(0, Number(body.steps || 0)),
        restingHeartRateBpm:
          body.restingHeartRateBpm === undefined || body.restingHeartRateBpm === null
            ? null
            : Math.round(Number(body.restingHeartRateBpm)),
        activeEnergyKcal:
          body.activeEnergyKcal === undefined || body.activeEnergyKcal === null
            ? null
            : Number(body.activeEnergyKcal),
        walkingRunningDistanceMeters:
          body.walkingRunningDistanceMeters === undefined ||
          body.walkingRunningDistanceMeters === null
            ? null
            : Number(body.walkingRunningDistanceMeters),
        rawData: {
          deviceSessionId: session.id,
          payload: body.rawData ?? null,
        },
      },
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Daily health snapshot sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync daily health snapshot" },
      { status: 500 }
    );
  }
}
