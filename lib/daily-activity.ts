// Apple Health daily activity from his iPhone Shortcut (2026-10-17).
//
// The Shortcut (SHORTCUT_SETUP.md) runs every night, reads the last 8 days
// of Steps, Active Energy, Resting Energy and Walking + Running Distance,
// and POSTs them to /api/health/daily as an array — re-sending past days on
// purpose, so a night the phone missed is filled in by the next one. This
// file is the pure half: the bearer check, and turning whatever the Shortcut
// sent into clean rows. The route does the database work.
//
// Three things the Shortcut forces on the parser:
//   - Numbers may arrive as TEXT ("8123", "6,42" on a phone set to a comma
//     locale) — Shortcuts builds the body as text, and an empty Health query
//     leaves an empty string, not a zero.
//   - Distance comes in whatever unit his Health app shows, so km, mi and m
//     are all accepted and stored as km.
//   - Health data cannot be read while the phone is locked. A run that fires
//     on a locked phone gets nothing back and would post a week of zeros —
//     which would OVERWRITE good days. A day with every metric empty or zero
//     is therefore never stored; it is reported back as skipped.

import crypto from "crypto";
import { addDaysToDateString, getDateStringInTimeZone } from "@/lib/timezone";

/** The day boundary his reports use (his call, 2026-10-17). */
export const ACTIVITY_TIME_ZONE = "America/Chicago";

/** A nightly run sends 8; a 6-month backfill ~185. Anything far past that is not the Shortcut. */
export const MAX_DAYS_PER_REQUEST = 400;

/** Apple Health did not exist before iOS 8 (September 2014). */
const EARLIEST_DAY = "2014-09-01";

/** A static token shorter than this is a placeholder, not a secret. */
const MIN_TOKEN_LENGTH = 16;

export type ActivitySource = "phone" | "watch" | "mixed";

export interface ActivityDay {
  date: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  restingEnergyKcal: number | null;
  walkingRunningDistanceKm: number | null;
  source: ActivitySource | null;
}

export interface RejectedDay {
  /** position in the array he sent */
  index: number;
  date: string | null;
  errors: string[];
}

export interface ParsedActivityPayload {
  /** one per date — a date sent twice keeps its LAST copy */
  days: ActivityDay[];
  /** dates with nothing in them (locked phone) — never written */
  empty: string[];
  rejected: RejectedDay[];
}

export type ParseResult =
  | { ok: true; value: ParsedActivityPayload }
  | { ok: false; error: string };

// ————— Auth —————

/**
 * `Authorization: Bearer <HEALTH_INGEST_TOKEN>`. Fails closed: with the env
 * var unset (or set to a placeholder) nothing gets in. Both sides are hashed
 * first so the comparison is constant-time whatever the lengths.
 */
export function isIngestAuthorized(
  authorization: string | null | undefined,
  expected: string | undefined = process.env.HEALTH_INGEST_TOKEN
): boolean {
  const secret = expected?.trim() ?? "";
  if (secret.length < MIN_TOKEN_LENGTH) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match) return false;
  const digest = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(digest(match[1]), digest(secret));
}

// ————— Values —————

type Metric =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/**
 * A finite, non-negative number or nothing. Text is accepted because
 * Shortcuts sends text; one comma with no dot is a decimal comma ("6,42").
 * Anything else that looks like a number with separators ("12.345,6",
 * "1,234,567") is refused rather than guessed at.
 */
export function parseMetric(value: unknown, label: string, max: number): Metric {
  if (value === undefined || value === null) return { ok: true, value: null };
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const s = value.replace(/[\s  ]/g, "");
    if (s === "") return { ok: true, value: null };
    if (/^-?\d+(\.\d+)?$/.test(s)) n = Number(s);
    else if (/^-?\d+,\d+$/.test(s)) n = Number(s.replace(",", "."));
    else return { ok: false, error: `${label} is not a number ("${value.slice(0, 20)}")` };
  } else {
    return { ok: false, error: `${label} is not a number` };
  }
  if (!Number.isFinite(n)) return { ok: false, error: `${label} is not a number` };
  if (n < 0) return { ok: false, error: `${label} is negative` };
  if (n > max) return { ok: false, error: `${label} ${n} is above ${max}` };
  return { ok: true, value: n };
}

function round(n: number | null, places: number): number | null {
  if (n === null) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** A real calendar day, written YYYY-MM-DD. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 2026-02-30 survives the regex; the round trip through a real date does not.
  return addDaysToDateString(value, 0) === value;
}

/**
 * phone | watch | mixed — given directly, or worked out from the Health
 * sources' device names ("Michael's Apple Watch, Michael's iPhone").
 * Third-party apps in the list are ignored; nothing recognisable → null.
 */
export function classifySource(value: unknown): ActivitySource | null {
  const parts = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? [value]
      : [];
  const text = parts.join(" | ").toLowerCase().trim();
  if (!text) return null;
  if (text === "phone" || text === "iphone") return "phone";
  if (text === "watch" || text === "apple watch") return "watch";
  if (text === "mixed" || text === "both") return "mixed";
  const watch = text.includes("watch");
  const phone = /\bi?phone\b/.test(text);
  if (watch && phone) return "mixed";
  if (watch) return "watch";
  if (phone) return "phone";
  return null;
}

// ————— Payload —————

