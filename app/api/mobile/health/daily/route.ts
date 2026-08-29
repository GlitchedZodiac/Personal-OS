import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import type { IncomingBodySample } from "@/lib/body-measurements";
import { ingestBodySamples } from "@/lib/body-ingest";

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

// Widened 2026-08-26: a weigh-in may now carry body fat, BMI and lean mass
// from the scale. Older companion builds send only measuredAt+weightKg and
// still work — the extra keys are simply absent.
type WeightSample = IncomingBodySample;

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

    // Sleep/HRV arrive one of two ways. The companion's v1 mapping nests them
    // in `rawData` ("until the main lane's columns ship" — those columns
    // shipped, the companion was never updated), so a real HRV reading was
    // landing in a JSON blob nothing queries while the dedicated column stayed
    // null. Top-level always wins; the nested copy is the fallback. Drop this
    // fallback once the companion promotes the fields.
    const nested = (
      body.rawData && typeof body.rawData === "object" ? body.rawData : {}
    ) as Record<string, unknown>;
    const field = (key: string) =>
      body[key] !== undefined && body[key] !== null ? body[key] : nested[key];

    const metrics = {
      steps: Math.max(0, int(body.steps) ?? 0),
      restingHeartRateBpm: int(field("restingHeartRateBpm")),
      activeEnergyKcal: num(field("activeEnergyKcal")),
      walkingRunningDistanceMeters: num(field("walkingRunningDistanceMeters")),
      sleepMinutes: int(field("sleepMinutes")),
      sleepDeepMinutes: int(field("sleepDeepMinutes")),
      sleepRemMinutes: int(field("sleepRemMinutes")),
      hrvMs: num(field("hrvMs")),
      // Zero-effort extras (2026-08-29) — the watch measures these alone.
      respiratoryRateBrpm: num(field("respiratoryRateBrpm")),
      wristTempC: num(field("wristTempC")),
      vo2Max: num(field("vo2Max")),
      spo2Pct: num(field("spo2Pct")),
      rawData: {
        deviceSessionId: session.id,
        payload: body.rawData ?? null,
      },
    };

    // Null-preserving update (2026-08-29): an observer-triggered daytime
    // sync reads no sleep and used to NULL the morning's good values — the
    // audit's "every sleep field is null" had this as a cause. On update,
    // only non-null values overwrite; steps/rawData always refresh.
    const nonNull = Object.fromEntries(
      Object.entries(metrics).filter(([k, v]) => k === "steps" || k === "rawData" || v != null)
    );

    const snapshot = await prisma.dailyHealthSnapshot.upsert({
      where: { localDate_timeZone_source: { localDate, timeZone, source } },
      create: { localDate, timeZone, source, ...metrics },
      update: nonNull,
    });

    // ——— body-mass samples → body_measurements (dedup, never duplicate) ———
    const samples: WeightSample[] = Array.isArray(body.weightSamples)
      ? body.weightSamples
      : num(body.weightKg) !== null
        ? [{ measuredAt: body.weightMeasuredAt, weightKg: body.weightKg }]
        : [];

    // One shared helper with the backfill endpoint — merge-not-skip, one range
    // query, intra-batch collapse, and unparseable timestamps rejected rather
    // than stamped `now`. See lib/body-ingest.ts for why each of those matters.
    const weights = await ingestBodySamples(samples, { source: "apple_health" });

    // These counts used to be returned and then thrown away by the client
    // (`struct AnyResponse: Decodable {}`), so nobody could tell whether a
    // weigh-in had landed. The companion decodes them now; log them too.
    if (samples.length > 0) {
      console.log(
        `[health/daily] weigh-ins: ${weights.imported} new, ${weights.merged} merged, ${weights.skipped} duplicate, ${weights.invalid} invalid`
      );
    }

    return NextResponse.json({
      ...snapshot,
      weightsImported: weights.imported,
      weightsMerged: weights.merged,
      weightsSkipped: weights.skipped,
      weightsInvalid: weights.invalid,
    });
  } catch (error) {
    console.error("Daily health snapshot sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync daily health snapshot" },
      { status: 500 }
    );
  }
}
