import { describe, expect, it } from "vitest";
import {
  DEFAULT_HR_ZONE_TOPS,
  downsample,
  timeInZones,
  trainingLoad,
  zoneFor,
} from "@/lib/zones";

describe("HR zones (Michael's Strava boundaries)", () => {
  it("classifies bpm into his five zones", () => {
    expect(zoneFor(100)).toBe(0); // Z1 < 122
    expect(zoneFor(122)).toBe(0);
    expect(zoneFor(140)).toBe(1); // Z2 123-152
    expect(zoneFor(160)).toBe(2); // Z3 153-167
    expect(zoneFor(175)).toBe(3); // Z4 168-182
    expect(zoneFor(190)).toBe(4); // Z5 183+
  });

  it("splits time across zones with each sample owning its gap", () => {
    // 10 min at 110 (Z1), 10 min at 140 (Z2), 10 min at 160 (Z3)
    const hr = [110, 110, 140, 140, 160, 160];
    const time = [0, 600, 600, 1200, 1200, 1800];
    const z = timeInZones(hr, time, DEFAULT_HR_ZONE_TOPS);
    expect(z).not.toBeNull();
    expect(z!.totalSeconds).toBe(1800);
    expect(z!.seconds[0]).toBe(600);
    expect(z!.seconds[1]).toBe(600);
    expect(z!.seconds[2]).toBe(600);
    expect(z!.pct.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
  });

  it("ignores broken samples and returns null without data", () => {
    expect(timeInZones([], [])).toBeNull();
    expect(timeInZones([120], [0])).toBeNull();
    const z = timeInZones([0, 120, 120], [0, 60, 120]); // first sample invalid bpm
    expect(z!.totalSeconds).toBe(60);
  });

  it("training load weights higher zones harder", () => {
    const easy = timeInZones([110, 110], [0, 1800]); // 30 min Z1
    const hard = timeInZones([190, 190], [0, 1800]); // 30 min Z5
    expect(trainingLoad(easy)).toBe(30);
    expect(trainingLoad(hard)).toBe(150);
    expect(trainingLoad(null)).toBeNull();
  });

  it("downsample preserves endpoints and caps length", () => {
    const big = Array.from({ length: 5000 }, (_, i) => i);
    const small = downsample(big, 120);
    expect(small.length).toBe(120);
    expect(small[0]).toBe(0);
    expect(small[small.length - 1]).toBe(4999);
    expect(downsample([1, 2, 3], 120)).toEqual([1, 2, 3]);
  });
});
