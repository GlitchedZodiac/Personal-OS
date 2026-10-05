import { INT_FIELDS } from "@/lib/body-measurements";
import type { Impedance } from "@/lib/renpho";
import { zonedLocalDateTimeToUtc } from "@/lib/timezone";

// A RENPHO report, uploaded as a PDF or a screenshot — the pure half.
//
// Why this exists: the scale's cloud can be read directly (lib/renpho-sync.ts)
// but every login with his account signs his phone's RENPHO app out, so that
// pull stays switched off. The report the app exports carries the same
// numbers. A model reads them off the page (app/api/health/body/report), and
// this file decides what to trust: it bounds every value, checks the report's
// own arithmetic against itself, and works out which stored weigh-in the
// report belongs to. Nothing here saves — he confirms first.

export const REPORT_SOURCE = "renpho_report";

const SEGMENTS = ["leftArm", "rightArm", "trunk", "leftLeg", "rightLeg"] as const;
type Segment = (typeof SEGMENTS)[number];

export interface ExtractedReport {
  /** False when the page is cropped, blurred, or not a body-composition report. */
  legible: boolean;
  /** The date exactly as printed, e.g. "4/10/2026". Which number is the day
   *  is decided by resolveReportDay, not by the model. */
  measuredOnPrinted: string | null;
  measuredTime: string | null;
  reportId: string | null;
  weightUnit: "kg" | "lb";
  weight: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  fatMass: number | null;
  fatFreeMass: number | null;
  muscleMass: number | null;
  muscleMassPct: number | null;
  skeletalMuscle: number | null;
  skeletalMusclePct: number | null;
  smi: number | null;
  bodyWater: number | null;
  bodyWaterPct: number | null;
  protein: number | null;
  proteinPct: number | null;
  boneMass: number | null;
  visceralFat: number | null;
  subcutaneousFatPct: number | null;
  bmr: number | null;
  metabolicAge: number | null;
  whr: number | null;
  segments: Record<
    Segment,
    {
      muscle: number | null; musclePct: number | null; muscleStd: number | null;
      fat: number | null; fatPct: number | null; fatStd: number | null;
    }
  >;
  impedance: Record<"z20" | "z100", Record<Segment, number | null>>;
}

const NUM = { type: ["number", "null"] } as const;
const segmentSchema = {
  type: "object",
  properties: {
    muscle: { ...NUM, description: "Muscle mass of this segment (first line, a mass)" },
    musclePct: { ...NUM, description: "Compared to standard value, a percent, e.g. 121.8" },
    muscleStd: { ...NUM, description: "The standard value for this segment's muscle (a mass), if printed" },
    fat: { ...NUM, description: "Body fat mass of this segment (first line, a mass)" },
    fatPct: { ...NUM, description: "Compared to standard value, a percent, e.g. 63.2" },
    fatStd: { ...NUM, description: "The standard value for this segment's fat (a mass), if printed" },
  },
  required: ["muscle", "musclePct", "muscleStd", "fat", "fatPct", "fatStd"],
  additionalProperties: false,
} as const;
const impedanceSchema = {
  type: "object",
  properties: Object.fromEntries(SEGMENTS.map((s) => [s, NUM])),
  required: [...SEGMENTS],
  additionalProperties: false,
} as const;