/** Bounds no real day reaches — these catch a unit or field mix-up, not a hard day. */
const LIMITS = {
  steps: 200_000,
  kcal: 20_000,
  km: 500,
} as const;

const KM_PER_MILE = 1.609344;

function first(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = record[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function parseDay(
  raw: unknown,
  index: number,
  today: string
): { day: ActivityDay } | { rejected: RejectedDay } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { rejected: { index, date: null, errors: ["not an object"] } };
  }
  const record = raw as Record<string, unknown>;
  const errors: string[] = [];

  const rawDate = first(record, ["date", "localDate"]);
  const date = typeof rawDate === "string" ? rawDate.trim() : null;
  if (!isCalendarDay(date)) {
    errors.push(`date must be YYYY-MM-DD (got ${JSON.stringify(rawDate ?? null)})`);
  } else if (date < EARLIEST_DAY) {
    errors.push(`date ${date} is before Apple Health existed`);
  } else if (date > addDaysToDateString(today, 1)) {
    // +1: a phone a timezone ahead of Chicago is already on tomorrow.
    errors.push(`date ${date} is in the future`);
  }

  const steps = parseMetric(first(record, ["steps"]), "steps", LIMITS.steps);
  const active = parseMetric(
    first(record, ["active_energy_kcal", "activeEnergyKcal"]),
    "active_energy_kcal",
    LIMITS.kcal
  );
  const resting = parseMetric(
    first(record, ["resting_energy_kcal", "restingEnergyKcal"]),
    "resting_energy_kcal",
    LIMITS.kcal
  );

  // Distance in whichever unit the phone had; km wins if several are sent.
  let distance: Metric = { ok: true, value: null };
  const km = first(record, ["walking_running_distance_km", "walkingRunningDistanceKm"]);
  const mi = first(record, ["walking_running_distance_mi", "walkingRunningDistanceMi"]);
  const m = first(record, ["walking_running_distance_m", "walkingRunningDistanceMeters"]);
  if (km !== undefined) {
    distance = parseMetric(km, "walking_running_distance_km", LIMITS.km);
  } else if (mi !== undefined) {
    const parsed = parseMetric(mi, "walking_running_distance_mi", LIMITS.km / KM_PER_MILE);
    distance = parsed.ok && parsed.value !== null ? { ok: true, value: parsed.value * KM_PER_MILE } : parsed;
  } else if (m !== undefined) {
    const parsed = parseMetric(m, "walking_running_distance_m", LIMITS.km * 1000);
    distance = parsed.ok && parsed.value !== null ? { ok: true, value: parsed.value / 1000 } : parsed;
  }

  for (const metric of [steps, active, resting, distance]) {
    if (!metric.ok) errors.push(metric.error);
  }
  if (errors.length > 0 || !steps.ok || !active.ok || !resting.ok || !distance.ok) {
    return { rejected: { index, date: typeof date === "string" ? date : null, errors } };
  }

  return {
    day: {
      date: date as string,
      steps: steps.value === null ? null : Math.round(steps.value),
      activeEnergyKcal: round(active.value, 1),
      restingEnergyKcal: round(resting.value, 1),
      walkingRunningDistanceKm: round(distance.value, 3),
      source: classifySource(first(record, ["source"]) ?? first(record, ["sources"])),
    },
  };
}

/** Nothing measured at all — the locked-phone signature. */
export function isEmptyDay(day: ActivityDay): boolean {
  return [day.steps, day.activeEnergyKcal, day.restingEnergyKcal, day.walkingRunningDistanceKm].every(
    (v) => v === null || v === 0
  );
}

/**
 * Accepts the array itself, `{ "days": [...] }`, or one bare day. Unknown
 * fields are ignored. A bad day is rejected on its own — one malformed night
 * must not cost the six good ones riding with it.
 */
export function parseActivityPayload(body: unknown, now: Date = new Date()): ParseResult {
  let list: unknown[];
  if (Array.isArray(body)) list = body;
  else if (body && typeof body === "object" && Array.isArray((body as { days?: unknown }).days)) {
    list = (body as { days: unknown[] }).days;
  } else if (body && typeof body === "object" && "date" in (body as object)) {
    list = [body];
  } else {
    return { ok: false, error: "Send a JSON array of days: [{\"date\":\"YYYY-MM-DD\",\"steps\":…}]" };
  }
  if (list.length === 0) return { ok: false, error: "The array is empty" };
  if (list.length > MAX_DAYS_PER_REQUEST) {
    return { ok: false, error: `At most ${MAX_DAYS_PER_REQUEST} days per request (got ${list.length})` };
  }

  const today = getDateStringInTimeZone(now, ACTIVITY_TIME_ZONE);
  const byDate = new Map<string, ActivityDay>();
  const empty = new Set<string>();
  const rejected: RejectedDay[] = [];

  list.forEach((raw, index) => {
    const parsed = parseDay(raw, index, today);
    if ("rejected" in parsed) {
      rejected.push(parsed.rejected);
      return;
    }
    const { day } = parsed;
    // A date sent twice: the later copy is the newer read of that day.
    byDate.delete(day.date);
    empty.delete(day.date);
    if (isEmptyDay(day)) empty.add(day.date);
    else byDate.set(day.date, day);
  });

  const sortDays = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    ok: true,
    value: {
      days: [...byDate.values()].sort((a, b) => sortDays(a.date, b.date)),
      empty: [...empty].sort(sortDays),
      rejected,
    },
  };
}
