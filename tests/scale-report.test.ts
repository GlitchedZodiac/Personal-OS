import { describe, expect, it } from "vitest";
import { mapRenphoRecord } from "@/lib/renpho";
import {
  type ExtractedReport,
  type ReportCandidateRow,
  normalizeReport,
  planReportWrite,
  readingCount,
  reportDayCandidates,
  resolveReportDay,
  reviewGroups,
} from "@/lib/scale-report";
import { NEAR_KG, NEAR_MS } from "@/lib/vesync";

const TZ = "America/Bogota";

// His real report of 4 October 2026 (ID P26100401), as a faithful reading of
// the page: masses only for water/protein/muscle, the date printed day-first,
// each segment with its mass, its percent of standard and the standard.
const seg = (muscle: number, musclePct: number, muscleStd: number, fat: number, fatPct: number, fatStd: number) => ({
  muscle, musclePct, muscleStd, fat, fatPct, fatStd,
});
const REPORT: ExtractedReport = {
  legible: true,
  measuredOnPrinted: "4/10/2026",
  measuredTime: "09:58",
  reportId: "P26100401",
  weightUnit: "kg",
  weight: 82.75,
  bodyFatPct: 13.2,
  bmi: 26.1,
  fatMass: 10.92,
  fatFreeMass: 71.83,
  muscleMass: 67.03,
  muscleMassPct: null,
  skeletalMuscle: 41.29,
  skeletalMusclePct: null,
  smi: 10.1,
  bodyWater: 52.63,
  bodyWaterPct: null,
  protein: 14.4,
  proteinPct: null,
  boneMass: 4.8,
  visceralFat: 2,
  subcutaneousFatPct: 9.5,
  bmr: 1921,
  metabolicAge: 29,
  whr: 0.7,
  segments: {
    leftArm: seg(4.19, 121.8, 3.44, 0.43, 63.2, 0.68),
    rightArm: seg(4.16, 120.9, 3.44, 0.44, 64.7, 0.68),
    trunk: seg(31.33, 113.7, 27.56, 5.49, 122.8, 4.47),
    leftLeg: seg(11.86, 123.2, 9.63, 1.78, 101.1, 1.76),
    rightLeg: seg(11.85, 123.1, 9.63, 1.77, 100.6, 1.76),
  },
  impedance: {
    z20: { rightArm: 269.7, leftArm: 258.2, trunk: 16.8, rightLeg: 213.8, leftLeg: 208.3 },
    z100: { rightArm: 236.5, leftArm: 226.4, trunk: 16.6, rightLeg: 175.4, leftLeg: 171.2 },
  },
};

// The same weigh-in as RENPHO's cloud returned it (see tests/renpho.test.ts).
const CLOUD = mapRenphoRecord({
  id: "6087607455611716000", timeStamp: 1791125910, deviceType: "00053",
  weight: 82.75, bmi: 26.1, bodyfat: 13.2, fatFreeWeight: 71.83, sinew: 67.03, sinewRatio: 81,
  muscle: 49.9, smmMass: 41.29, smi: 10.1, water: 63.6, protein: 17.4, bone: 4.8, visfat: 2,
  subfat: 9.5, bmr: 1921, bodyage: 29, whr: 0.7,
  laMuscleMass: 4.19, raMuscleMass: 4.16, tMuscleMass: 31.33, llMuscleMass: 11.86, rlMuscleMass: 11.85,
  laBodyFatMass: 0.43, raBodyFatMass: 0.44, tBodyFatMass: 5.49, llBodyFatMass: 1.78, rlBodyFatMass: 1.77,
  z20HandR: 269.7, z20HandL: 258.2, z20Body: 16.8, z20FootR: 213.8, z20FootL: 208.3,
  z100HandR: 236.5, z100HandL: 226.4, z100Body: 16.6, z100FootR: 175.4, z100FootL: 171.2,
})!;

const read = (over: Partial<ExtractedReport> = {}, day: string | null | undefined = "2026-10-04") =>
  normalizeReport({ ...REPORT, ...over }, { timeZone: TZ, heightM: 1.78, day, now: new Date("2026-10-05T17:00:00Z") });