/** Strict output schema for the model. Every value is "as printed, or null". */
export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    legible: {
      type: "boolean",
      description: "False if this is not a body-composition report or the numbers cannot be read with confidence",
    },
    measuredOnPrinted: {
      type: ["string", "null"],
      description: "The test/measurement DATE copied character for character as printed (e.g. \"4/10/2026\"). Do not reorder or reinterpret it. Null if not printed.",
    },
    measuredTime: { type: ["string", "null"], description: "Measurement time converted to 24-hour HH:MM, null if not printed" },
    reportId: { type: ["string", "null"], description: "Report number/ID if printed" },
    weightUnit: { type: "string", enum: ["kg", "lb"], description: "Unit the masses are printed in" },
    weight: NUM,
    bodyFatPct: NUM,
    bmi: NUM,
    fatMass: { ...NUM, description: "Body fat mass" },
    fatFreeMass: { ...NUM, description: "Fat-free (lean) body mass" },
    muscleMass: { ...NUM, description: "Muscle mass (all muscle, not just skeletal)" },
    muscleMassPct: NUM,
    skeletalMuscle: { ...NUM, description: "Skeletal muscle mass (SMM)" },
    skeletalMusclePct: NUM,
    smi: { ...NUM, description: "Skeletal muscle index, kg/m²" },
    bodyWater: { ...NUM, description: "Body water as a MASS" },
    bodyWaterPct: NUM,
    protein: { ...NUM, description: "Protein as a MASS" },
    proteinPct: NUM,
    boneMass: NUM,
    visceralFat: { ...NUM, description: "Visceral fat level/grade" },
    subcutaneousFatPct: NUM,
    bmr: { ...NUM, description: "Basal metabolic rate, kcal" },
    metabolicAge: { ...NUM, description: "Metabolic / body age, years" },
    whr: { ...NUM, description: "Waist-to-hip ratio" },
    segments: {
      type: "object",
      description: "Segmental analysis. LEFT and RIGHT are the SUBJECT's left and right, as labelled on the report.",
      properties: Object.fromEntries(SEGMENTS.map((s) => [s, segmentSchema])),
      required: [...SEGMENTS],
      additionalProperties: false,
    },
    impedance: {
      type: "object",
      description: "Impedance in ohms per segment at 20 kHz and 100 kHz, if the report prints it",
      properties: { z20: impedanceSchema, z100: impedanceSchema },
      required: ["z20", "z100"],
      additionalProperties: false,
    },
  },
  required: [
    "legible", "measuredOnPrinted", "measuredTime", "reportId", "weightUnit", "weight", "bodyFatPct", "bmi",
    "fatMass", "fatFreeMass", "muscleMass", "muscleMassPct", "skeletalMuscle", "skeletalMusclePct", "smi",
    "bodyWater", "bodyWaterPct", "protein", "proteinPct", "boneMass", "visceralFat", "subcutaneousFatPct",
    "bmr", "metabolicAge", "whr", "segments", "impedance",
  ],
  additionalProperties: false,
} as const;

export const REPORT_PROMPT =
  "You transcribe body-composition reports from a RENPHO smart scale. Copy every number EXACTLY as printed — " +
  "never estimate, never compute a value the page does not show, never fill a gap from another field. " +
  "A value that is not printed, is cut off, or is not clearly readable is null. " +
  "Masses go in the unit printed (say which in weightUnit). Percentages are the number without the sign. " +
  "Left and right are the subject's own, as the report labels them. " +
  "Reference ranges, targets, scores and verdicts (High/Normal/Low) are not readings — ignore them.";

/** Where each extracted value lands, whether it is a mass, and what a
 *  plausible adult reading looks like. Out-of-range values are dropped. */
const FIELDS: readonly { from: keyof ExtractedReport; to: string; mass: boolean; min: number; max: number }[] = [
  { from: "bodyFatPct", to: "bodyFatPct", mass: false, min: 2, max: 70 },
  { from: "bmi", to: "bmi", mass: false, min: 10, max: 80 },
  { from: "fatMass", to: "fatMassKg", mass: true, min: 1, max: 200 },
  { from: "fatFreeMass", to: "fatFreeWeightKg", mass: true, min: 20, max: 200 },
  { from: "muscleMass", to: "muscleMassKg", mass: true, min: 15, max: 150 },
  { from: "muscleMassPct", to: "muscleMassPct", mass: false, min: 20, max: 98 },
  { from: "skeletalMuscle", to: "skeletalMuscleKg", mass: true, min: 8, max: 100 },
  { from: "skeletalMusclePct", to: "skeletalMusclePct", mass: false, min: 15, max: 70 },
  { from: "smi", to: "smi", mass: false, min: 3, max: 20 },
  { from: "bodyWater", to: "bodyWaterKg", mass: true, min: 10, max: 150 },
  { from: "bodyWaterPct", to: "bodyWaterPct", mass: false, min: 25, max: 85 },
  { from: "protein", to: "proteinKg", mass: true, min: 3, max: 50 },
  { from: "proteinPct", to: "proteinPct", mass: false, min: 5, max: 35 },
  { from: "boneMass", to: "boneMassKg", mass: true, min: 1, max: 10 },
  { from: "visceralFat", to: "visceralFat", mass: false, min: 1, max: 59 },
  { from: "subcutaneousFatPct", to: "subcutaneousFatPct", mass: false, min: 1, max: 60 },
  { from: "bmr", to: "bmrKcal", mass: false, min: 600, max: 5000 },
  { from: "metabolicAge", to: "metabolicAge", mass: false, min: 10, max: 100 },
  { from: "whr", to: "whrEstimate", mass: false, min: 0.5, max: 1.5 },
];

