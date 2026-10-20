// Words and numbers for the Coach's screens (2026-10-20, lane B). Pure and
// client-safe: no Prisma, no OpenAI. What the screen calls a table, a model
// tier, a week; how a value reads; and which rows stand behind a fact when
// he taps its chip.

import type { Fact } from "./types";

export type TierKey = "sol" | "terra" | "luna";

export const TIER_LABEL: Record<TierKey, string> = {
  sol: "Sol — the thorough one",
  terra: "Terra — balanced",
  luna: "Luna — quick and cheap",
};

/** "Sol" — the short name, for the footer line. */
export const tierShort = (tier: string) => (TIER_LABEL[tier as TierKey] ?? tier).split(" — ")[0];

/** What a provenance chip calls a table — his words, not the schema's. */
export const TABLE_LABEL: Record<string, string> = {
  workout_logs: "workouts",
  food_logs: "meals",
  personal_records: "records",
  body_measurements: "weigh-ins",
  daily_health_snapshots: "watch days",
  daily_activity: "Health days",
  planned_workouts: "plans",
  water_logs: "water",
  journal_entries: "journal",
  user_settings: "your targets",
  calendar: "the calendar",
  sequences: "routines",
};

export const tableLabel = (table: string) => TABLE_LABEL[table] ?? table.replace(/_/g, " ");

/** "Oct 12 – Oct 18" */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const f = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return `${f(weekStart)} – ${f(weekEnd)}`;
}

/** "Tue, Oct 13" */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const MINUS = "−";

/** 1,850 · −0.3 · 12 — a true minus sign, thousands separated. */
export function formatNumber(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n < 0 ? `${MINUS}${s}` : s;
}

/** "+3", "−0.3", "even" */
export function formatSigned(n: number): string {
  if (n === 0) return "even";
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

const PLURAL_UNITS = new Set(["sessions", "days", "nights", "records", "pages", "steps", "weigh-ins", "rows"]);

export function unitFor(value: number, unit: string): string {
  return Math.abs(value) === 1 && PLURAL_UNITS.has(unit) ? unit.slice(0, -1) : unit;
}

/** A fact's value as a person reads it. */
export function formatValue(value: Fact["value"], unit?: string, signed = false): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  const n = signed ? formatSigned(value) : formatNumber(value);
  if (!unit) return n;
  if (unit === "%") return `${n}%`;
  return `${n} ${unitFor(value, unit)}`;
}

/** "Central Daylight Time" — the zone a reminder card names. */
export function zoneName(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "7:42 pm" in his zone */
export function clockLabel(iso: string, timeZone?: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) })
    .toLowerCase();
}

/** "Sun, Oct 18 · 7:01 pm" */
export function stampLabel(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
  return `${day} · ${clockLabel(iso, timeZone)}`;
}

/** "7¢", "$1.20" */
export function costLabel(usd: number): string {
  if (usd < 1) return `${Math.max(usd > 0 ? 1 : 0, Math.round(usd * 100))}¢`;
  return `$${usd.toFixed(2)}`;
}

/** "Weight (kg)" for a measurement column. */
const FIELD_LABELS: Record<string, string> = {
  weightKg: "Weight (kg)",
  bodyFatPct: "Body fat (%)",
  waistCm: "Waist (cm)",
  chestCm: "Chest (cm)",
  armsCm: "Arms (cm)",
  legsCm: "Legs (cm)",
  hipsCm: "Hips (cm)",
  shouldersCm: "Shoulders (cm)",
  neckCm: "Neck (cm)",
  forearmsCm: "Forearms (cm)",
  calvesCm: "Calves (cm)",
};

export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const unit = /Kg$/.test(field) ? " (kg)" : /Cm$/.test(field) ? " (cm)" : /Pct$/.test(field) ? " (%)" : "";
  const words = field.replace(/(Kg|Cm|Pct)$/, "").replace(/([A-Z])/g, " $1").toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${unit}`;
}

// ————— the chip and its sheet —————

/** "workouts · 6 rows" — what a group of cited facts came from. */
export function chipLabel(cited: Fact[]): string {
  if (cited.length === 0) return "no source";
  const lead = cited.find((f) => (f.source.count ?? f.source.ids?.length ?? 0) > 0) ?? cited[0];
  const tables = [...new Set(cited.map((f) => f.source.table))];
  const n = lead.source.count ?? lead.source.ids?.length ?? 0;
  const base = n > 0 ? `${tableLabel(lead.source.table)} · ${n} ${n === 1 ? "row" : "rows"}` : tableLabel(lead.source.table);
  return tables.length > 1 ? `${base} +${tables.length - 1}` : base;
}

export interface EvidenceRow {
  date: string;
  label: string;
  value: string;
}

/**
 * The rows behind an aggregate, when the facts carry them: every other fact
 * of the same table that covers ONE day and whose rows are all among this
 * fact's rows — a day's kcal under the week's average, a session's minutes
 * under the session count. Dates and values only; never an id.
 */
export function evidenceRows(fact: Fact, all: Fact[]): EvidenceRow[] {
  const ids = new Set(fact.source.ids ?? []);
  if (ids.size === 0) return [];
  return all
    .filter(
      (f) =>
        f.key !== fact.key &&
        f.source.table === fact.source.table &&
        f.source.dates?.length === 1 &&
        (f.source.ids?.length ?? 0) > 0 &&
        (f.source.ids ?? []).every((id) => ids.has(id)) &&
        typeof f.value === "number"
    )
    .sort((a, b) => (a.source.dates![0] < b.source.dates![0] ? -1 : 1))
    .slice(0, 14)
    .map((f) => ({ date: f.source.dates![0], label: f.label, value: formatValue(f.value, f.unit) }));
}
