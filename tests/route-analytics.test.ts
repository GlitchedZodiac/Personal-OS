import { describe, expect, it } from "vitest";
import {
  analyzeRoute,
  gradeCostFactor,
  haversineMeters,
  type RoutePointIn,
} from "@/lib/route-analytics";

// Synthetic tracks: ~0.000009° of latitude ≈ 1 m, so speed is easy to stage.
const M_LAT = 0.000008993;

function straightTrack(opts: {
  meters: number;
  speedMps: number;
  cadenceS?: number;
  altPerMeter?: number;
}): RoutePointIn[] {
  const cadence = opts.cadenceS ?? 5;
  const stepM = opts.speedMps * cadence;
  const steps = Math.round(opts.meters / stepM);
  const points: RoutePointIn[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push({
      lat: 3.45 + i * stepM * M_LAT,
      lng: -76.55,
      alt: opts.altPerMeter != null ? 1000 + i * stepM * opts.altPerMeter : null,
      t: i * cadence,
    });
  }
  return points;
}

describe("analyzeRoute", () => {
  it("constant-speed track: all moving, clean km splits at the right pace", () => {
    // 2 m/s over ~3 km → 500 s/km pace.
    const a = analyzeRoute(straightTrack({ meters: 3000, speedMps: 2 }))!;
    expect(a).not.toBeNull();
    expect(a.stoppedSeconds).toBe(0);
    expect(a.movingSeconds).toBe(a.elapsedSeconds);
    expect(a.breaks).toHaveLength(0);
    expect(a.splits.length).toBeGreaterThanOrEqual(2);
    expect(a.splits[0].meters).toBeGreaterThanOrEqual(1000);
    expect(a.splits[0].meters).toBeLessThan(1050);
    expect(a.splits[0].paceSecPerKm).toBeGreaterThan(480);
    expect(a.splits[0].paceSecPerKm).toBeLessThan(520);
    expect(a.totalMeters).toBeGreaterThan(2900);
    expect(a.avgMovingPaceSecPerKm).toBeGreaterThan(480);
    expect(a.avgMovingPaceSecPerKm).toBeLessThan(520);
    // Flat: GAP ≈ raw pace.
    expect(a.gradeAdjustedPaceSecPerKm).toBeNull(); // no altitude data → null
  });

  it("a stationary cluster becomes exactly one break with honest seconds", () => {
    const walk = straightTrack({ meters: 1000, speedMps: 2 });
    const pauseAt = Math.floor(walk.length / 2);
    const anchor = walk[pauseAt];
    // 120 s standing at one spot (24 samples at 5 s), then the walk resumes
    // with every later timestamp shifted.
    const paused: RoutePointIn[] = [
      ...walk.slice(0, pauseAt + 1),
      ...Array.from({ length: 24 }, (_, i) => ({
        lat: anchor.lat,
        lng: anchor.lng,
        alt: null,
        t: anchor.t + (i + 1) * 5,
      })),
      ...walk.slice(pauseAt + 1).map((p) => ({ ...p, t: p.t + 120 })),
    ];
    const a = analyzeRoute(paused)!;
    expect(a.breaks).toHaveLength(1);
    expect(a.breaks[0].seconds).toBe(120);
    expect(a.breaks[0].lat).toBeCloseTo(anchor.lat, 6);
    expect(a.stoppedSeconds).toBe(120);
    expect(a.movingSeconds).toBe(a.elapsedSeconds - 120);
  });

  it("short photo stops (<30 s) count as stopped time but never a break", () => {
    const walk = straightTrack({ meters: 500, speedMps: 2 });
    const anchor = walk[20];
    const paused: RoutePointIn[] = [
      ...walk.slice(0, 21),
      ...Array.from({ length: 4 }, (_, i) => ({
        lat: anchor.lat,
        lng: anchor.lng,
        alt: null,
        t: anchor.t + (i + 1) * 5,
      })),
      ...walk.slice(21).map((p) => ({ ...p, t: p.t + 20 })),
    ];
    const a = analyzeRoute(paused)!;
    expect(a.breaks).toHaveLength(0);
    expect(a.stoppedSeconds).toBe(20);
  });

  it("climbing makes grade-adjusted pace faster than raw pace", () => {
    // 10% grade climb with altitude on every point.
    const a = analyzeRoute(
      straightTrack({ meters: 2000, speedMps: 1.5, altPerMeter: 0.1 })
    )!;
    expect(a.splits[0].elevGainM).toBeGreaterThan(80);
    expect(a.gradeAdjustedPaceSecPerKm).not.toBeNull();
    expect(a.gradeAdjustedPaceSecPerKm!).toBeLessThan(a.avgMovingPaceSecPerKm!);
  });

  it("max speed uses a 15 s window, so a single teleport spike can't win", () => {
    const walk = straightTrack({ meters: 1000, speedMps: 2 });
    // One bogus fix 200 m off to the side for a single sample.
    walk[50] = { ...walk[50], lng: walk[50].lng + 200 * M_LAT };
    const a = analyzeRoute(walk)!;
    // 2 m/s honest speed; the spike adds ~400 m over its two 5 s hops, but a
    // 15 s window dilutes it below the teleport's instantaneous 40 m/s.
    expect(a.maxSpeedMps).not.toBeNull();
    expect(a.maxSpeedMps!).toBeLessThan(30);
  });

  // v2 (2026-08-29): the hike-report fixes.
  it("pace reconciles with the authoritative distance when one is passed", () => {
    const track = straightTrack({ meters: 2000, speedMps: 2 }); // GPS ~2000 m
    const gps = analyzeRoute(track)!;
    // The watch column says 2.2 km (fused pedometer beats chord-cut GPS).
    const a = analyzeRoute(track, { authoritativeMeters: 2200 })!;
    expect(a.paceMeters).toBe(2200);
    expect(a.avgMovingPaceSecPerKm).toBe(
      Math.round(a.movingSeconds / (2200 / 1000))
    );
    expect(a.avgMovingPaceSecPerKm!).toBeLessThan(gps.avgMovingPaceSecPerKm!);
    // Nonsense authoritative values (sim's 105 m synthetic) fall back to GPS.
    const b = analyzeRoute(track, { authoritativeMeters: 105 })!;
    expect(b.paceMeters).toBe(b.totalMeters);
  });

  it("a lone GPS spike window is rejected by the 3×median filter", () => {
    const walk = straightTrack({ meters: 1500, speedMps: 1.2 });
    // Shove a ~50 m lateral error into three consecutive fixes mid-walk —
    // the class of spike that read as "max 12.0 km/h" on a 17.7% grade.
    const spiked = walk.map((p, i) =>
      i >= 100 && i <= 102 ? { ...p, lng: p.lng + 50 * M_LAT } : p
    );
    const a = analyzeRoute(spiked)!;
    // Honest walking max ≈ 1.2 m/s; the spike would have pushed 3+ m/s.
    expect(a.maxSpeedMps!).toBeLessThan(2.4);
  });

  it("absolute altitude min/max and descent totals are reported", () => {
    // Out-and-back: climb 4% for half, descend for half.
    const up = straightTrack({ meters: 1000, speedMps: 1.5, altPerMeter: 0.04 });
    const downStart = up[up.length - 1];
    const down: RoutePointIn[] = up.slice(1).map((p, i) => ({
      lat: downStart.lat + (i + 1) * 1.5 * 5 * M_LAT,
      lng: p.lng,
      alt: (downStart.alt as number) - (i + 1) * 1.5 * 5 * 0.04,
      t: downStart.t + (i + 1) * 5,
    }));
    const a = analyzeRoute([...up, ...down])!;
    expect(a.minAltM).toBe(1000);
    expect(a.maxAltM).toBeGreaterThan(1035);
    expect(a.totalElevGainM).toBeGreaterThan(30);
    expect(a.totalElevLossM).toBeGreaterThan(30);
    expect(a.version).toBe(2);
  });

  it("returns null for unusable inputs", () => {
    expect(analyzeRoute(null)).toBeNull();
    expect(analyzeRoute([])).toBeNull();
    expect(analyzeRoute([{ lat: 3.45, lng: -76.55, t: 0 }])).toBeNull();
    // Standing entirely still: no distance → null.
    expect(
      analyzeRoute(
        Array.from({ length: 20 }, (_, i) => ({ lat: 3.45, lng: -76.55, t: i * 5 }))
      )
    ).toBeNull();
  });
});

describe("helpers", () => {
  it("haversine sanity", () => {
    expect(haversineMeters(3.45, -76.55, 3.45 + 1000 * M_LAT, -76.55)).toBeCloseTo(1000, -1);
  });
  it("grade cost is 1 on flat, higher uphill, lower on gentle downhill", () => {
    expect(gradeCostFactor(0)).toBeCloseTo(1, 5);
    expect(gradeCostFactor(0.1)).toBeGreaterThan(1.5);
    expect(gradeCostFactor(-0.1)).toBeLessThan(1);
  });
});