const SEGMENT_COLUMNS: Record<Segment, { muscle: string; fat: string; label: string }> = {
  leftArm: { muscle: "muscleLeftArmKg", fat: "fatLeftArmKg", label: "left arm" },
  rightArm: { muscle: "muscleRightArmKg", fat: "fatRightArmKg", label: "right arm" },
  trunk: { muscle: "muscleTrunkKg", fat: "fatTrunkKg", label: "trunk" },
  leftLeg: { muscle: "muscleLeftLegKg", fat: "fatLeftLegKg", label: "left leg" },
  rightLeg: { muscle: "muscleRightLegKg", fat: "fatRightLegKg", label: "right leg" },
};

const LB = 0.45359237;
const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export interface ReportReading {
  /** Local calendar day printed on the report, or null. */
  day: string | null;
  /** "HH:MM" when the report prints a time. */
  time: string | null;
  measuredAt: Date | null;
  weightKg: number | null;
  /** Every other column, keyed by body_measurements column. */
  fields: Record<string, number>;
  impedance: Impedance | null;
  /** Segment standards, back-computed from kg and "% of standard", so the
   *  body map can shade a report the same way it shades a cloud record. */
  referenceRanges: Record<string, { std: number }> | null;
  reportId: string | null;
  /** Plain sentences about anything dropped or inconsistent. */
  warnings: string[];
}

/**
 * Turn the model's transcription into something safe to show and save.
 *
 * A transcription can be wrong in ways a person would not notice at a glance:
 * a dropped decimal, two neighbouring cells swapped. So each value must be
 * plausible on its own, and the report must agree with itself — its fat mass
 * with its weight and fat percentage, its BMR with its lean mass. A failed
 * check does not block the save; it puts a sentence in front of him.
 */
