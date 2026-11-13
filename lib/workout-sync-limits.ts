import { Prisma } from "@prisma/client";

// Bounds for POST /api/mobile/workouts/sync (audit 2026-10, SEC-024).
//
// The sync payload is the frozen watch contract (docs/watch-contract.md), and
// the watch's offline queue drains EVERYTHING pending in one POST
// (ios/WatchApp/WorkoutSyncFlight.swift) and removes every pending item on
// any 2xx. So the rules are:
//   - caps sit far above any real session (the production copy's largest
//     route is 1,729 points; a 12-hour hike at 1 Hz is ~43,200);
//   - trim, never reject, wherever the meaning survives — an over-cap stream
//     is downsampled evenly and the trim is recorded in metricsData;
//   - a malformed field is defaulted and reported, never fatal;
//   - nothing here rejects the whole batch.

export const SYNC_LIMITS = {
  /** Vercel's own request-body limit is ~4.5 MB; the route matches it so the
   *  app never refuses a body production would have accepted. */
  maxBodyBytes: 4_500_000,
  // No item-count cap (review, 2026-10-20): the watch removes EVERY pending
  // item on any 2xx, so a cap that accepted-and-dropped the rest lost them.
  // The byte cap above is the real bound.
  maxRoutePoints: 60_000,
  maxStreamPoints: 60_000,
  maxExercises: 500,
  maxDescription: 10_000,
  /** metricsData after stream trimming (the real maximum is ~43 KB). */
  maxMetricsBytes: 2_000_000,
  /** A single top-level metricsData value bigger than this is dropped when the whole is over budget. */
  maxMetricsValueBytes: 256_000,
  strings: {
    externalId: 200,
    externalSource: 64,
    workoutType: 64,
    source: 64,
    syncStatus: 32,
    deviceType: 64,
    trailId: 64,
  },
} as const;

const INT32_MAX = 2_147_483_647;
/** Sessions are filed between 2000-01-01 and two days from now; Postgres refuses far-out years (22008/22009). */
const MIN_DATE_MS = Date.UTC(2000, 0, 1);
const FUTURE_SLACK_MS = 2 * 24 * 60 * 60 * 1000;
/** NUL stripping walks at most this deep; a real item is ~6 levels. */
const MAX_JSON_DEPTH = 64;
const MAX_DURATION_MINUTES = 7 * 24 * 60;
const STREAM_KEYS = ["hrStream", "timeStream", "altitudeStream"] as const;

/**
 * Keep `max` elements spread evenly across the array, always including the
 * first and the last. Deterministic in (length, max), so parallel streams of
 * equal length stay aligned index for index.
 */
export function downsampleEvenly<T>(values: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  if (values.length <= max) return values.slice();
  if (max === 1) return [values[0]];
  const out: T[] = [];
  const step = (values.length - 1) / (max - 1);
  for (let k = 0; k < max; k++) out.push(values[Math.round(k * step)]);
  return out;
}

export type ItemIssue = {
  index: number;
  externalId: string | null;
  /** trimmed: stored with changes · stored_minimal: stored with only its scalar facts ·
   *  kept_existing: a good row already existed and was left alone · rejected: not stored. */
  action: "trimmed" | "stored_minimal" | "kept_existing" | "rejected";
  reasons: string[];
};

export interface SanitizedSyncItem {
  externalId: string | null;
  externalSource: string;
  workoutType: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
  description: string | null;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  stepCount: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  elevationGainM: number | null;
  routeData: unknown;
  metricsData: unknown;
  exercises: unknown;
  source: string | null;
  syncStatus: string | null;
  deviceType: string | null;
  trailId: string | null;
  /** What was trimmed or defaulted, for the response and metricsData.syncTrimmed. */
  notes: string[];
}

function cap(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function int32OrNull(value: unknown, field: string, notes: string[]): number | null {
  const n = finiteOrNull(value);
  if (n === null) {
    if (value !== null && value !== undefined && value !== "") notes.push(`${field}:invalid`);
    return null;
  }
  const r = Math.round(n);
  if (r > INT32_MAX || r < -INT32_MAX) {
    notes.push(`${field}:out_of_range`);
    return null;
  }
  return r;
}

function dateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string);
  const t = d.getTime();
  if (!Number.isFinite(t) || t < MIN_DATE_MS || t > Date.now() + FUTURE_SLACK_MS) return null;
  return d;
}

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Bring one raw sync item inside the limits. Never throws and never rejects:
 * every out-of-bounds value is trimmed or defaulted, and each change is a
 * note. The one thing it cannot fix — an item that is not an object — is
 * returned as null.
 */
