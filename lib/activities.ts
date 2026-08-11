// Activity typing for Train → Activities (design 2026-08-11 rev): every
// workout is one of three card types — kettlebell/strength (kb), protocol
// circuit/EMOM (cir), outdoor GPS (out). Shared by the list and detail
// endpoints so filters and icons agree.

export type ActivityType = "kb" | "cir" | "out";

const OUTDOOR_TYPES = new Set(["run", "walk", "hike", "cycling", "trail_run", "ride"]);

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
}

export function activityTypeOf(workout: {
  workoutType: string;
  distanceMeters: number | null;
  metricsData: unknown;
}): ActivityType {
  const m = (workout.metricsData ?? {}) as RunMetrics;
  if (OUTDOOR_TYPES.has(workout.workoutType) || (workout.distanceMeters ?? 0) > 0) {
    return "out";
  }
  if (m.emom || m.roundsCompleted != null) return "cir";
  return "kb";
}
