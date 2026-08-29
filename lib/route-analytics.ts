// Route analytics (2026-08-28): everything computable from the full-res GPS
// buffer the watch has been storing since day one — routeData.points[] at
// ~1/5 s with per-point elapsed seconds and altitude — and that nothing read
// until now. Pure module: points in, {moving/stopped time, breaks, per-km
// splits, grade-adjusted pace, max speed} out. Runs on sync for new sessions
// and via the backfill route for history; results land additively as
// metricsData.routeAnalytics.

export interface RoutePointIn {
  lat: number;
  lng: number;
  alt?: number | null;
  t: number; // elapsed seconds from session start
}

export interface RouteBreak {
  startT: number;
  endT: number;
  seconds: number;
  lat: number;
  lng: number;
}

export interface RouteSplit {
  km: number; // 1-based ordinal; the trailing partial keeps its ordinal
  meters: number;
  seconds: number;
  movingSeconds: number;
  paceSecPerKm: number | null; // moving pace over this split
  elevGainM: number;
  elevLossM: number;
  startT: number;
  endT: number;
}

export interface RouteAnalytics {
  version: 2;
  elapsedSeconds: number;
  movingSeconds: number;
  stoppedSeconds: number;
  breaks: RouteBreak[];
  splits: RouteSplit[];
  totalMeters: number;
  /// The distance the pace math actually used (the workout's own
  /// distanceMeters when sane, else GPS totalMeters) — so the card's pace
  /// always reconciles with a distance the caller can display.
  paceMeters: number;
  avgMovingPaceSecPerKm: number | null;
  gradeAdjustedPaceSecPerKm: number | null;
  maxSpeedMps: number | null;
  /// Absolute altitude (GPS MSL) over the route — null when points carry
  /// no altitude. The wrist's altitudeStream is RELATIVE (CMAltimeter) and
  /// must not be labeled as elevation; these are the real metres.
  minAltM: number | null;
  maxAltM: number | null;
  totalElevGainM: number;
  totalElevLossM: number;
}

export interface AnalyzeOptions {
  /// The workout's own distance column (HealthKit fused / Strava). GPS
  /// haversine over decimated points under-measures (stopped-segment travel
  /// dropped, switchbacks chord-shortened), so pace computed from it never
  /// matched the DISTANCE tile — the 2026-08-29 hike-report bug. When this
  /// is present and within a sane band of the GPS total (0.7×–1.5×), pace
  /// and grade-adjusted pace use it instead.
  authoritativeMeters?: number | null;
}

/// Hiking-friendly: slower than 0.5 m/s (1.8 km/h) across a sample gap reads
/// as standing still — GPS jitter at rest stays well under it at 1/5 s.
const MOVING_SPEED_MPS = 0.5;
/// A pause shorter than this is a photo stop, not a break.
const BREAK_MIN_SECONDS = 30;
const MAX_BREAKS = 50;
/// Same barometric noise floor the watch recorder uses.
const ALT_NOISE_M = 0.5;
/// Ignore pathological gaps (same guard as lib/zones.ts).
const MAX_SEGMENT_SECONDS = 3600;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/// Minetti et al. metabolic cost of gradient locomotion, normalized to flat
/// (C(0) = 3.6 J/kg/m). Uphill metres cost more, so they convert to MORE
/// equivalent-flat metres — grade-adjusted pace comes out faster than raw on
/// a climb. Grade clamped to ±45%.
export function gradeCostFactor(grade: number): number {
  const g = Math.max(-0.45, Math.min(0.45, grade));
  const cost =
    155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
  return Math.max(0.2, cost / 3.6);
}

