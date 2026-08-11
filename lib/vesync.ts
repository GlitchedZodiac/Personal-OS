import { zonedLocalDateTimeToUtc } from "@/lib/timezone";

// Pure half of the VeSync scale-CSV import (parsing, locale-format
// detection, near-duplicate policy) — kept Prisma-free so the decisions
// that burned once (DD/MM vs MM/DD, timezone, twin-merge) stay pinned by
// tests. The route in app/api/health/import/vesync owns persistence.

export interface VeSyncRow {
  time: string;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  fatFreeWeightKg: number | null;
  subcutaneousFatPct: number | null;
  visceralFat: number | null;
  bodyWaterPct: number | null;
  skeletalMusclePct: number | null;
  muscleMassKg: number | null;
  boneMassKg: number | null;
  proteinPct: number | null;
  bmrKcal: number | null;
  metabolicAge: number | null;
  heartRateBpm: number | null;
}

// Numeric fields copied row → measurement (weight handled separately).
export const COMPOSITION_FIELDS = [
  "bmi",
  "bodyFatPct",
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

const INT_FIELDS = new Set(["visceralFat", "bmrKcal", "metabolicAge", "heartRateBpm"]);

export function parseVeSyncValue(raw: string): number | null {
  if (!raw || raw.trim() === "--" || raw.trim() === "") return null;
  // Remove units like kg, %, kcal, bpm
  const cleaned = raw.replace(/kg|%|kcal|bpm/gi, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const TIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

export function splitTime(timeStr: string) {
  const cleaned = timeStr
    .replace(/^"|"$/g, "")
    .replace(/[    ]/g, " ") // VeSync uses narrow no-break space before AM/PM
    .trim();
  const m = cleaned.match(TIME_RE);
  if (!m) return null;
  return {
    first: Number(m[1]),
    second: Number(m[2]),
    year: Number(m[3]),
    hour12: Number(m[4]),
    minute: Number(m[5]),
    pm: m[6].toUpperCase() === "PM",
  };
}

/** Detect MM/DD vs DD/MM across the WHOLE file — a single row can't. */
export function detectDateFormat(times: string[]): "MDY" | "DMY" | "conflict" {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const t of times) {
    const parts = splitTime(t);
    if (!parts) continue;
    if (parts.first > 12) firstOver12 = true;
    if (parts.second > 12) secondOver12 = true;
  }
  if (firstOver12 && secondOver12) return "conflict";
  if (firstOver12) return "DMY";
  return "MDY"; // secondOver12, or fully ambiguous → US export default
}

export function parseVeSyncTime(
  timeStr: string,
  format: "MDY" | "DMY",
  timeZone: string
): Date | null {
  const parts = splitTime(timeStr);
  if (!parts) return null;
  const month = format === "MDY" ? parts.first : parts.second;
  const day = format === "MDY" ? parts.second : parts.first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let hour = parts.hour12 % 12;
  if (parts.pm) hour += 12;
  const dateStr = `${parts.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return zonedLocalDateTimeToUtc(dateStr, timeZone, hour, parts.minute, 0);
}

export function parseCSV(csvText: string): VeSyncRow[] {
  // Normalize special whitespace characters (VeSync uses U+202F narrow no-break space)
  const normalized = csvText.replace(/[    ]/g, " ");
  const lines = normalized.trim().split("\n");
  if (lines.length < 2) return [];

  // Skip header row
  const rows: VeSyncRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV has quoted time field with comma inside, so we need careful parsing
    const match = line.match(/^"([^"]+)",(.+)$/);
    if (!match) continue;

    const timeStr = match[1];
    const rest = match[2].split(",").map((s) => s.trim());

    if (rest.length < 14) continue;

    rows.push({
      time: timeStr,
      weightKg: parseVeSyncValue(rest[0]),
      bmi: parseVeSyncValue(rest[1]),
      bodyFatPct: parseVeSyncValue(rest[2]),
      fatFreeWeightKg: parseVeSyncValue(rest[3]),
      subcutaneousFatPct: parseVeSyncValue(rest[4]),
      visceralFat: parseVeSyncValue(rest[5]),
      bodyWaterPct: parseVeSyncValue(rest[6]),
      skeletalMusclePct: parseVeSyncValue(rest[7]),
      muscleMassKg: parseVeSyncValue(rest[8]),
      boneMassKg: parseVeSyncValue(rest[9]),
      proteinPct: parseVeSyncValue(rest[10]),
      bmrKcal: parseVeSyncValue(rest[11]),
      metabolicAge: parseVeSyncValue(rest[12]),
      heartRateBpm: parseVeSyncValue(rest[13]),
    });
  }

  return rows;
}

export function roundIfInt(field: string, value: number | null): number | null {
  if (value == null) return null;
  return INT_FIELDS.has(field) ? Math.round(value) : value;
}

// A CSV reading and a stored row within this window with (near-)equal weight
// are the SAME weigh-in: he often voice-logged the scale's number a minute
// or two after stepping off, and the export itself repeats readings seconds
// apart (one bare, one with composition).
export const NEAR_MS = 10 * 60_000;
export const NEAR_KG = 0.3;
