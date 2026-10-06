// Activity typing for Train → Activities (design 2026-08-11 rev): every
// workout is one of four card types — kettlebell/strength (kb), protocol
// circuit/EMOM (cir), outdoor GPS (out), and jump rope (rope, 2026-10-05 —
// his call: a type of its own, not a kettlebell card reading "0 kg").
// Shared by the list and detail endpoints so filters and icons agree.

import { JUMP_ROPE_TYPE } from "@/lib/jump-rope";

export type ActivityType = "kb" | "cir" | "out" | "rope";

// Treadmill types are "out" too (distance work) — they just carry no GPS,
// so the detail renders the distance header instead of a map.
const OUTDOOR_TYPES = new Set([
  "run",
  "walk",
  "hike",
  "cycling",
  "trail_run",
  "ride",
  "treadmill_walk",
  "treadmill_run",
]);

// GPS trails belong only to genuinely outdoor, in-motion types. Watch builds
// before 2026-08-28 could attach a stale tracker buffer to stationary
// sessions (prod 08-19/20/26: freestyle rows carried the prior walk's exact
// polyline) — so writers strip instead of trusting the client.
export const GPS_WORKOUT_TYPES = new Set([
  "run",
  "walk",
  "hike",
  "trail_run",
  "cycling",
  "ride",
]);

export function routeDataAllowed(workoutType: string): boolean {
  return GPS_WORKOUT_TYPES.has(workoutType);
}

// Structured indoor types whose distance is noise for card typing: HealthKit
// estimates arm-swing distance for freestyle/HIIT, and the stale-GPS leak
// stamped real kilometres onto strength rows. A kettlebell session with
// 900 m on it is still a kettlebell session.
const STRUCTURED_INDOOR_TYPES = new Set(["freestyle", "strength", "other"]);

/** Types whose distance means ground covered — the only ones whose km count. */
export function isDistanceType(workoutType: string): boolean {
  return OUTDOOR_TYPES.has(workoutType);
}

export interface RunMetrics {
  sequenceId?: string;
  sequenceName?: string;
  roundsCompleted?: number;
  stepSeconds?: number[];
  emom?: { roundsCompleted?: number; totalRounds?: number };
  timeInZones?: { seconds: number[]; pct: number[]; totalSeconds: number };
  loadScore?: number;
  relativeEffort?: number;
  hrStream?: number[];
  timeStream?: number[];
  altitudeStream?: number[];
  routeAnalytics?: import("@/lib/route-analytics").RouteAnalytics;
  /// Round 3 §07 (watch, 2026-08-28): heart-rate recovery — BPM drop over
  /// the post-workout window and the seconds actually measured (≤60).
  hrrDelta?: number;
  hrrSeconds?: number;
  /// Per-km elapsed seconds banked live on the wrist (outdoor kinds).
  splits?: number[];
  /// Session-mean step cadence from the wrist (2026-08-29, Strava parity).
  avgCadenceSpm?: number;
  /// Jump rope (2026-10-05): the interval record — lib/jump-rope.ts reads it.
  intervals?: unknown;
  /// Per-entry log from the wrist (voice + taps) — lib/set-log.ts.
  setLog?: unknown;
  /// Stamped when the movement list was edited off the wrist, so a late
  /// re-send from the watch can never overwrite the correction.
  exercisesEditedAt?: string;
  /// "Looks right" on the voice log, and ids that arrived after an edit.
  setLogReviewedAt?: string;
  lateEntryIds?: string[];
  /// Strava-only legacy keys still read as fallbacks on old imported rows.
  movingTime?: number;
  elapsedTime?: number;
  avgCadence?: number;
}

export function activityTypeOf(workout: {
  workoutType: string;
  distanceMeters: number | null;
  metricsData: unknown;
}): ActivityType {
  const m = (workout.metricsData ?? {}) as RunMetrics;
  if (workout.workoutType === JUMP_ROPE_TYPE) return "rope";
  if (OUTDOOR_TYPES.has(workout.workoutType)) return "out";
  const structured = m.emom || m.roundsCompleted != null ? "cir" : "kb";
  if (STRUCTURED_INDOOR_TYPES.has(workout.workoutType)) return structured;
  // Untyped/legacy rows: distance still reads as outdoor work.
  if ((workout.distanceMeters ?? 0) > 0) return "out";
  return structured;
}
