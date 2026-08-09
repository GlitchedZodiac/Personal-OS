// Heart-rate zones + training-load math. Zone boundaries come from
// Michael's Strava profile (age-derived; recalibrate from real watch max
// later — single-user app, so the default IS his data). Applies to any
// workout with an HR stream: Strava imports today, watch recordings next —
// kettlebell and dumbbell sessions included once a strap/watch supplies HR.

// Upper bounds of Z1–Z4; Z5 is everything above.
export const DEFAULT_HR_ZONE_TOPS = [122, 152, 167, 182] as const;

export const ZONE_COLORS = ["#EADFE5", "#DCA8BE", "#C97D9C", "#A63D63", "#8C2F51"];
export const ZONE_NAMES = ["Z1", "Z2", "Z3", "Z4", "Z5"];

export interface ZoneBreakdown {
  seconds: number[]; // per zone, Z1..Z5
  pct: number[]; // per zone, rounded, sums ~100
  totalSeconds: number;
}

export function zoneFor(bpm: number, tops: readonly number[] = DEFAULT_HR_ZONE_TOPS) {
  for (let i = 0; i < tops.length; i++) {
    if (bpm <= tops[i]) return i;
  }
  return tops.length; // Z5
}

/**
 * Time in each zone from parallel HR/time streams (time = elapsed seconds
 * from start, HR = bpm at that instant). Each sample owns the gap to the
 * next sample.
 */
export function timeInZones(
  hrStream: number[],
  timeStream: number[],
  tops: readonly number[] = DEFAULT_HR_ZONE_TOPS
): ZoneBreakdown | null {
  const n = Math.min(hrStream.length, timeStream.length);
  if (n < 2) return null;

  const seconds = [0, 0, 0, 0, 0];
  for (let i = 0; i < n - 1; i++) {
    const dt = timeStream[i + 1] - timeStream[i];
    if (!Number.isFinite(dt) || dt <= 0 || dt > 3600) continue;
    const bpm = hrStream[i];
    if (!Number.isFinite(bpm) || bpm <= 0) continue;
    seconds[zoneFor(bpm, tops)] += dt;
  }

  const totalSeconds = seconds.reduce((a, b) => a + b, 0);
  if (totalSeconds === 0) return null;

  const pct = seconds.map((s) => Math.round((s / totalSeconds) * 100));
  return { seconds: seconds.map(Math.round), pct, totalSeconds: Math.round(totalSeconds) };
}

/**
 * TRIMP-style load: minutes per zone weighted 1..5. Comparable to Strava's
 * Relative Effort in spirit (theirs is proprietary) — ours is transparent.
 */
export function trainingLoad(breakdown: ZoneBreakdown | null): number | null {
  if (!breakdown) return null;
  const load = breakdown.seconds.reduce(
    (sum, s, zone) => sum + (s / 60) * (zone + 1),
    0
  );
  return Math.round(load);
}

/** Downsample a stream to at most `max` points (first/last preserved). */
export function downsample(values: number[], max = 120): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  const step = (values.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(values[Math.round(i * step)]);
  }
  return out;
}
