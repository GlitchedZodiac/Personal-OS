import { describe, expect, it } from "vitest";
import { type SummaryRow, buildBodySummary, metricValue, readGoals } from "@/lib/body-summary";
import { BODY_START } from "@/lib/body-view";
import { DEFAULT_HEALTH_GOALS } from "@/lib/settings";

const TZ = "America/Bogota";
const NOW = new Date("2026-10-05T17:00:00Z"); // noon in Bogotá

function row(at: string, over: Partial<SummaryRow> = {}): SummaryRow {
  const measuredAt = new Date(at);
  return {
    measuredAt, createdAt: measuredAt, updatedAt: measuredAt,
    source: "apple_health", externalId: null, fieldSources: null, referenceRanges: null,
    weightKg: null, bodyFatPct: null, bmi: null, fatFreeWeightKg: null, fatMassKg: null,
    skeletalMuscleKg: null, skeletalMusclePct: null, bodyWaterKg: null, bodyWaterPct: null,
    visceralFat: null, bmrKcal: null, metabolicAge: null,
    ...over,
  };
}

const build = (rows: SummaryRow[], extra: Partial<Parameters<typeof buildBodySummary>[0]> = {}) =>
  buildBodySummary({
    rows, timeZone: TZ, now: NOW, settingsData: null, loggedMilestones: [],
    sync: { enabled: false, lastRunAt: null, lastRunOk: null },
    ...extra,
  });

describe("metricValue", () => {
  const etekcity = row("2026-07-28T12:00:00Z", {
    weightKg: 84, bodyFatPct: 20.7, skeletalMusclePct: 50, bodyWaterPct: 58, bmi: 26.5,
  });
  const renpho = row("2026-10-04T14:58:30Z", {
    weightKg: 82.75, bodyFatPct: 13.2, fatMassKg: 10.92, fatFreeWeightKg: 71.83,
    skeletalMuscleKg: 41.29, bodyWaterKg: 52.63, visceralFat: 2, bmrKcal: 1921, metabolicAge: 29,
  });

  it("uses the kg the new scale reports", () => {
    expect(metricValue(renpho, "fatMass", null)).toBe(10.92);
    expect(metricValue(renpho, "skm", null)).toBe(41.29);
    expect(metricValue(renpho, "water", null)).toBe(52.63);
    expect(metricValue(renpho, "ffm", null)).toBe(71.83);
  });

  it("derives kg from the old scale's percentages so the series is continuous", () => {
    expect(metricValue(etekcity, "fatMass", null)).toBe(17.39);
    expect(metricValue(etekcity, "skm", null)).toBe(42);
    expect(metricValue(etekcity, "water", null)).toBe(48.72);
    expect(metricValue(etekcity, "ffm", null)).toBe(66.61);
  });

  it("computes BMI from height only when the scale did not send one", () => {
    expect(metricValue(etekcity, "bmi", 1.78)).toBe(26.5);
    expect(metricValue(renpho, "bmi", 1.78)).toBe(26.1);
    expect(metricValue(renpho, "bmi", null)).toBeNull();
  });

  it("returns null rather than zero for what was not measured", () => {
    expect(metricValue(row("2026-10-05T11:55:00Z", { weightKg: 82.6 }), "fat", null)).toBeNull();
    expect(metricValue(row("2026-10-05T11:55:00Z", { weightKg: 82.6 }), "fatMass", null)).toBeNull();
  });
});

