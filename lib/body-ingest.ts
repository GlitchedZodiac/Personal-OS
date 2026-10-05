import type { Prisma } from "@prisma/client";
import {
  COMPOSITION_FIELDS,
  type IncomingBodySample,
  MEASURED_FIELDS,
  SEGMENTAL_FIELDS,
  type StoredWeighIn,
  TAPE_FIELDS,
  buildFillPatch,
  fieldSourcesOf,
  findNearTwin,
  normalizeBodySample,
  stampSources,
} from "@/lib/body-measurements";
import { prisma } from "@/lib/prisma";
import {
  RENPHO_SOURCE,
  type RenphoCandidateRow,
  type RenphoRecord,
  isScaleReading,
  mapRenphoRecord,
  planRenphoWrite,
} from "@/lib/renpho";
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

// Every column a weigh-in can carry besides weight — from the shared
// vocabulary, so a column added to the schema cannot be missed here.
const COLUMNS = [
  "bodyFatPct",
  ...COMPOSITION_FIELDS,
  ...SEGMENTAL_FIELDS,
  ...TAPE_FIELDS,
] as const;

export interface IngestBodyResult {
  imported: number;
  merged: number;
  skipped: number;
  invalid: number;
  /** the rows this call created — what lib/weigh-in-notice.ts announces */
  created: Array<{
    id: string;
    measuredAt: Date;
    weightKg: number | null;
    bodyFatPct: number | null;
  }>;
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
    created: [],
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
  // Per-field provenance of each stored row, kept current through the batch.
  const provenance = new Map<string, Record<string, string>>(
    existing.map((row) => [row.id, fieldSourcesOf(row)])
  );

  for (const sample of samples) {
    const twin = findNearTwin(stored, sample, NEAR_MS, NEAR_KG);

    if (twin) {
      const patch = buildFillPatch(twin, sample);
      if (Object.keys(patch).length === 0) {
        result.skipped++;
        continue;
      }
      // The row keeps its own `source`; what this sample contributed is
      // recorded per field instead.
      const fieldSources = stampSources(patch, source, provenance.get(twin.id));
      await prisma.bodyMeasurement.update({
        where: { id: twin.id },
        data: { ...patch, fieldSources },
      });
      // Keep the in-memory twin current so a later sample in this same batch
      // does not re-fill what we just wrote.
      Object.assign(twin.fields, patch);
      provenance.set(twin.id, fieldSources);
      result.merged++;
      continue;
    }

    // Belt-and-braces against CONCURRENT requests. The range query above runs
    // before another in-flight request has committed, so two racing posts of
    // the same page both see an empty window and both insert -- which is
    // exactly how 857 duplicate rows were created on 2026-08-26. The client
    // now coalesces its syncs, and this exact-match re-check (measuredAt is
    // indexed) closes most of what is left. The real fix is a unique index on
    // a HealthKit sample id; that needs a migration and is in deferred-items.
    const exact = await prisma.bodyMeasurement.findFirst({
      where: { measuredAt: sample.measuredAt, weightKg: sample.weightKg },
      select: { id: true },
    });
    if (exact) {
      result.skipped++;
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
        fieldSources: stampSources(
          { weightKg: sample.weightKg, ...sample.fields },
          source
        ),
      },
    });
    provenance.set(created.id, fieldSourcesOf(created));

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
    result.created.push({
      id: created.id,
      measuredAt: created.measuredAt,
      weightKg: created.weightKg,
      bodyFatPct: created.bodyFatPct,
    });
  }

  return result;
}

// ————————————————————————————————————————————————————————————————————————
// RENPHO cloud records. Unlike the path above, the scale's own record is
// AUTHORITATIVE for what it carries: it overwrites, where Apple Health and
// hand entry only fill blanks. The decision itself is planRenphoWrite.
// ————————————————————————————————————————————————————————————————————————

