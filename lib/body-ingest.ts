import {
  type IncomingBodySample,
  type StoredWeighIn,
  buildFillPatch,
  findNearTwin,
  normalizeBodySample,
} from "@/lib/body-measurements";
import { prisma } from "@/lib/prisma";
import { NEAR_KG, NEAR_MS } from "@/lib/vesync";

// The persistence half of the weigh-in ingest. Shared by the companion's daily
// push and the historical backfill endpoint so both behave identically.
//
// Replaces the loop that used to live inline in
// app/api/mobile/health/daily/route.ts, which had four problems:
//
//   1. N+1 — a `findFirst` per sample. 200 round trips for a 200-sample
//      backfill batch, which would simply time out.
//   2. It SKIPPED a twin instead of merging into it, so an Apple Health sample
//      carrying body fat could never enrich a row he had typed by hand. The
//      VeSync importer already got this right; this is that behaviour.
//   3. No intra-batch collapse — two samples a minute apart in the SAME post
//      both created rows, because created rows were never added to the
//      comparison set.
//   4. An unparseable `measuredAt` fell back to `new Date()`, inventing a
//      weigh-in dated today.

const COLUMNS = [
  "bodyFatPct", "bmi", "fatFreeWeightKg", "subcutaneousFatPct", "visceralFat",
  "bodyWaterPct", "skeletalMusclePct", "muscleMassKg", "boneMassKg",
  "proteinPct", "bmrKcal", "metabolicAge", "heartRateBpm",
  "neckCm", "shouldersCm", "chestCm", "armsCm", "forearmsCm", "waistCm",
  "hipsCm", "legsCm", "calvesCm",
] as const;

export interface IngestBodyResult {
  imported: number;
  merged: number;
  skipped: number;
  invalid: number;
}

export async function ingestBodySamples(
  rawSamples: readonly IncomingBodySample[],
  options: { source?: string } = {}
): Promise<IngestBodyResult> {
  const source = options.source ?? "apple_health";
  const result: IngestBodyResult = {
    imported: 0,
    merged: 0,
    skipped: 0,
    invalid: 0,
  };

  const samples = [];
  for (const raw of rawSamples) {
    const normalized = normalizeBodySample(raw);
    if (normalized) samples.push(normalized);
    else result.invalid++;
  }
  if (samples.length === 0) return result;

  // ONE range query for the whole batch (the VeSync importer's shape), not a
  // findFirst per sample.
  const times = samples.map((s) => s.measuredAt.getTime());
  const existing = await prisma.bodyMeasurement.findMany({
    where: {
      measuredAt: {
        gte: new Date(Math.min(...times) - NEAR_MS),
        lte: new Date(Math.max(...times) + NEAR_MS),
      },
      weightKg: { not: null },
    },
  });

  const stored: StoredWeighIn[] = existing.map((row) => ({
    id: row.id,
    measuredAt: row.measuredAt,
    weightKg: row.weightKg,
    fields: Object.fromEntries(
      COLUMNS.map((c) => [c, (row as unknown as Record<string, number | null>)[c]])
    ),
  }));

  for (const sample of samples) {
    const twin = findNearTwin(stored, sample, NEAR_MS, NEAR_KG);

    if (twin) {
      const patch = buildFillPatch(twin, sample);
      if (Object.keys(patch).length === 0) {
        result.skipped++;
        continue;
      }
      await prisma.bodyMeasurement.update({ where: { id: twin.id }, data: patch });
      // Keep the in-memory twin current so a later sample in this same batch
      // does not re-fill what we just wrote.
      Object.assign(twin.fields, patch);
      result.merged++;
      continue;
    }

    const created = await prisma.bodyMeasurement.create({
      data: {
        measuredAt: sample.measuredAt,
        weightKg: sample.weightKg,
        // `source` is only ever set on rows WE create. A merged twin keeps its
        // own provenance — rewriting a hand-typed row to "apple_health" would
        // falsify where the number came from.
        source,
        ...sample.fields,
      },
    });

    // Intra-batch collapse: the row we just made is now a dedup candidate.
    stored.push({
      id: created.id,
      measuredAt: created.measuredAt,
      weightKg: created.weightKg,
      fields: Object.fromEntries(
        COLUMNS.map((c) => [
          c,
          (created as unknown as Record<string, number | null>)[c],
        ])
      ),
    });
    result.imported++;
  }

  return result;
}