/**
 * Postgres refuses U+0000 in both `text` and `jsonb`, so one NUL anywhere in
 * an item used to fail the whole batch, forever, on every retry. Remove them.
 */
export function stripNul(value: unknown, changed: { hit: boolean; deep?: boolean } = { hit: false }, depth = 0): unknown {
  if (typeof value === "string") {
    if (!value.includes("\u0000")) return value;
    changed.hit = true;
    return value.replace(/\u0000/g, "");
  }
  if (value === null || typeof value !== "object") return value;
  // Depth-capped (review, 2026-10-20): unbounded recursion on deeply nested
  // JSON overflowed the stack. Nothing real nests this deep; deeper values
  // are dropped and the item says so.
  if (depth >= MAX_JSON_DEPTH) {
    changed.deep = true;
    return null;
  }
  if (Array.isArray(value)) return value.map((v) => stripNul(v, changed, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [stripNul(k, changed, depth + 1) as string, stripNul(v, changed, depth + 1)])
  );
}

export type SanitizeResult =
  | { ok: true; item: SanitizedSyncItem }
  | { ok: false; externalId: string | null; reasons: string[] };

export function sanitizeSyncItem(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, externalId: null, reasons: ["not_an_object"] };
  const nul: { hit: boolean; deep?: boolean } = { hit: false };
  const item = stripNul(raw, nul) as Record<string, unknown>;
  const notes: string[] = [...(nul.hit ? ["nul_removed"] : []), ...(nul.deep ? ["depth_trimmed"] : [])];
  const S = SYNC_LIMITS.strings;

  const capNoted = (key: keyof typeof S): string | null => {
    const v = item[key];
    const out = cap(v, S[key]);
    if (typeof v === "string" && v.trim().length > S[key]) notes.push(`${key}:truncated`);
    return out;
  };

  const externalId = capNoted("externalId");
  const externalSource = capNoted("externalSource") ?? "app_watch";
  const workoutType = capNoted("workoutType") ?? "other";

  // startedAt is what the row is filed under. Missing: endedAt, else now (the
  // contract's old default). Present but unreadable or outside 2000 … now+2d:
  // the item is NOT filed — "now" would put a session on today and mark
  // today's plan done (review, 2026-10-20). The real watch always sends one.
  const endedAt = dateOrNull(item.endedAt);
  if (item.endedAt != null && item.endedAt !== "" && !endedAt) notes.push("endedAt:invalid");
  let startedAt = dateOrNull(item.startedAt);
  if (!startedAt) {
    if (item.startedAt != null && item.startedAt !== "") {
      return { ok: false, externalId, reasons: [...notes, "startedAt:invalid"] };
    }
    startedAt = endedAt ?? new Date();
  }

  let durationMinutes = finiteOrNull(item.durationMinutes) ?? 0;
  if (item.durationMinutes != null && finiteOrNull(item.durationMinutes) === null) notes.push("durationMinutes:invalid");
  if (durationMinutes < 0) durationMinutes = 0;
  if (durationMinutes > MAX_DURATION_MINUTES) {
    durationMinutes = MAX_DURATION_MINUTES;
    notes.push("durationMinutes:clamped");
  }
  durationMinutes = Math.round(durationMinutes);

  let description: string | null = typeof item.description === "string" ? item.description : null;
  if (description && description.length > SYNC_LIMITS.maxDescription) {
    description = description.slice(0, SYNC_LIMITS.maxDescription);
    notes.push("description:truncated");
  }

  // Route points: downsample evenly above the cap; the first and last fix survive.
  let routeData: unknown = item.routeData ?? null;
  const trimmed: Record<string, unknown> = {};
  if (routeData && typeof routeData === "object" && !Array.isArray(routeData)) {
    const points = (routeData as { points?: unknown }).points;
    if (Array.isArray(points) && points.length > SYNC_LIMITS.maxRoutePoints) {
      routeData = { ...(routeData as object), points: downsampleEvenly(points, SYNC_LIMITS.maxRoutePoints) };
      trimmed.routePoints = { from: points.length, to: SYNC_LIMITS.maxRoutePoints };
      notes.push(`routePoints:${points.length}->${SYNC_LIMITS.maxRoutePoints}`);
    }
  }

  let exercises: unknown = item.exercises ?? null;
  if (Array.isArray(exercises) && exercises.length > SYNC_LIMITS.maxExercises) {
    trimmed.exercises = { from: exercises.length, to: SYNC_LIMITS.maxExercises };
    notes.push(`exercises:${exercises.length}->${SYNC_LIMITS.maxExercises}`);
    exercises = exercises.slice(0, SYNC_LIMITS.maxExercises);
  }

  // metricsData: parallel streams downsampled with the same index set, then
  // an overall byte budget (the diagnostic jump-rope trace goes first).
  let metricsData: unknown = item.metricsData ?? null;
  if (metricsData && typeof metricsData === "object" && !Array.isArray(metricsData)) {
    const m: Record<string, unknown> = { ...(metricsData as Record<string, unknown>) };
    const streamTrims: Record<string, { from: number; to: number }> = {};
    for (const key of STREAM_KEYS) {
      const s = m[key];
      if (Array.isArray(s) && s.length > SYNC_LIMITS.maxStreamPoints) {
        m[key] = downsampleEvenly(s, SYNC_LIMITS.maxStreamPoints);
        streamTrims[key] = { from: s.length, to: SYNC_LIMITS.maxStreamPoints };
        notes.push(`${key}:${s.length}->${SYNC_LIMITS.maxStreamPoints}`);
      }
    }
    if (Object.keys(streamTrims).length > 0) trimmed.streams = streamTrims;

    if (jsonBytes(m) > SYNC_LIMITS.maxMetricsBytes) {
      const dropped: string[] = [];
      const intervals = m.intervals;
      if (intervals && typeof intervals === "object" && "trace" in (intervals as object)) {
        const { trace: _trace, ...rest } = intervals as Record<string, unknown>;
        void _trace;
        m.intervals = rest;
        dropped.push("intervals.trace");
      }
      if (jsonBytes(m) > SYNC_LIMITS.maxMetricsBytes) {
        for (const [key, value] of Object.entries(m)) {
          if (jsonBytes(value) > SYNC_LIMITS.maxMetricsValueBytes) {
            delete m[key];
            dropped.push(key);
          }
        }
      }
      if (dropped.length > 0) {
        trimmed.droppedKeys = dropped;
        notes.push(`metricsData:dropped(${dropped.join(",")})`);
      }
    }
    metricsData = m;
  }
  if (Object.keys(trimmed).length > 0) {
    const base =
      metricsData && typeof metricsData === "object" && !Array.isArray(metricsData)
        ? (metricsData as Record<string, unknown>)
        : {};
    metricsData = { ...base, syncTrimmed: trimmed };
  }

  return { ok: true, item: {
    externalId,
    externalSource,
    workoutType,
    startedAt,
    endedAt,
    durationMinutes,
    description,
    caloriesBurned: finiteOrNull(item.caloriesBurned),
    distanceMeters: finiteOrNull(item.distanceMeters),
    stepCount: int32OrNull(item.stepCount, "stepCount", notes),
    avgHeartRateBpm: int32OrNull(item.avgHeartRateBpm, "avgHeartRateBpm", notes),
    maxHeartRateBpm: int32OrNull(item.maxHeartRateBpm, "maxHeartRateBpm", notes),
    elevationGainM: finiteOrNull(item.elevationGainM),
    routeData,
    metricsData,
    exercises,
    source: capNoted("source"),
    syncStatus: capNoted("syncStatus"),
    deviceType: capNoted("deviceType"),
    trailId: capNoted("trailId"),
    notes,
  } };
}