describe("normalizeReport", () => {
  const reading = read();

  it("lands on exactly the columns the cloud record fills, with the same numbers", () => {
    // The whole point: a row reads the same whichever way the reading arrived.
    expect(reading.weightKg).toBe(CLOUD.weightKg);
    expect(reading.fields).toEqual(CLOUD.fields);
    expect(reading.impedance).toEqual(CLOUD.impedance);
  });

  it("places the reading at the printed local time", () => {
    // 9:58 in Bogotá is 14:58 UTC — the cloud's own timestamp to the minute.
    expect(reading.measuredAt!.toISOString()).toBe("2026-10-04T14:58:00.000Z");
    expect(reading.day).toBe("2026-10-04");
    expect(reading.time).toBe("09:58");
    expect(reading.reportId).toBe("P26100401");
  });

  it("keeps each segment's printed standard so the body map can shade it", () => {
    expect(reading.referenceRanges).toMatchObject({
      muscleLeftArmKg: { std: 3.44 },
      muscleTrunkKg: { std: 27.56 },
      fatLeftArmKg: { std: 0.68 },
      fatTrunkKg: { std: 4.47 },
    });
  });

  it("back-computes a standard from the percentage when it is not printed", () => {
    const r = read({
      segments: { ...REPORT.segments, leftArm: { ...REPORT.segments.leftArm, muscleStd: null } },
    });
    expect(r.referenceRanges!.muscleLeftArmKg.std).toBeCloseTo(3.44, 2);
  });

  it("finds his real report consistent with itself", () => {
    expect(reading.warnings).toEqual([]);
  });

  it("catches a dropped decimal: fat mass that no longer matches fat %", () => {
    const r = read({ fatMass: 109.2 });
    expect(r.warnings.join(" ")).toMatch(/Fat mass and body fat % do not agree/);
  });

  it("catches two swapped cells: BMR against lean mass", () => {
    expect(read({ bmr: 1291 }).warnings.join(" ")).toMatch(/BMR and fat-free mass do not agree/);
  });

  it("drops a value no adult body has, and says so", () => {
    const r = read({ bodyFatPct: 132 });
    expect(r.fields).not.toHaveProperty("bodyFatPct");
    expect(r.warnings.join(" ")).toMatch(/bodyFatPct read as 132/);
  });

  it("never turns an unreadable value into a zero", () => {
    const r = read({ visceralFat: null, smi: null });
    expect(r.fields).not.toHaveProperty("visceralFat");
    expect(r.fields).not.toHaveProperty("smi");
  });

  it("converts a report printed in pounds", () => {
    const r = read({ weightUnit: "lb", weight: 182.43, fatMass: 24.07, fatFreeMass: 158.36, bmr: 1921 });
    expect(r.weightKg).toBeCloseTo(82.75, 1);
    expect(r.fields.fatMassKg).toBeCloseTo(10.92, 1);
    expect(r.fields.bmrKcal).toBe(1921); // not a mass
  });

  it("uses midday when no time is printed, and says when there is no date at all", () => {
    expect(read({ measuredTime: null }).measuredAt!.toISOString()).toBe("2026-10-04T17:00:00.000Z");
    const undated = read({ measuredOnPrinted: null }, null);
    expect(undated.measuredAt).toBeNull();
    expect(undated.warnings.join(" ")).toMatch(/No date could be read/);
  });

  it("counts what it read and lays it out for the confirm card", () => {
    expect(readingCount(reading)).toBe(1 + Object.keys(CLOUD.fields).length + 10);
    const groups = reviewGroups(reading);
    expect(groups.map((g) => g.title.split(" ")[0])).toEqual(["WHOLE", "SEGMENTAL", "SEGMENTAL", "IMPEDANCE"]);
    expect(groups[0].lines[0]).toEqual({ label: "Weight", value: "82.75 kg" });
    expect(groups[1].lines[0]).toEqual({ label: "Left arm", value: "4.19 kg · 122% of std" });
    // Every ohm, in the report's column order — a misread digit here has no
    // arithmetic to catch it (a low-resolution screenshot read 236.5 as 236.9).
    expect(groups[3].lines).toEqual([
      { label: "20 kHz", value: "269.7 · 258.2 · 16.8 · 213.8 · 208.3" },
      { label: "100 kHz", value: "236.5 · 226.4 · 16.6 · 175.4 · 171.2" },
    ]);
  });
});