export interface IngestRenphoResult {
  fetched: number;
  created: number;
  /** Adopted another source's row, or refreshed one already imported. */
  merged: number;
  unchanged: number;
  /** Not a scale reading (a weight typed into the app) or unmappable. */
  skipped: number;
  /** Rows this pull created or adopted — what the weigh-in notice announces.
   *  A refresh of a row already imported is not news. */
  touched: Array<{ id: string; measuredAt: Date; weightKg: number | null; bodyFatPct: number | null }>;
}

type FullRow = Awaited<ReturnType<typeof prisma.bodyMeasurement.findMany>>[number];

function toCandidate(row: FullRow): RenphoCandidateRow {
  return {
    id: row.id,
    measuredAt: row.measuredAt,
    externalId: row.externalId,
    values: Object.fromEntries(
      MEASURED_FIELDS.map((f) => [f, (row as unknown as Record<string, number | null>)[f]])
    ),
    impedance: row.impedance,
    referenceRanges: row.referenceRanges,
  };
}

export async function ingestRenphoRecords(
  records: readonly RenphoRecord[]
): Promise<IngestRenphoResult> {
  const result: IngestRenphoResult = {
    fetched: records.length,
    created: 0,
    merged: 0,
    unchanged: 0,
    skipped: 0,
    touched: [],
  };
  const news = (row: FullRow) =>
    result.touched.push({
      id: row.id,
      measuredAt: row.measuredAt,
      weightKg: row.weightKg,
      bodyFatPct: row.bodyFatPct,
    });

  const mapped = [];
  for (const record of records) {
    const one = isScaleReading(record) ? mapRenphoRecord(record) : null;
    if (one) mapped.push(one);
    else result.skipped++;
  }
  if (mapped.length === 0) return result;
  mapped.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());

  const times = mapped.map((m) => m.measuredAt.getTime());
  const existing = await prisma.bodyMeasurement.findMany({
    where: {
      OR: [
        { externalId: { in: mapped.map((m) => m.externalId) } },
        {
          measuredAt: {
            gte: new Date(Math.min(...times) - NEAR_MS),
            lte: new Date(Math.max(...times) + NEAR_MS),
          },
          weightKg: { not: null },
        },
      ],
    },
  });
  const full = new Map(existing.map((row) => [row.id, row]));
  const candidates = existing.map(toCandidate);

  for (const m of mapped) {
    const plan = planRenphoWrite(m, candidates, NEAR_MS, NEAR_KG);
    const values = { weightKg: m.weightKg, ...m.fields };
    const json = {
      impedance: (m.impedance ?? undefined) as Prisma.InputJsonValue | undefined,
      referenceRanges: (m.referenceRanges ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      rawPayload: m.raw as Prisma.InputJsonValue,
    };

    if (plan.action === "unchanged") {
      result.unchanged++;
      continue;
    }

    if (plan.action === "create") {
      try {
        const created = await prisma.bodyMeasurement.create({
          data: {
            measuredAt: m.measuredAt,
            ...values,
            ...json,
            externalId: m.externalId,
            source: RENPHO_SOURCE,
            fieldSources: stampSources(values, RENPHO_SOURCE),
          },
        });
        full.set(created.id, created);
        candidates.push(toCandidate(created));
        result.created++;
        news(created);
      } catch (error) {
        // Two pulls racing: the unique index on externalId lets exactly one
        // insert through, and the loser has nothing left to do.
        if ((error as { code?: string })?.code !== "P2002") throw error;
        result.unchanged++;
      }
      continue;
    }

    // link | refresh — the scale's numbers win on what it carries; tape,
    // notes, measuredAt and the row's own `source` are not touched.
    const row = full.get(plan.rowId) as FullRow;
    const updated = await prisma.bodyMeasurement.update({
      where: { id: plan.rowId },
      data: {
        ...plan.patch,
        ...json,
        externalId: m.externalId,
        fieldSources: stampSources(values, RENPHO_SOURCE, fieldSourcesOf(row)),
      },
    });
    full.set(updated.id, updated);
    candidates[candidates.findIndex((c) => c.id === updated.id)] = toCandidate(updated);
    result.merged++;
    if (plan.action === "link") news(updated);
  }

  return result;
}