export function analyzeRoute(
  pointsIn: RoutePointIn[] | null | undefined,
  opts?: AnalyzeOptions
): RouteAnalytics | null {
  if (!Array.isArray(pointsIn)) return null;

  // Sanitize: numeric lat/lng/t, ascending t, one point per t.
  const points = pointsIn
    .filter(
      (p) =>
        p &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Number.isFinite(p.t)
    )
    .sort((a, b) => a.t - b.t)
    .filter((p, i, arr) => i === 0 || p.t > arr[i - 1].t);
  if (points.length < 2) return null;

  const elapsedSeconds = points[points.length - 1].t - points[0].t;
  if (elapsedSeconds <= 0) return null;

  let movingSeconds = 0;
  let stoppedSeconds = 0;
  let totalMeters = 0;
  let equivalentFlatMeters = 0;
  let altCoveredMeters = 0;

  // Cumulative series for the rolling max-speed window.
  const cumDist: number[] = [0];

  // Break accumulation.
  const breaks: RouteBreak[] = [];
  let stopRun: { startT: number; endT: number; latSum: number; lngSum: number; n: number } | null =
    null;
  const closeStopRun = () => {
    if (!stopRun) return;
    const seconds = stopRun.endT - stopRun.startT;
    if (seconds >= BREAK_MIN_SECONDS) {
      breaks.push({
        startT: stopRun.startT,
        endT: stopRun.endT,
        seconds,
        lat: stopRun.latSum / stopRun.n,
        lng: stopRun.lngSum / stopRun.n,
      });
    }
    stopRun = null;
  };

  // Split accumulation.
  const splits: RouteSplit[] = [];
  let split = {
    meters: 0,
    movingSeconds: 0,
    elevGainM: 0,
    elevLossM: 0,
    startT: points[0].t,
  };
  const closeSplit = (endT: number) => {
    const seconds = endT - split.startT;
    splits.push({
      km: splits.length + 1,
      meters: Math.round(split.meters),
      seconds,
      movingSeconds: split.movingSeconds,
      paceSecPerKm:
        split.meters > 0 ? Math.round(split.movingSeconds / (split.meters / 1000)) : null,
      elevGainM: Math.round(split.elevGainM * 10) / 10,
      elevLossM: Math.round(split.elevLossM * 10) / 10,
      startT: split.startT,
      endT,
    });
    split = { meters: 0, movingSeconds: 0, elevGainM: 0, elevLossM: 0, startT: endT };
  };

  // Altitude smoothing state (recorder-style noise floor).
  let lastAlt: number | null = Number.isFinite(points[0].alt ?? NaN)
    ? (points[0].alt as number)
    : null;
  let minAltM: number | null = lastAlt;
  let maxAltM: number | null = lastAlt;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dt = curr.t - prev.t;
    if (dt <= 0 || dt > MAX_SEGMENT_SECONDS) {
      cumDist.push(totalMeters);
      continue;
    }

    const d = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const moving = d / dt >= MOVING_SPEED_MPS;

    // Altitude delta over the segment (smoothed).
    let dAlt = 0;
    if (Number.isFinite(curr.alt ?? NaN)) {
      const alt = curr.alt as number;
      if (minAltM == null || alt < minAltM) minAltM = alt;
      if (maxAltM == null || alt > maxAltM) maxAltM = alt;
      if (lastAlt != null) {
        const delta = alt - lastAlt;
        if (Math.abs(delta) > ALT_NOISE_M) {
          dAlt = delta;
          lastAlt = alt;
        }
      } else {
        lastAlt = alt;
      }
      altCoveredMeters += d;
    }

    if (moving) {
      closeStopRun();
      movingSeconds += dt;
      totalMeters += d;
      split.meters += d;
      split.movingSeconds += dt;
      if (dAlt > 0) split.elevGainM += dAlt;
      else if (dAlt < 0) split.elevLossM += -dAlt;
      const grade = d > 0 ? dAlt / d : 0;
      equivalentFlatMeters += d * gradeCostFactor(grade);
      if (split.meters >= 1000) closeSplit(curr.t);
    } else {
      stoppedSeconds += dt;
      if (!stopRun) {
        stopRun = { startT: prev.t, endT: curr.t, latSum: 0, lngSum: 0, n: 0 };
      }
      stopRun.endT = curr.t;
      stopRun.latSum += curr.lat;
      stopRun.lngSum += curr.lng;
      stopRun.n += 1;
    }

    cumDist.push(totalMeters);
  }
  closeStopRun();
  if (split.meters > 50) closeSplit(points[points.length - 1].t);

  if (totalMeters < 20) return null;

  // Longest 50 breaks, back in chronological order.
  breaks.sort((a, b) => b.seconds - a.seconds);
  const keptBreaks = breaks.slice(0, MAX_BREAKS).sort((a, b) => a.startT - b.startT);

  // Max speed over a ≥15 s rolling window — single spikes can't win the
  // window, but a 50 m-accuracy fix in a ~3-sample window still reads as
  // ~12 km/h on a hike (the 2026-08-29 report's "GPS spike"). So: collect
  // every window speed, then reject windows faster than 3× the median
  // before taking the max — a real sprint sustains neighbours near it; a
  // spike stands alone.
  const windowSpeeds: number[] = [];
  let windowStart = 0;
  for (let j = 1; j < points.length; j++) {
    while (points[j].t - points[windowStart].t >= 15 && windowStart < j - 1) {
      const dtw = points[j].t - points[windowStart + 1].t;
      if (dtw < 15) break;
      windowStart++;
    }
    const dtw = points[j].t - points[windowStart].t;
    if (dtw >= 15) windowSpeeds.push((cumDist[j] - cumDist[windowStart]) / dtw);
  }
  let maxSpeedMps: number | null = null;
  if (windowSpeeds.length > 0) {
    const sorted = [...windowSpeeds].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ceiling = median > 0 ? median * 3 : Infinity;
    maxSpeedMps = windowSpeeds.reduce(
      (best, s) => (s <= ceiling && s > best ? s : best),
      0
    );
    maxSpeedMps = Math.round(maxSpeedMps * 100) / 100;
  }

  // Pace reconciles with the distance the user SEES: prefer the workout's
  // own distance column when it's in a sane band of the GPS total (GPS is
  // a lower bound — decimated points chord-cut switchbacks and stopped
  // travel is dropped; far outside the band means one source is broken,
  // trust GPS).
  const authoritative = opts?.authoritativeMeters;
  const paceMeters =
    authoritative != null &&
    Number.isFinite(authoritative) &&
    authoritative >= totalMeters * 0.7 &&
    authoritative <= totalMeters * 1.5
      ? authoritative
      : totalMeters;
  const km = paceMeters / 1000;
  const avgMovingPaceSecPerKm = movingSeconds > 0 ? Math.round(movingSeconds / km) : null;
  // Grade-adjusted pace only when altitude covered most of the ground —
  // equivalent-flat metres scale with the same distance correction.
  const gradeAdjustedPaceSecPerKm =
    altCoveredMeters / totalMeters >= 0.8 && equivalentFlatMeters > 0
      ? Math.round(
          movingSeconds / ((equivalentFlatMeters * (paceMeters / totalMeters)) / 1000)
        )
      : null;

  const totalElevGainM =
    Math.round(splits.reduce((s, x) => s + x.elevGainM, 0) * 10) / 10;
  const totalElevLossM =
    Math.round(splits.reduce((s, x) => s + x.elevLossM, 0) * 10) / 10;

  return {
    version: 2,
    elapsedSeconds,
    movingSeconds,
    stoppedSeconds,
    breaks: keptBreaks,
    splits,
    totalMeters: Math.round(totalMeters),
    paceMeters: Math.round(paceMeters),
    avgMovingPaceSecPerKm,
    gradeAdjustedPaceSecPerKm,
    maxSpeedMps,
    minAltM: minAltM != null ? Math.round(minAltM) : null,
    maxAltM: maxAltM != null ? Math.round(maxAltM) : null,
    totalElevGainM,
    totalElevLossM,
  };
}
