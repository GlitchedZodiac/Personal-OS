import type { Prisma } from "@prisma/client";

// The shared vocabulary for `body_measurements`. Before this file existed, four
// separate surfaces each hardcoded their own idea of "a measurement", and every
// one of them was wrong in the same direction:
//
//   - lib/chat-tools.ts filtered `weightKg: { not: null }`, so a check-in where
//     he taped chest/arms/waist but never stepped on the scale was INVISIBLE to
//     the AI. That is the bug he reported (2026-08-26): "our AI can't read my
//     measurements even though I have them in there."
//   - the same file then projected 3 columns out of 23, so even the rows that
//     survived the filter arrived stripped.
//   - app/api/health/body/overview/route.ts had the right shape (weights and
//     tape queried separately) but its OR listed only 7 of the 9 tape dims —
//     a shoulders-only or forearms-only check-in was invisible on his own Body
//     screen too.
//
// One definition, imported everywhere, so the next column added to the schema
// cannot be silently dropped by one surface and kept by another.

/** The nine tape dimensions, in head-to-toe order (how the Body screen reads). */
export const TAPE_FIELDS = [
  "neckCm",
  "shouldersCm",
  "chestCm",
  "armsCm",
  "forearmsCm",
  "waistCm",
  "hipsCm",
  "legsCm",
  "calvesCm",
] as const;

/**
 * The twelve smart-scale columns. These arrive ONLY from the VeSync CSV import
 * or Apple Health — `POST /api/health/body` (manual + chat) cannot write them,
 * so the read path must surface fields the write path can never produce.
 */
export const COMPOSITION_FIELDS = [
  "bmi",
  "fatFreeWeightKg",
  "subcutaneousFatPct",
  "visceralFat",
  "bodyWaterPct",
  "skeletalMusclePct",
  "muscleMassKg",
  "boneMassKg",
  "proteinPct",
  "bmrKcal",
  "metabolicAge",
  "heartRateBpm",
] as const;

/** Every numeric column that constitutes "a reading". */
export const MEASURED_FIELDS = [
  "weightKg",
  "bodyFatPct",
  ...TAPE_FIELDS,
  ...COMPOSITION_FIELDS,
] as const;

export type TapeField = (typeof TAPE_FIELDS)[number];
export type CompositionField = (typeof COMPOSITION_FIELDS)[number];
export type MeasuredField = (typeof MEASURED_FIELDS)[number];

/** Human labels for the tape dims — used in AI output and CSV headers. */
export const TAPE_LABELS: Record<TapeField, string> = {
  neckCm: "neck",
  shouldersCm: "shoulders",
  chestCm: "chest",
  armsCm: "arms",
  forearmsCm: "forearms",
  waistCm: "waist",
  hipsCm: "hips",
  legsCm: "legs",
  calvesCm: "calves",
};

function orNotNull(
  fields: readonly string[]
): Prisma.BodyMeasurementWhereInput {
  return {
    OR: fields.map((f) => ({ [f]: { not: null } })) as
      Prisma.BodyMeasurementWhereInput[],
  };
}

/** Rows carrying at least one tape dimension. */
export function hasTapeWhere(): Prisma.BodyMeasurementWhereInput {
  return orNotNull(TAPE_FIELDS);
}

/**
 * Rows carrying ANY reading at all — weight, body fat, tape, or scale
 * composition. This is the correct filter for "show me my measurements";
 * `weightKg: { not: null }` is correct ONLY for a weight series.
 */
export function hasAnyMeasurementWhere(): Prisma.BodyMeasurementWhereInput {
  return orNotNull(MEASURED_FIELDS);
}

type MeasurementRow = {
  id?: string;
  measuredAt?: Date | string;
  notes?: string | null;
  source?: string | null;
  skinfoldData?: unknown;
} & Partial<Record<MeasuredField, number | null>>;

/**
 * Shape one row for the model: drop what is null, keep everything else.
 *
 * This is the answer to the 3-vs-23 problem — don't pick a subset, don't dump
 * every column. A VeSync weight-only row stays ~4 keys; a tape day emits its
 * tape. The model sees exactly what was recorded.
 *
 * The `!= null` test is load-bearing: `visceralFat: 0` and `bodyFatPct: 0` are
 * real readings and a falsy check would erase them.
 */
