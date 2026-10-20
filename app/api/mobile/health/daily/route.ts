import { after, NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { recordSync } from "@/lib/notify";
import { announceWeighIn } from "@/lib/weigh-in-notice";
import { prisma } from "@/lib/prisma";
import type { IncomingBodySample } from "@/lib/body-measurements";
import { ingestBodySamples } from "@/lib/body-ingest";
import { renphoSyncEnabled, runRenphoSync } from "@/lib/renpho-sync";
import { capString, readJsonCapped } from "@/lib/request-body";

// Bounds (audit 2026-10, SEC-025). The companion sends one day: a few
// hundred bytes plus a handful of weigh-ins. The caps sit far above that.
const MAX_BODY_BYTES = 1_000_000;
const MAX_WEIGHT_SAMPLES = 500;
const MAX_RAW_PAYLOAD_BYTES = 64_000;
// "yyyy-MM-dd" from a DateFormatter that follows the device's calendar and
// numbering system — any digits, fixed shape.
const LOCAL_DATE = /^\p{Nd}{4}-\p{Nd}{2}-\p{Nd}{2}$/u;
// An IANA identifier (TimeZone.current.identifier): "America/Bogota", "Etc/GMT+5".
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

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

    const read = await readJsonCapped(request, MAX_BODY_BYTES);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
    const body = (read.value && typeof read.value === "object" ? read.value : {}) as Record<string, unknown>;
    const localDate =
      typeof body.localDate === "string" ? body.localDate.trim() : "";
    const timeZone =
      typeof body.timeZone === "string" ? body.timeZone.trim() : "";
    const source = capString(body.source, 40) ?? "apple_health";

    if (!localDate || !timeZone) {
      return NextResponse.json(
        { error: "localDate and timeZone are required" },
        { status: 400 }
      );
    }
    // They form the row's unique key, so they are checked, not trimmed.
    if (!LOCAL_DATE.test(localDate) || !TIME_ZONE.test(timeZone)) {
      return NextResponse.json(
        { error: "localDate must be yyyy-MM-dd and timeZone an IANA identifier" },
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

    const rawPayloadBytes = body.rawData == null ? 0 : Buffer.byteLength(JSON.stringify(body.rawData), "utf8");
    const rawPayload =
      rawPayloadBytes > MAX_RAW_PAYLOAD_BYTES
        ? { trimmed: true, bytes: rawPayloadBytes }
        : ((body.rawData ?? null) as object | null);

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
        // A diagnostic copy; over budget it is summarised, not stored.
        payload: rawPayload,
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
    const allSamples: WeightSample[] = Array.isArray(body.weightSamples)
      ? (body.weightSamples as WeightSample[])
      : num(body.weightKg) !== null
        ? [{ measuredAt: body.weightMeasuredAt, weightKg: body.weightKg } as WeightSample]
        : [];
    // Trim, never reject: the day still lands (SEC-025).
    const samples = allSamples.slice(0, MAX_WEIGHT_SAMPLES);

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

    // After the response: this post IS the Apple Health pipeline's heartbeat
    // (it arrives whether or not he weighed in — so its silence, not a
    // missing weigh-in, is what the system alert watches), and a fresh
    // weigh-in is announced.
    after(async () => {
      await recordSync("apple_health", { ok: true, label: "Apple Health", heartbeat: true });
      // With the RENPHO sync on, pull first and let that run announce the
      // weigh-in with its body fat — see /api/mobile/health/body.
      if (weights.imported > 0 && renphoSyncEnabled()) {
        const pulled = await runRenphoSync("apple_health");
        if (pulled.announced) return;
      }
      await announceWeighIn(weights.created);
    });

    return NextResponse.json({
      ...snapshot,
      weightsImported: weights.imported,
      weightsMerged: weights.merged,
      weightsSkipped: weights.skipped,
      weightsInvalid: weights.invalid,
      // Additive (2026-10): samples beyond the per-request cap, not read.
      ...(allSamples.length > samples.length ? { weightsTrimmed: allSamples.length - samples.length } : {}),
    });
  } catch (error) {
    console.error("Daily health snapshot sync error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Failed to sync daily health snapshot" },
      { status: 500 }
    );
  }
}
