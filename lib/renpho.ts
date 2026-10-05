import crypto from "node:crypto";
import { INT_FIELDS } from "@/lib/body-measurements";

// RENPHO Health cloud — the pure half: wire encoding and the mapping from one
// of their measurement records to a body_measurements row. The network half is
// lib/renpho-client.ts; persistence is lib/body-ingest.ts.
//
// There is no official API. This follows the calls the unofficial `renpho-py`
// client (1.2.0) makes against cloud.renpho.com, verified against Michael's
// own account on 2026-10-04: every number on that day's PDF report — segmental
// masses and both impedance sweeps included — came back from the API to the
// digit. See docs/renpho-gap-report.md.

export const RENPHO_SOURCE = "renpho_api";

// Every request and response body is AES-128-ECB under this fixed key, which
// ships inside their app. It is obfuscation, not secrecy: TLS is what protects
// the password in transit.
const WIRE_KEY = Buffer.from("ed*wijdi$h6fe3ew", "utf8");

export function encryptBody(payload: Buffer): string {
  const cipher = crypto.createCipheriv("aes-128-ecb", WIRE_KEY, null);
  return Buffer.concat([cipher.update(payload), cipher.final()]).toString("base64");
}

export function decryptBody(base64: string): unknown {
  const decipher = crypto.createDecipheriv("aes-128-ecb", WIRE_KEY, null);
  const text = Buffer.concat([
    decipher.update(Buffer.from(base64, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return parseRenphoJson(text);
}

/**
 * JSON.parse that keeps RENPHO's ids intact.
 *
 * Their user and record ids are 19-digit integers, past
 * Number.MAX_SAFE_INTEGER. A plain parse rounds them — 6071354294872801152
 * becomes …801000 — and every later query then asks for a user who does not
 * exist and gets an empty, perfectly successful answer. That is how the first
 * pull returned zero rows. Any bare integer of 16+ digits is quoted before
 * parsing; digits inside string values are left alone.
 */
export function parseRenphoJson(text: string): unknown {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      // Copy a string literal through untouched, honouring escapes.
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j++;
      const token = text.slice(i, j);
      out += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

export type RenphoRecord = Record<string, unknown>;

export interface Impedance {
  z20: Record<string, number>;
  z100: Record<string, number>;
}

export interface ReferenceRange {
  min?: number;
  max?: number;
  std?: number;
}

export interface MappedRenphoRecord {
  externalId: string;
  measuredAt: Date;
  weightKg: number;
  /** Composition + segmental columns, keyed by body_measurements column. */
  fields: Record<string, number>;
  impedance: Impedance | null;
  referenceRanges: Record<string, ReferenceRange> | null;
  raw: RenphoRecord;
}

/** RENPHO sends 0 (or "") for "not measured". A real reading is positive. */
function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Their field → our column, for values that map one to one. Units were
 *  confirmed against the report: `sinew` is muscle mass in kg, `muscle` is
 *  SKELETAL muscle as a percentage, `bone` is kg (renpho-py labels it %). */
const DIRECT: Record<string, string> = {
  bodyfat: "bodyFatPct",
  bmi: "bmi",
  fatFreeWeight: "fatFreeWeightKg",
  sinew: "muscleMassKg",
  sinewRatio: "muscleMassPct",
  muscle: "skeletalMusclePct",
  smmMass: "skeletalMuscleKg",
  smi: "smi",
  water: "bodyWaterPct",
  protein: "proteinPct",
  bone: "boneMassKg",
  visfat: "visceralFat",
  subfat: "subcutaneousFatPct",
  bmr: "bmrKcal",
  bodyage: "metabolicAge",
  whr: "whrEstimate",
  laMuscleMass: "muscleLeftArmKg",
  raMuscleMass: "muscleRightArmKg",
  tMuscleMass: "muscleTrunkKg",
  llMuscleMass: "muscleLeftLegKg",
  rlMuscleMass: "muscleRightLegKg",
  laBodyFatMass: "fatLeftArmKg",
  raBodyFatMass: "fatRightArmKg",
  tBodyFatMass: "fatTrunkKg",
  llBodyFatMass: "fatLeftLegKg",
  rlBodyFatMass: "fatRightLegKg",
};

const IMPEDANCE_KEYS: Record<string, string> = {
  HandR: "rightArm",
  HandL: "leftArm",
  Body: "trunk",
  FootR: "rightLeg",
  FootL: "leftLeg",
};

/** Our column → their min / max / std field names. BMI is left out on purpose:
 *  they send bmiMin 25 / bmiMax 30 for him, which is the band he falls in, not
 *  a normal range, and drawing it as one would be a lie. It stays in the raw
 *  payload until its meaning is confirmed. */
const RANGES: Record<string, { min?: string; max?: string; std?: string }> = {
  weightKg: { min: "weightMin", max: "weightMax", std: "weightStd" },
  bodyFatPct: { min: "bfpMin", max: "bfpMax", std: "bfpStd" },
  fatMassKg: { min: "bfmMin", max: "bfmMax", std: "bfmStd" },
  muscleMassKg: { min: "muscleMassMin", max: "muscleMassMax" },
  skeletalMuscleKg: { min: "smmMin", max: "smmMax", std: "smmStd" },
  bodyWaterKg: { min: "waterMassMin", max: "waterMassMax" },
  proteinKg: { min: "proteinMassMin", max: "proteinMassMax" },
  boneMassKg: { min: "boneMin", max: "boneMax" },
  bmrKcal: { min: "bmrMin", max: "bmrMax", std: "bmrStd" },
  muscleLeftArmKg: { std: "laMuscleStd" },
  muscleRightArmKg: { std: "raMuscleStd" },
  muscleTrunkKg: { std: "tMuscleStd" },
  muscleLeftLegKg: { std: "llMuscleStd" },
  muscleRightLegKg: { std: "rlMuscleStd" },
  fatLeftArmKg: { std: "laBodyFatStd" },
  fatRightArmKg: { std: "raBodyFatStd" },
  fatTrunkKg: { std: "tBodyFatStd" },
  fatLeftLegKg: { std: "llBodyFatStd" },
  fatRightLegKg: { std: "rlBodyFatStd" },
};

/**
 * A reading the scale took, as opposed to a number typed into the app.
 *
 * His history opens with an 86 kg record four minutes before his first real
 * weigh-in: no device, no impedance — the weight entered at account setup.
 * Imported, it would be a phantom 3 kg drop on day one. App-typed records
 * carry an all-zero deviceType; anything a scale produced does not.
 */
export function isScaleReading(record: RenphoRecord): boolean {
  const deviceType = String(record.deviceType ?? "").replace(/0/g, "");
  return deviceType.length > 0;
}

/** Map one record. Returns null when it has no usable weight or timestamp. */
export function mapRenphoRecord(record: RenphoRecord): MappedRenphoRecord | null {
  const weightKg = positive(record.weight);
  const seconds = positive(record.timeStamp);
  const id = record.id;
  if (weightKg === null || seconds === null) return null;
  if (typeof id !== "string" && typeof id !== "number") return null;

  const fields: Record<string, number> = {};
  for (const [theirs, ours] of Object.entries(DIRECT)) {
    const value = positive(record[theirs]);
    if (value === null) continue;
    fields[ours] = INT_FIELDS.has(ours) ? Math.round(value) : value;
  }

  // The report prints these three in kg; the API sends the fat-free mass and
  // the two percentages. Derived here once, so every surface agrees with the
  // report to the same two decimals.
  if (fields.fatFreeWeightKg != null) {
    fields.fatMassKg = round2(weightKg - fields.fatFreeWeightKg);
  }
  if (fields.bodyWaterPct != null) {
    fields.bodyWaterKg = round2((fields.bodyWaterPct * weightKg) / 100);
  }
  if (fields.proteinPct != null) {
    fields.proteinKg = round2((fields.proteinPct * weightKg) / 100);
  }

  const impedance: Impedance = { z20: {}, z100: {} };
  for (const [suffix, segment] of Object.entries(IMPEDANCE_KEYS)) {
    const low = positive(record[`z20${suffix}`]);
    const high = positive(record[`z100${suffix}`]);
    if (low !== null) impedance.z20[segment] = low;
    if (high !== null) impedance.z100[segment] = high;
  }
  const hasImpedance =
    Object.keys(impedance.z20).length + Object.keys(impedance.z100).length > 0;

  const referenceRanges: Record<string, ReferenceRange> = {};
  for (const [column, names] of Object.entries(RANGES)) {
    const range: ReferenceRange = {};
    for (const part of ["min", "max", "std"] as const) {
      const name = names[part];
      const value = name ? positive(record[name]) : null;
      if (value !== null) range[part] = value;
    }
    if (Object.keys(range).length > 0) referenceRanges[column] = range;
  }

  return {
    externalId: `renpho:${id}`,
    // timeStamp is UTC seconds. Apple Health stamps the same weigh-in five
    // seconds earlier, comfortably inside the near-twin window.
    measuredAt: new Date(seconds * 1000),
    weightKg,
    fields,
    impedance: hasImpedance ? impedance : null,
    referenceRanges:
      Object.keys(referenceRanges).length > 0 ? referenceRanges : null,
    raw: record,
  };
}

// ————————————————————————————————————————————————————————————————————————
// The merge decision, kept pure so the tests can drive it without a database.
// ————————————————————————————————————————————————————————————————————————

/** A stored row, reduced to what the decision needs. */
export interface RenphoCandidateRow {
  id: string;
  measuredAt: Date;
  externalId: string | null;
  /** Every measured column, weightKg included. */
  values: Record<string, number | null>;
  impedance: unknown;
  referenceRanges: unknown;
}

export type RenphoWritePlan =
  | { action: "create" }
  | { action: "unchanged"; rowId: string }
  | {
      /** `link` adopts a row another source created; `refresh` re-syncs one
       *  already tied to this record. */
      action: "link" | "refresh";
      rowId: string;
      /** Columns whose stored value is blank or differs from the scale's. */
      patch: Record<string, number>;
    };

/** Stringify with sorted keys. Postgres JSONB does not preserve key order, so
 *  a value read back never matches a naive stringify of what was written —
 *  which made every re-import look like a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/**
 * Decide what one RENPHO record does to the table.
 *
 *  1. Already imported (same externalId) → refresh it, or leave it alone.
 *  2. Otherwise a row within ±nearMs and ±nearKg that no RENPHO record has
 *     claimed is the SAME weigh-in arriving from another source — Apple Health
 *     relaying the weight, or the report typed in by hand. Adopt it: the
 *     scale's own numbers win on every field it carries, and everything it
 *     does not carry (tape, notes, the row's origin) is left exactly as it was.
 *  3. Otherwise it is a new weigh-in.
 *
 * A row already claimed by a DIFFERENT record is never a twin: two real
 * weigh-ins a few minutes apart stay two rows.
 */
export function planRenphoWrite(
  mapped: MappedRenphoRecord,
  rows: readonly RenphoCandidateRow[],
  nearMs: number,
  nearKg: number
): RenphoWritePlan {
  const desired: Record<string, number> = {
    weightKg: mapped.weightKg,
    ...mapped.fields,
  };
  const diff = (row: RenphoCandidateRow) => {
    const patch: Record<string, number> = {};
    for (const [field, value] of Object.entries(desired)) {
      if (row.values[field] !== value) patch[field] = value;
    }
    return patch;
  };

  const linked = rows.find((row) => row.externalId === mapped.externalId);
  if (linked) {
    const patch = diff(linked);
    const settled =
      Object.keys(patch).length === 0 &&
      sameJson(linked.impedance, mapped.impedance) &&
      sameJson(linked.referenceRanges, mapped.referenceRanges);
    return settled
      ? { action: "unchanged", rowId: linked.id }
      : { action: "refresh", rowId: linked.id, patch };
  }

  const at = mapped.measuredAt.getTime();
  const twin = rows
    .filter(
      (row) =>
        row.externalId === null &&
        row.values.weightKg != null &&
        Math.abs(row.measuredAt.getTime() - at) <= nearMs &&
        Math.abs((row.values.weightKg as number) - mapped.weightKg) <= nearKg
    )
    // Nearest in time, so two unclaimed rows cannot be adopted out of order.
    .sort(
      (a, b) =>
        Math.abs(a.measuredAt.getTime() - at) - Math.abs(b.measuredAt.getTime() - at)
    )[0];
  if (twin) return { action: "link", rowId: twin.id, patch: diff(twin) };

  return { action: "create" };
}