export function compactMeasurement(row: MeasurementRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (row.id != null) out.id = row.id;
  if (row.measuredAt != null) {
    out.measuredAt =
      row.measuredAt instanceof Date
        ? row.measuredAt.toISOString()
        : row.measuredAt;
  }
  for (const field of MEASURED_FIELDS) {
    const value = row[field];
    if (value != null) out[field] = value;
  }
  if (row.skinfoldData != null) out.skinfoldData = row.skinfoldData;
  if (row.notes != null && row.notes !== "") out.notes = row.notes;
  if (row.source != null) out.source = row.source;
  return out;
}

// ————————————————————————————————————————————————————————————————————————
// Apple Health / scale ingest — the pure decision half.
//
// Persistence lives in lib/body-ingest.ts, mirroring the split lib/vesync.ts
// already uses. These functions are what the tests drive.
// ————————————————————————————————————————————————————————————————————————

/** One weigh-in as it arrives off the wire, before validation. */
export interface IncomingBodySample {
  measuredAt?: unknown;
  weightKg?: unknown;
  [field: string]: unknown;
}

export interface NormalizedBodySample {
  measuredAt: Date;
  weightKg: number;
  fields: Record<string, number>;
}

/** Fields a weigh-in may carry besides weight. Superset of the tape dims and
 *  the scale composition columns, so one shape serves HealthKit and VeSync. */
const FILLABLE_FIELDS: readonly string[] = [
  "bodyFatPct",
  ...COMPOSITION_FIELDS,
  ...TAPE_FIELDS,
];

const INT_FIELDS = new Set([
  "visceralFat", "bmrKcal", "metabolicAge", "heartRateBpm",
]);

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate one incoming sample. Returns null when it cannot be stored.
 *
 * The `measuredAt` rule is the important one: the old daily route fell back to
 * `new Date()` when the timestamp did not parse, which is harmless at one
 * sample a day but would FABRICATE hundreds of today-dated weigh-ins during a
 * historical backfill. An unparseable timestamp is now a rejection.
 */
export function normalizeBodySample(
  raw: IncomingBodySample
): NormalizedBodySample | null {
  const weightKg = finiteNumber(raw.weightKg);
  if (weightKg === null || weightKg <= 0) return null;

  if (typeof raw.measuredAt !== "string" && !(raw.measuredAt instanceof Date)) {
    return null;
  }
  const measuredAt =
    raw.measuredAt instanceof Date ? raw.measuredAt : new Date(raw.measuredAt);
  if (!Number.isFinite(measuredAt.getTime())) return null;

  const fields: Record<string, number> = {};
  for (const field of FILLABLE_FIELDS) {
    const value = finiteNumber(raw[field]);
    if (value === null) continue;
    fields[field] = INT_FIELDS.has(field) ? Math.round(value) : value;
  }

  return { measuredAt, weightKg, fields };
}

export interface StoredWeighIn {
  id: string;
  measuredAt: Date;
  weightKg: number | null;
  fields: Record<string, number | null>;
}

/**
 * Same weigh-in? Within ±10 min and ±0.3 kg. Deliberately source-agnostic:
 * he often weighs on the scale and the number reaches us twice (Apple Health
 * and the VeSync CSV), and those must collapse.
 */
export function findNearTwin(
  stored: readonly StoredWeighIn[],
  sample: NormalizedBodySample,
  nearMs: number,
  nearKg: number
): StoredWeighIn | null {
  return (
    stored.find(
      (row) =>
        row.weightKg != null &&
        Math.abs(row.measuredAt.getTime() - sample.measuredAt.getTime()) <= nearMs &&
        Math.abs(row.weightKg - sample.weightKg) <= nearKg
    ) ?? null
  );
}

/**
 * Which columns the incoming sample can contribute to an existing row.
 * Only fills blanks — a stored value is never overwritten, so a number he
 * typed himself always wins over one the scale inferred.
 */
export function buildFillPatch(
  twin: StoredWeighIn,
  sample: NormalizedBodySample
): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const [field, value] of Object.entries(sample.fields)) {
    if (twin.fields[field] == null) patch[field] = value;
  }
  return patch;
}

