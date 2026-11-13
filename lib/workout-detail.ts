// One workout's streams, shaped for an AI reader (2026-11-12, gap #15).
//
// The watch stores the full HR/time streams and the route's speed/grade
// series, but query_data only ever returned the session summary — the
// streams surfaced by accident in edit_workout's whole-row response. This
// shapes them for `recent_workouts` fetched by id.
//
// Bounded on purpose: data-access `clip()` caps every array at 40 items, so
// a raw 460-point HR stream would arrive as its first 40 seconds. Instead we
// average into ≤ MAX_POINTS time buckets of a round size — a 38-minute walk
// becomes one point per minute, a 2-hour hike one per 3 minutes.

export const MAX_POINTS = 40;

/** Round bucket sizes, smallest first. */
const BUCKET_STEPS = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600];

type Json = Record<string, unknown>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Average `values` into at most `max` equal-count buckets (series with no timing). */
export function downsample(values: unknown, max = MAX_POINTS): number[] | null {
  if (!Array.isArray(values)) return null;
  const nums = values.filter(finite);
  if (nums.length === 0) return null;
  if (nums.length <= max) return nums.map((n) => Math.round(n * 100) / 100);
  const out: number[] = [];
  const size = nums.length / max;
  for (let i = 0; i < max; i++) {
    const slice = nums.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    if (slice.length === 0) continue;
    const avg = slice.reduce((s, n) => s + n, 0) / slice.length;
    out.push(Math.round(avg * 100) / 100);
  }
  return out;
}

/**
 * Average an HR stream into equal TIME buckets using its time stream
 * (seconds from start). Falls back to equal-count buckets when the time
 * stream is missing or misaligned.
 */
export function hrBuckets(
  hrStream: unknown,
  timeStream: unknown,
  max = MAX_POINTS
): { bucketSeconds: number; bpm: (number | null)[] } | null {
  if (!Array.isArray(hrStream) || hrStream.length === 0) return null;
  const aligned =
    Array.isArray(timeStream) && timeStream.length === hrStream.length && timeStream.every(finite);
  if (!aligned) {
    const bpm = downsample(hrStream, max);
    return bpm ? { bucketSeconds: 0, bpm: bpm.map((n) => Math.round(n)) } : null;
  }
  const times = timeStream as number[];
  const total = Math.max(1, times[times.length - 1] - times[0]);
  // The smallest round bucket that fits the cap ("+1": a sample AT the end
  // lands in its own bucket).
  const bucketSeconds =
    BUCKET_STEPS.find((step) => Math.floor(total / step) + 1 <= max) ?? Math.ceil(total / (max - 1));
  const count = Math.min(max, Math.floor(total / bucketSeconds) + 1);
  const sums = new Array<number>(count).fill(0);
  const ns = new Array<number>(count).fill(0);
  for (let i = 0; i < hrStream.length; i++) {
    const hr = hrStream[i];
    if (!finite(hr)) continue;
    const b = Math.min(count - 1, Math.floor((times[i] - times[0]) / bucketSeconds));
    sums[b] += hr;
    ns[b] += 1;
  }
  return {
    bucketSeconds,
    bpm: sums.map((s, i) => (ns[i] ? Math.round(s / ns[i]) : null)),
  };
}

/** The detail block a single-workout read adds to its summary. */
export function workoutDetail(metricsData: unknown): Json | null {
  const m = metricsData && typeof metricsData === "object" ? (metricsData as Json) : null;
  if (!m) return null;
  const ra = m.routeAnalytics && typeof m.routeAnalytics === "object" ? (m.routeAnalytics as Json) : null;
  const hr = hrBuckets(m.hrStream, m.timeStream);
  const speed = ra ? downsample(ra.velocitySeries) : null;
  const grade = ra ? downsample(ra.gradeSeries) : null;
  const splits = ra && Array.isArray(ra.splits) ? (ra.splits as unknown[]).slice(0, 40) : null;
  const out: Json = {};
  if (hr) out.heartRate = { ...hr, note: hr.bucketSeconds ? `Average bpm per ${hr.bucketSeconds}s from the start` : "Average bpm per equal slice of the session" };
  if (speed) out.speedMps = speed;
  if (grade) out.gradePct = grade;
  if (speed || grade) out.seriesNote = "speedMps and gradePct are aligned slices along the route, start to finish";
  if (splits && splits.length) out.splits = splits;
  return Object.keys(out).length ? out : null;
}
