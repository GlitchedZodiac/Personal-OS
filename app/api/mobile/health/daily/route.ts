import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { NEAR_KG, NEAR_MS } from "@/lib/vesync";

// POST — the companion's daily HealthKit push (steps, resting HR, active
// energy, distance, sleep, HRV) plus optional bodyMass samples.
//
// Weight is NOT a snapshot field: HealthKit body-mass entries are the same
// weigh-ins the VeSync CSV import already stores, so they land in
// body_measurements through the same near-twin rule (±10 min, ±0.3 kg =
// the same weigh-in → fill blanks, never duplicate). The server decides;
// the companion sends everything it has.

function num(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

interface WeightSample {
  measuredAt?: unknown;
  weightKg?: unknown;
}

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

    const metrics = {
      steps: Math.max(0, int(body.steps) ?? 0),
      restingHeartRateBpm: int(body.restingHeartRateBpm),
      activeEnergyKcal: num(body.activeEnergyKcal),
      walkingRunningDistanceMeters: num(body.walkingRunningDistanceMeters),
      sleepMinutes: int(body.sleepMinutes),
      sleepDeepMinutes: int(body.sleepDeepMinutes),
      sleepRemMinutes: int(body.sleepRemMinutes),
      hrvMs: num(body.hrvMs),
      rawData: {
        deviceSessionId: session.id,
        payload: body.rawData ?? null,
      },
    };

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: { localDate_timeZone_source: { localDate, timeZone, source } },
      create: { localDate, timeZone, source, ...metrics },
      update: metrics,
    });

    // ——— body-mass samples → body_measurements (dedup, never duplicate) ———
    const samples: WeightSample[] = Array.isArray(body.weightSamples)
      ? body.weightSamples
      : num(body.weightKg) !== null
        ? [{ measuredAt: body.weightMeasuredAt, weightKg: body.weightKg }]
        : [];

    let weightsImported = 0;
    let weightsSkipped = 0;

    for (const sample of samples) {
      const weightKg = num(sample.weightKg);
      if (weightKg === null || weightKg <= 0) continue;
      const measuredAt =
        typeof sample.measuredAt === "string" && !Number.isNaN(Date.parse(sample.measuredAt))
          ? new Date(sample.measuredAt)
          : new Date();

      const twin = await prisma.bodyMeasurement.findFirst({
        where: {
          measuredAt: {
            gte: new Date(measuredAt.getTime() - NEAR_MS),
            lte: new Date(measuredAt.getTime() + NEAR_MS),
          },
          weightKg: {
            gte: weightKg - NEAR_KG,
            lte: weightKg + NEAR_KG,
          },
        },
        select: { id: true },
      });

      if (twin) {
        weightsSkipped++;
        continue;
      }

      await prisma.bodyMeasurement.create({
        data: { measuredAt, weightKg, source: "apple_health" },
      });
      weightsImported++;
    }

    return NextResponse.json({ ...snapshot, weightsImported, weightsSkipped });
  } catch (error) {
    console.error("Daily health snapshot sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync daily health snapshot" },
      { status: 500 }
    );
  }
}