/** Unit suffix per column, for human-readable one-liners. */
const FIELD_UNITS: Record<MeasuredField, string> = {
  weightKg: "kg",
  bodyFatPct: "% BF",
  neckCm: "cm",
  shouldersCm: "cm",
  chestCm: "cm",
  armsCm: "cm",
  forearmsCm: "cm",
  waistCm: "cm",
  hipsCm: "cm",
  legsCm: "cm",
  calvesCm: "cm",
  bmi: " BMI",
  fatFreeWeightKg: "kg lean",
  subcutaneousFatPct: "% subcut",
  visceralFat: " visceral",
  bodyWaterPct: "% water",
  skeletalMusclePct: "% skeletal muscle",
  muscleMassKg: "kg muscle",
  boneMassKg: "kg bone",
  proteinPct: "% protein",
  bmrKcal: " kcal BMR",
  metabolicAge: " metabolic age",
  heartRateBpm: " bpm",
};

const NAMED_FIELDS = new Set<MeasuredField>([
  ...TAPE_FIELDS,
]);

/**
 * One human-readable line of whatever the row actually holds, e.g.
 * `82.1kg, 18.2% BF, waist 86cm, chest 104cm`. Returns "" for an empty row.
 * Uses `!= null` so a genuine 0 survives.
 */
export function describeMeasurement(row: MeasurementRow): string {
  const parts: string[] = [];
  for (const field of MEASURED_FIELDS) {
    const value = row[field];
    if (value == null) continue;
    const unit = FIELD_UNITS[field];
    parts.push(
      NAMED_FIELDS.has(field)
        ? `${TAPE_LABELS[field as TapeField]} ${value}${unit}`
        : `${value}${unit}`
    );
  }
  return parts.join(", ");
}

export interface TapeTrendEntry {
  field: TapeField;
  label: string;
  latest: number;
  latestAt: string;
  previous: number | null;
  previousAt: string | null;
  deltaCm: number | null;
  /** Set when the change is too large to be real — see IMPLAUSIBLE_TAPE_DELTA. */
  suspectMethodChange?: true;
}

/**
 * A tape delta larger than this fraction of the reading is almost certainly a
 * changed measuring convention or a typo, not a body that changed.
 *
 * Found in his real data 2026-08-26: shoulders read 118.5 cm on an older
 * check-in and 50.9 cm on the newest, whose note says "Shoulder width:
 * 50.9 cm" — circumference vs width. Arithmetically the delta is -67.6 cm; as
 * a statement about his body it is nonsense. Annotating beats hiding: the row
 * still carries both numbers and both dates, and the flag stops the assistant
 * confidently announcing that his shoulders shrank by two thirds.
 */
export const IMPLAUSIBLE_TAPE_DELTA = 0.2;

/**
 * Latest + previous + delta for each tape dimension, from rows ordered newest
 * first. Each dim walks the history independently — he does not tape every
 * dimension on every check-in, so "previous chest" may be three check-ins back
 * while "previous waist" is the last one.
 */
export function buildTapeTrend(rows: MeasurementRow[]): TapeTrendEntry[] {
  const out: TapeTrendEntry[] = [];
  for (const field of TAPE_FIELDS) {
    const seen = rows
      .filter((r) => r[field] != null)
      .map((r) => ({
        value: r[field] as number,
        at:
          r.measuredAt instanceof Date
            ? r.measuredAt.toISOString().slice(0, 10)
            : String(r.measuredAt ?? "").slice(0, 10),
      }));
    if (seen.length === 0) continue;
    const [latest, previous] = seen;
    const deltaCm =
      previous != null
        ? Math.round((latest.value - previous.value) * 10) / 10
        : null;
    const suspect =
      deltaCm != null &&
      previous != null &&
      previous.value > 0 &&
      Math.abs(deltaCm) / previous.value > IMPLAUSIBLE_TAPE_DELTA;

    out.push({
      field,
      label: TAPE_LABELS[field],
      latest: latest.value,
      latestAt: latest.at,
      previous: previous?.value ?? null,
      previousAt: previous?.at ?? null,
      deltaCm,
      ...(suspect ? { suspectMethodChange: true as const } : {}),
    });
  }
  return out;
}