export function normalizeReport(
  raw: ExtractedReport,
  opts: {
    timeZone: string;
    heightM?: number | null;
    now?: Date;
    /** The day to use, when the caller has resolved an ambiguous printed date. */
    day?: string | null;
  }
): ReportReading {
  const warnings: string[] = [];
  const toKg = (v: number) => (raw.weightUnit === "lb" ? round2(v * LB) : v);

  let weightKg = finite(raw.weight);
  if (weightKg !== null) weightKg = toKg(weightKg);
  if (weightKg !== null && (weightKg < 25 || weightKg > 300)) {
    warnings.push(`Weight read as ${weightKg} kg, which is not believable — left out.`);
    weightKg = null;
  }

  const fields: Record<string, number> = {};
  for (const f of FIELDS) {
    let value = finite(raw[f.from]);
    if (value === null) continue;
    if (f.mass) value = toKg(value);
    if (value < f.min || value > f.max) {
      warnings.push(`${f.to} read as ${value}, outside ${f.min}–${f.max} — left out.`);
      continue;
    }
    fields[f.to] = INT_FIELDS.has(f.to) ? Math.round(value) : value;
  }

  const referenceRanges: Record<string, { std: number }> = {};
  for (const segment of SEGMENTS) {
    const seg = raw.segments?.[segment];
    const cols = SEGMENT_COLUMNS[segment];
    for (const [kind, column, max] of [["muscle", cols.muscle, 80], ["fat", cols.fat, 80]] as const) {
      let kg = finite(seg?.[kind]);
      if (kg === null) continue;
      kg = toKg(kg);
      if (kg <= 0 || kg > max) {
        warnings.push(`${cols.label} ${kind} read as ${kg} kg — left out.`);
        continue;
      }
      fields[column] = kg;
      // The report prints each segment's standard; when it is unreadable the
      // percentage beside it gives the same number.
      const printed = finite(seg?.[`${kind}Std` as "muscleStd" | "fatStd"]);
      const pct = finite(seg?.[`${kind}Pct` as "musclePct" | "fatPct"]);
      if (printed !== null && printed > 0 && printed <= max) {
        referenceRanges[column] = { std: toKg(printed) };
      } else if (pct !== null && pct >= 20 && pct <= 400) {
        referenceRanges[column] = { std: Math.round((kg / (pct / 100)) * 1000) / 1000 };
      }
    }
  }

  const impedance: Impedance = { z20: {}, z100: {} };
  for (const band of ["z20", "z100"] as const) {
    for (const segment of SEGMENTS) {
      const ohms = finite(raw.impedance?.[band]?.[segment]);
      if (ohms !== null && ohms > 1 && ohms < 2000) impedance[band][segment] = ohms;
    }
  }
  const hasImpedance = Object.keys(impedance.z20).length + Object.keys(impedance.z100).length > 0;

  // The three masses the cloud record also has to derive — fill them only
  // where the report did not print them, the same way lib/renpho.ts does.
  if (weightKg !== null) {
    if (fields.fatMassKg == null && fields.fatFreeWeightKg != null) {
      fields.fatMassKg = round2(weightKg - fields.fatFreeWeightKg);
    }
    if (fields.bodyWaterKg == null && fields.bodyWaterPct != null) {
      fields.bodyWaterKg = round2((fields.bodyWaterPct * weightKg) / 100);
    }
    if (fields.proteinKg == null && fields.proteinPct != null) {
      fields.proteinKg = round2((fields.proteinPct * weightKg) / 100);
    }
    // The PDF prints these four as masses only; the cloud record carries the
    // percentage too. Filled here so a row reads the same whichever way the
    // reading arrived.
    const pctOf = (kg: number | undefined) =>
      kg != null ? Math.round((kg / (weightKg as number)) * 1000) / 10 : undefined;
    for (const [kgField, pctField] of [
      ["bodyWaterKg", "bodyWaterPct"], ["proteinKg", "proteinPct"],
      ["skeletalMuscleKg", "skeletalMusclePct"], ["muscleMassKg", "muscleMassPct"],
    ] as const) {
      const pct = pctOf(fields[kgField]);
      if (fields[pctField] == null && pct != null) fields[pctField] = pct;
    }
  }

  // Does the report agree with itself?
  const disagree = (what: string, a: number | undefined, b: number | null, tolerance: number) => {
    if (a == null || b == null) return;
    if (Math.abs(a - b) > tolerance) {
      warnings.push(`${what} do not agree (${a} against ${round2(b)}) — check both before saving.`);
    }
  };
  if (weightKg !== null) {
    disagree("Fat mass and body fat %", fields.fatMassKg, fields.bodyFatPct != null ? (weightKg * fields.bodyFatPct) / 100 : null, 0.4);
    disagree("Fat-free mass and fat mass", fields.fatFreeWeightKg, fields.fatMassKg != null ? weightKg - fields.fatMassKg : null, 0.4);
    disagree("Body water kg and %", fields.bodyWaterKg, fields.bodyWaterPct != null ? (weightKg * fields.bodyWaterPct) / 100 : null, 0.6);
    disagree("Protein kg and %", fields.proteinKg, fields.proteinPct != null ? (weightKg * fields.proteinPct) / 100 : null, 0.4);
    disagree("Skeletal muscle kg and %", fields.skeletalMuscleKg, fields.skeletalMusclePct != null ? (weightKg * fields.skeletalMusclePct) / 100 : null, 0.6);
    if (opts.heightM) disagree("BMI and weight", fields.bmi, weightKg / (opts.heightM * opts.heightM), 0.4);
  }
  // Katch-McArdle, which is what this scale reports as BMR.
  disagree("BMR and fat-free mass", fields.bmrKcal, fields.fatFreeWeightKg != null ? 370 + 21.6 * fields.fatFreeWeightKg : null, 30);

  const day = opts.day !== undefined ? opts.day : (reportDayCandidates(raw.measuredOnPrinted)[0] ?? null);
  const timeMatch = raw.measuredTime?.match(/^([01]?\d|2[0-3]):([0-5]\d)$/) ?? null;
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : null;
  let measuredAt: Date | null = null;
  if (day) {
    // No time printed → midday, so the reading sits on the right calendar day
    // in any time zone he is likely to be in.
    measuredAt = zonedLocalDateTimeToUtc(
      day,
      opts.timeZone,
      timeMatch ? Number(timeMatch[1]) : 12,
      timeMatch ? Number(timeMatch[2]) : 0
    );
    const now = opts.now ?? new Date();
    if (measuredAt.getTime() > now.getTime() + 36 * 3600_000) {
      warnings.push(`The report is dated ${day}, which is in the future — check the date.`);
    }
  } else {
    warnings.push("No date could be read from the report; it will be saved as taken now.");
  }

  return {
    day,
    time,
    measuredAt,
    weightKg,
    fields,
    impedance: hasImpedance ? impedance : null,
    referenceRanges: Object.keys(referenceRanges).length > 0 ? referenceRanges : null,
    reportId: raw.reportId?.trim() || null,
    warnings,
  };
}