/**
 * A database error that is about THIS item's data — worth a minimal retry or
 * an item-level report. Anything else (the database unreachable, a timeout, a
 * bug) must fail the whole request with 500, so the watch keeps its queue and
 * retries: a 200 with every item "rejected" would make it drop them all.
 */
const DATA_ERROR_CODES = new Set([
  "P2000", "P2003", "P2004", "P2005", "P2006", "P2007", "P2009", "P2011",
  "P2012", "P2019", "P2020", "P2023", "P2033",
]);
/**
 * The Postgres SQLSTATE behind a driver-adapter error, if any. Through the pg
 * adapter Prisma reports "Database error" as P2039 and keeps the real code in
 * meta.driverAdapterError.cause.originalCode (verified against Postgres 17,
 * 2026-10-20: an out-of-range year is 22009, a NUL byte 22021).
 */
export function postgresState(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = (error.meta as { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } } | undefined)
    ?.driverAdapterError?.cause;
  const code = cause?.originalCode ?? cause?.code;
  return typeof code === "string" ? code : null;
}

export function isItemDataError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientValidationError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (DATA_ERROR_CODES.has(error.code)) return true;
  // Class 22 (data exception) and 23 (integrity) are about the ROW, not the
  // database's health; connection (08), resources (53), shutdown (57) are not.
  const state = postgresState(error);
  return state !== null && /^2[23]/.test(state);
}

export function errorCode(error: unknown): string {
  const state = postgresState(error);
  if (state) return `pg:${state}`;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  if (error instanceof Prisma.PrismaClientValidationError) return "validation";
  return "unknown";
}