describe("the printed date", () => {
  it("offers both readings of 4/10/2026, day-first leading", () => {
    expect(reportDayCandidates("4/10/2026")).toEqual(["2026-10-04", "2026-04-10"]);
  });
  it("has one reading when only one is a real date", () => {
    expect(reportDayCandidates("25/9/2026")).toEqual(["2026-09-25"]);
    expect(reportDayCandidates("9/25/2026")).toEqual(["2026-09-25"]);
    expect(reportDayCandidates("5/5/2026")).toEqual(["2026-05-05"]);
    expect(reportDayCandidates("2026-10-04")).toEqual(["2026-10-04"]);
    expect(reportDayCandidates("04.10.26")).toEqual(["2026-10-04", "2026-04-10"]);
  });
  it("returns nothing for what is not a date", () => {
    expect(reportDayCandidates("October")).toEqual([]);
    expect(reportDayCandidates("31/31/2026")).toEqual([]);
    expect(reportDayCandidates(null)).toEqual([]);
  });

  const both = ["2026-10-04", "2026-04-10"];
  it("lets the weigh-in settle it: the day that holds this weight wins", () => {
    expect(resolveReportDay(both, (d) => d === "2026-10-04", "2026-10-05")).toEqual({ day: "2026-10-04", ambiguous: false });
    // Even against the day-first default.
    expect(resolveReportDay(both, (d) => d === "2026-04-10", "2026-10-05")).toEqual({ day: "2026-04-10", ambiguous: false });
  });
  it("rules out a day that has not happened yet", () => {
    expect(resolveReportDay(["2026-12-03", "2026-03-12"], () => false, "2026-10-05")).toEqual({
      day: "2026-03-12", ambiguous: false,
    });
  });
  it("falls back to day-first and flags it when nothing decides", () => {
    expect(resolveReportDay(both, () => false, "2026-10-05")).toEqual({ day: "2026-10-04", ambiguous: true });
    expect(resolveReportDay(both, () => true, "2026-10-05")).toEqual({ day: "2026-10-04", ambiguous: true });
  });
  it("passes a single candidate, or none, straight through", () => {
    expect(resolveReportDay(["2026-09-25"], () => false, "2026-10-05")).toEqual({ day: "2026-09-25", ambiguous: false });
    expect(resolveReportDay([], () => false, "2026-10-05")).toEqual({ day: null, ambiguous: false });
  });
});

describe("planReportWrite", () => {
  const reading = read();
  const row = (over: Partial<ReportCandidateRow> = {}): ReportCandidateRow => ({
    id: "row",
    measuredAt: new Date("2026-10-04T14:58:25Z"),
    day: "2026-10-04",
    weightKg: 82.75,
    values: { weightKg: 82.75 },
    ...over,
  });
  const plan = (rows: ReportCandidateRow[], r = reading) => planReportWrite(r, rows, NEAR_MS, NEAR_KG);

  it("joins the weigh-in Apple Health already delivered", () => {
    const p = plan([row({ id: "ah" })]);
    expect(p).toMatchObject({ action: "join", rowId: "ah", corrects: 0 });
    if (p.action !== "join") return;
    expect(p.adds).toBe(Object.keys(reading.fields).length);
    expect(p.patch).not.toHaveProperty("weightKg"); // the stored weight and time stand
  });

  it("corrects a value that disagrees, and counts it as a correction", () => {
    const p = plan([row({ values: { weightKg: 82.75, bodyFatPct: 14 } })]);
    expect(p).toMatchObject({ action: "join", corrects: 1 });
    if (p.action === "join") expect(p.patch.bodyFatPct).toBe(13.2);
  });

  it("changes nothing on a row the cloud already filled with the same numbers", () => {
    const p = plan([row({ values: { weightKg: 82.75, ...CLOUD.fields } })]);
    expect(p).toMatchObject({ action: "join", adds: 0, corrects: 0, patch: {} });
  });

  it("with a time, will not join a weigh-in hours away the same day", () => {
    const evening = row({ id: "pm", measuredAt: new Date("2026-10-05T01:00:00Z") });
    // …by time. It is still the same local day and the same weight, so the
    // date-only rule finds it: one weigh-in, not two.
    expect(plan([evening])).toMatchObject({ action: "join", rowId: "pm" });
  });

  it("prefers the reading nearest in time when he weighed twice", () => {
    const p = plan([
      row({ id: "later", measuredAt: new Date("2026-10-04T15:06:00Z") }),
      row({ id: "nearest", measuredAt: new Date("2026-10-04T14:58:25Z") }),
    ]);
    expect(p).toMatchObject({ action: "join", rowId: "nearest" });
  });

  it("with only a date, matches the same day's weigh-in by weight", () => {
    const dateOnly = read({ measuredTime: null });
    expect(plan([row({ id: "morning", measuredAt: new Date("2026-10-04T12:10:00Z") })], dateOnly)).toMatchObject({
      action: "join", rowId: "morning",
    });
  });

  it("creates a new weigh-in when the weight does not match, or the day does not", () => {
    expect(plan([row({ weightKg: 83.6, values: { weightKg: 83.6 } })])).toEqual({ action: "create" });
    expect(plan([row({ day: "2026-10-03", measuredAt: new Date("2026-10-03T17:17:45Z") })])).toEqual({ action: "create" });
    expect(plan([])).toEqual({ action: "create" });
  });
});
