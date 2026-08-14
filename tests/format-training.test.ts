import { describe, expect, it } from "vitest";
import {
  formatTonnage,
  netVsTargetLabel,
  tonnageLabel,
  volumeTrendPct,
} from "@/lib/format-training";

describe("formatTonnage", () => {
  it("keeps sub-tonne loads in kilos", () => {
    expect(formatTonnage(840)).toEqual({ value: "840", unit: "kg" });
    expect(formatTonnage(999)).toEqual({ value: "999", unit: "kg" });
  });

  it("flips to tonnes at 1000 kg — the bug that shipped '6,190 kg'", () => {
    expect(tonnageLabel(1000)).toBe("1.0 t");
    expect(tonnageLabel(6190)).toBe("6.2 t");
  });

  it("drops the decimal past 10 t so the tile never carries noise digits", () => {
    expect(tonnageLabel(24500)).toBe("25 t");
  });

  it("treats missing / nonsense tonnage as zero", () => {
    expect(tonnageLabel(0)).toBe("0 kg");
    expect(tonnageLabel(Number.NaN)).toBe("0 kg");
    expect(tonnageLabel(-500)).toBe("0 kg");
  });
});

describe("volumeTrendPct", () => {
  it("returns null with a single week of work (the old '+0%')", () => {
    expect(
      volumeTrendPct([
        { volumeKg: 0 },
        { volumeKg: 0 },
        { volumeKg: 6190 },
      ])
    ).toBeNull();
  });

  it("compares the last two weeks that had work in them", () => {
    expect(
      volumeTrendPct([
        { volumeKg: 4000 },
        { volumeKg: 0 },
        { volumeKg: 5000 },
      ])
    ).toBe(25);
  });

  it("reports a drop as negative", () => {
    expect(volumeTrendPct([{ volumeKg: 8000 }, { volumeKg: 6000 }])).toBe(-25);
  });

  it("returns null when nothing has been logged", () => {
    expect(volumeTrendPct([{ volumeKg: 0 }, { volumeKg: 0 }])).toBeNull();
  });
});

describe("netVsTargetLabel", () => {
  it("says 'left', not 'under' — an empty log at 9am is a budget, not a deficit", () => {
    expect(netVsTargetLabel(-612)).toEqual({ text: "612 left", tone: "left" });
    expect(netVsTargetLabel(-2000).text).toBe("2,000 left");
  });

  it("names a surplus", () => {
    expect(netVsTargetLabel(188)).toEqual({ text: "188 over", tone: "over" });
  });

  it("calls near-zero 'on target' instead of claiming 4 kcal of precision", () => {
    expect(netVsTargetLabel(-4).tone).toBe("even");
    expect(netVsTargetLabel(24).tone).toBe("even");
    expect(netVsTargetLabel(26).tone).toBe("over");
  });
});