// ——— the printed date ——————————————————————————————————————————————————————

const isDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Every calendar day a printed date could mean, most likely first.
 *
 * His report prints "4/10/2026" for the fourth of October. Read month-first
 * that is the tenth of April, six months wrong — and a model asked for an ISO
 * date picks one silently. So the model copies the characters and this
 * returns both readings, day-first leading because that is what his app
 * prints; resolveReportDay then asks the weigh-ins themselves which is true.
 */
export function reportDayCandidates(printed: string | null | undefined): string[] {
  if (!printed) return [];
  const text = printed.trim();
  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    return isDay(y, m, d) ? [iso(y, m, d)] : [];
  }
  const parts = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!parts) return [];
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  const y = parts[3].length === 2 ? 2000 + Number(parts[3]) : Number(parts[3]);
  const out: string[] = [];
  if (isDay(y, b, a)) out.push(iso(y, b, a)); // day first
  if (a !== b && isDay(y, a, b)) out.push(iso(y, a, b)); // month first
  return out;
}

/**
 * Pick the day. A candidate that already holds a weigh-in of this weight wins
 * outright — the scale's own reading is the best witness to its date. Failing
 * that, a day in the future is ruled out, and day-first stands.
 */
export function resolveReportDay(
  candidates: readonly string[],
  hasMatchingWeighIn: (day: string) => boolean,
  today: string
): { day: string | null; ambiguous: boolean } {
  if (candidates.length === 0) return { day: null, ambiguous: false };
  if (candidates.length === 1) return { day: candidates[0], ambiguous: false };
  const witnessed = candidates.filter(hasMatchingWeighIn);
  if (witnessed.length === 1) return { day: witnessed[0], ambiguous: false };
  const past = candidates.filter((d) => d <= today);
  if (past.length === 1) return { day: past[0], ambiguous: false };
  return { day: (past[0] ?? candidates[0]), ambiguous: true };
}

// ——— which weigh-in does it belong to? ——————————————————————————————————————

export interface ReportCandidateRow {
  id: string;
  measuredAt: Date;
  /** His local calendar day for that reading. */
  day: string;
  weightKg: number | null;
  values: Record<string, number | null>;
}

export type ReportPlan =
  | { action: "create" }
  | { action: "join"; rowId: string; patch: Record<string, number>; adds: number; corrects: number };

/**
 * The report describes one weigh-in, and that weigh-in is usually already in
 * Pitaya — Apple Health relays the weight within seconds. Find it rather than
 * drawing a second point on the chart:
 *
 *  - with a printed time: the stored reading within ±nearMs and ±nearKg;
 *  - with only a date: the reading that same local day whose weight matches.
 *
 * The scale's report is authoritative for what it carries, exactly like its
 * cloud record: it fills blanks and corrects disagreements, and never touches
 * tape, notes, or the stored weight and time.
 */