describe("buildBodySummary", () => {
  it("leads the weight series with the fixed start when no reading is that old", () => {
    const s = build([row("2025-12-24T12:00:00Z", { weightKg: 113.55, bmi: 35.8, bodyFatPct: 34.7 })]);
    expect(s.series.weight[0]).toEqual({ day: BODY_START.day, value: BODY_START.weightKg });
    expect(s.series.weight[1]).toEqual({ day: "2025-12-24", value: 113.55 });
    // BMI at the start is the start weight over his height, which the scale implies.
    expect(s.series.bmi[0].day).toBe(BODY_START.day);
    expect(s.series.bmi[0].value).toBeCloseTo(37, 0);
    expect(s.profile.heightCm).toBe(178);
    // Body fat has no declared start — it begins at its first real reading.
    expect(s.series.fat[0]).toEqual({ day: "2025-12-24", value: 34.7 });
  });

  it("puts a late-evening reading on his local day, not the UTC one", () => {
    // 04:52 UTC on the 12th is 23:52 on the 11th in Bogotá.
    const s = build([row("2026-09-12T04:52:00Z", { weightKg: 82.8, bodyFatPct: 14.5 })]);
    expect(s.series.fat[0].day).toBe("2026-09-11");
  });

  it("keeps the first reading of a day for scale metrics and the last for tape", () => {
    const s = build([
      row("2026-10-04T12:00:00Z", { weightKg: 82.75, waistCm: 88 }),
      row("2026-10-04T22:00:00Z", { weightKg: 83.4, waistCm: 86.5 }),
    ]);
    expect(s.series.weight.filter((p) => p.day === "2026-10-04")).toEqual([{ day: "2026-10-04", value: 82.75 }]);
    expect(s.tape.waist).toEqual([{ day: "2026-10-04", value: 86.5 }]);
  });

  it("reports today's weigh-in, the one before, and when it arrived", () => {
    const today = row("2026-10-05T11:55:00Z", { weightKg: 82.6 });
    today.updatedAt = new Date("2026-10-05T12:10:00Z");
    const s = build([row("2026-10-04T14:58:30Z", { weightKg: 82.75, bodyFatPct: 13.2 }), today]);
    expect(s.today).toBe("2026-10-05");
    expect(s.latest).toMatchObject({ day: "2026-10-05", isToday: true, weightKg: 82.6, bodyFatPct: null });
    expect(s.latest!.arrivedAt).toBe("2026-10-05T12:10:00.000Z");
    expect(s.previous).toEqual({ day: "2026-10-04", weightKg: 82.75 });
  });

  it("reads segments from the newest row that has them, as % of the scale's standard", () => {
    const s = build([
      row("2026-10-04T14:58:30Z", {
        weightKg: 82.75,
        muscleLeftArmKg: 4.19, muscleRightArmKg: 4.16, muscleTrunkKg: 31.33,
        fatLeftArmKg: 0.43, fatTrunkKg: 5.49,
        referenceRanges: { muscleLeftArmKg: { std: 3.44 }, fatLeftArmKg: { std: 0.68 }, fatTrunkKg: { std: 4.47 } },
      }),
      row("2026-10-05T11:55:00Z", { weightKg: 82.6 }), // Apple Health: weight only
    ]);
    expect(s.segments!.day).toBe("2026-10-04");
    expect(s.segments!.values.armLeft).toEqual({ muscleKg: 4.19, fatKg: 0.43, musclePct: 121.8, fatPct: 63.2 });
    expect(s.segments!.values.trunk.fatPct).toBe(122.8);
    // No standard sent for the right arm → the kg shows, the percentage does not.
    expect(s.segments!.values.armRight).toMatchObject({ muscleKg: 4.16, musclePct: null });
    expect(s.segments!.values.legLeft.muscleKg).toBeNull();
  });

  it("has no segments, and says nothing false, before the scale sends any", () => {
    expect(build([row("2026-10-05T11:55:00Z", { weightKg: 82.6 })]).segments).toBeNull();
  });

  it("marks the day the scale changed, only when an older scale's estimates precede it", () => {
    const old = row("2026-07-28T12:00:00Z", { weightKg: 84, bodyFatPct: 20.7, source: "vesync" });
    const first = row("2026-09-12T04:52:00Z", { weightKg: 82.8, bodyFatPct: 14.5, externalId: "renpho:1" });
    expect(build([old, first]).scaleChangedOn).toBe("2026-09-11");
    expect(build([first]).scaleChangedOn).toBeNull();
    expect(build([old]).scaleChangedOn).toBeNull();
  });

  it("takes his age from settings, else from the scale", () => {
    const rows = [row("2026-10-05T11:55:00Z", { weightKg: 82.6 })];
    expect(build(rows, { birthYear: 1994 }).profile.age).toBe(32);
    expect(build(rows, { scaleAge: 32 }).profile.age).toBe(32);
    expect(build(rows).profile.age).toBeNull();
  });

  it("returns an empty, honest payload when there is nothing yet", () => {
    const s = build([]);
    expect(s.latest).toBeNull();
    expect(s.previous).toBeNull();
    expect(s.series.fat).toEqual([]);
    // The declared start is still there; it is his, not the scale's.
    expect(s.series.weight).toEqual([{ day: BODY_START.day, value: BODY_START.weightKg }]);
  });

  it("passes logged milestones through as 'logged'", () => {
    const s = build([], {
      loggedMilestones: [{ day: "2026-07-19", title: "Swing PR", note: null, weightKg: 88.6 }],
    });
    expect(s.milestones).toEqual([{ day: "2026-07-19", title: "Swing PR", weightKg: 88.6, kind: "logged" }]);
  });
});

describe("readGoals", () => {
  it("falls back to his stated target when nothing is stored", () => {
    expect(readGoals(null)).toEqual(DEFAULT_HEALTH_GOALS);
    expect(readGoals({ healthGoals: "nonsense" })).toEqual(DEFAULT_HEALTH_GOALS);
  });
  it("keeps what is valid and repairs what is not, field by field", () => {
    expect(readGoals({ healthGoals: { weightKg: 76, bodyFatPct: -3, byDate: "soon" } })).toEqual({
      weightKg: 76,
      bodyFatPct: DEFAULT_HEALTH_GOALS.bodyFatPct,
      byDate: DEFAULT_HEALTH_GOALS.byDate,
    });
  });
});