export function planReportWrite(
  reading: ReportReading,
  rows: readonly ReportCandidateRow[],
  nearMs: number,
  nearKg: number
): ReportPlan {
  if (reading.weightKg === null) return { action: "create" };
  const weight = reading.weightKg;
  const sameWeight = rows.filter((r) => r.weightKg != null && Math.abs(r.weightKg - weight) <= nearKg);

  let twin: ReportCandidateRow | undefined;
  if (reading.measuredAt && reading.time) {
    const at = reading.measuredAt.getTime();
    twin = sameWeight
      .filter((r) => Math.abs(r.measuredAt.getTime() - at) <= nearMs)
      .sort((a, b) => Math.abs(a.measuredAt.getTime() - at) - Math.abs(b.measuredAt.getTime() - at))[0];
  }
  if (!twin && reading.day) {
    twin = sameWeight
      .filter((r) => r.day === reading.day)
      .sort((a, b) => Math.abs((a.weightKg as number) - weight) - Math.abs((b.weightKg as number) - weight))[0];
  }
  if (!twin) return { action: "create" };

  const patch: Record<string, number> = {};
  let adds = 0;
  let corrects = 0;
  for (const [field, value] of Object.entries(reading.fields)) {
    const stored = twin.values[field];
    if (stored === value) continue;
    patch[field] = value;
    if (stored == null) adds++;
    else corrects++;
  }
  return { action: "join", rowId: twin.id, patch, adds, corrects };
}

// ——— how the confirm card lays it out ——————————————————————————————————————

export interface ReviewLine {
  label: string;
  value: string;
}
export interface ReviewGroup {
  title: string;
  lines: ReviewLine[];
}

const WHOLE_BODY: readonly [string, string, string][] = [
  ["bodyFatPct", "Body fat", "%"], ["fatMassKg", "Fat mass", "kg"], ["fatFreeWeightKg", "Fat-free mass", "kg"],
  ["muscleMassKg", "Muscle mass", "kg"], ["skeletalMuscleKg", "Skeletal muscle", "kg"], ["smi", "SMI", ""],
  ["bodyWaterKg", "Water", "kg"], ["proteinKg", "Protein", "kg"], ["boneMassKg", "Bone", "kg"],
  ["visceralFat", "Visceral fat", ""], ["subcutaneousFatPct", "Subcutaneous fat", "%"], ["bmrKcal", "BMR", "kcal"],
  ["bmi", "BMI", ""], ["metabolicAge", "Metabolic age", "yr"], ["whrEstimate", "Waist-hip (estimate)", ""],
];

/** The reading as the groups the confirm card shows — only what was read. */
export function reviewGroups(reading: ReportReading): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  const whole: ReviewLine[] = [];
  if (reading.weightKg !== null) whole.push({ label: "Weight", value: `${reading.weightKg} kg` });
  for (const [column, label, unit] of WHOLE_BODY) {
    const v = reading.fields[column];
    if (v != null) whole.push({ label, value: `${v}${unit ? ` ${unit}` : ""}` });
  }
  if (whole.length) groups.push({ title: "WHOLE BODY", lines: whole });

  for (const kind of ["muscle", "fat"] as const) {
    const lines: ReviewLine[] = [];
    for (const segment of SEGMENTS) {
      const column = SEGMENT_COLUMNS[segment][kind];
      const kg = reading.fields[column];
      if (kg == null) continue;
      const std = reading.referenceRanges?.[column]?.std;
      const pct = std ? ` · ${Math.round((kg / std) * 100)}% of std` : "";
      const label = SEGMENT_COLUMNS[segment].label;
      lines.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value: `${kg} kg${pct}` });
    }
    if (lines.length) groups.push({ title: kind === "muscle" ? "SEGMENTAL MUSCLE" : "SEGMENTAL FAT", lines });
  }

  if (reading.impedance) {
    // Every ohm is shown, in the report's own column order: impedance has no
    // other number to be checked against, so the only check is his eye.
    const order: Segment[] = ["rightArm", "leftArm", "trunk", "rightLeg", "leftLeg"];
    const lines: ReviewLine[] = [];
    for (const band of ["z20", "z100"] as const) {
      const values = order.map((s) => reading.impedance![band][s]);
      if (values.some((v) => v != null)) {
        lines.push({
          label: band === "z20" ? "20 kHz" : "100 kHz",
          value: values.map((v) => (v != null ? String(v) : "–")).join(" · "),
        });
      }
    }
    if (lines.length) groups.push({ title: "IMPEDANCE · R ARM · L ARM · TRUNK · R LEG · L LEG", lines });
  }
  return groups;
}

/** How many readings the report yielded — the number on the Save button. */
export function readingCount(reading: ReportReading): number {
  const impedance = reading.impedance
    ? Object.keys(reading.impedance.z20).length + Object.keys(reading.impedance.z100).length
    : 0;
  return (reading.weightKg !== null ? 1 : 0) + Object.keys(reading.fields).length + impedance;
}
