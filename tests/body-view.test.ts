import { describe, expect, it } from "vitest";
import {
  BODY_START,
  COMP,
  type DayPoint,
  addDays,
  agoText,
  autoMilestones,
  balance,
  balanceVerdict,
  bandNote,
  bodyTypeMatrix,
  buildCompRow,
  buildTapeRow,
  TAPE_SITES,
  daysBetween,
  describeMuscle,
  goalProgress,
  goalsNote,
  keypadPress,
  meaningNote,
  mergeMilestones,
  monthlyTrail,
  nearestValue,
  pace,
  parseTapeUtterance,
  pointsInRange,
  rangeBar,
  scaleChangeNote,
  segmentOpacity,
  smoothedOn,
  sortCompRows,
  sourceLines,
  trendChart,
  valueOn,
} from "@/lib/body-view";

// The design's own sample series (DC constructor, rng32(11)), so the numbers
// the spec quotes can be checked rather than re-derived by hand.
function designWeight(): DayPoint[] {
  let a = 11;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = 294;
  const W: number[] = [];
  for (let t = 0; t < N; t++) {
    W.push(75 + 42.3 * Math.exp(-t / 175) + (rng() - 0.5) * 0.7 + 0.25 * Math.sin(t / 3.2));
    rng(); rng(); // the DC draws fat and muscle from the same stream
  }
  W[N - 1] = 82.8;
  W[N - 2] = 83.1;
  return W.map((value, i) => ({ day: addDays(BODY_START.day, i), value }));
}
const TODAY = addDays(BODY_START.day, 293); // 2026-10-04

describe("dates", () => {
  it("the design's day 293 is Oct 4, 147 days before Feb 28", () => {
    expect(TODAY).toBe("2026-10-04");
    expect(daysBetween(TODAY, "2027-02-28")).toBe(147);
  });
});

describe("valueOn / smoothedOn", () => {
  const pts: DayPoint[] = [
    { day: "2026-09-01", value: 84 },
    { day: "2026-09-11", value: 82 },
  ];
  it("returns a reading on its own day and a straight line between readings", () => {
    expect(valueOn(pts, "2026-09-01")).toBe(84);
    expect(valueOn(pts, "2026-09-06")).toBe(83);
  });
  it("holds the nearest end outside the data", () => {
    expect(valueOn(pts, "2026-08-01")).toBe(84);
    expect(valueOn(pts, "2026-10-01")).toBe(82);
    expect(valueOn([], "2026-10-01")).toBeNull();
  });
  it("smooths across a gap instead of failing on it", () => {
    // September had three weigh-ins. The window must not be empty.
    expect(smoothedOn(pts, "2026-09-06")).toBeCloseTo(83, 5);
  });
});

describe("pace and forecast — the spec's fixture", () => {
  const p = pace(designWeight(), TODAY, { weightKg: 77, byDate: "2027-02-28" })!;

  it("needs 0.28 kg a week for 5.8 kg in 147 days", () => {
    expect(p.toGo).toBeCloseTo(5.8, 5);
    expect(p.needed.toFixed(2)).toBe("0.28");
  });

  it("matches the reference's own arithmetic: 0.30 kg/wk, arriving Feb 17, 11 days early", () => {
    // The spec's prose quotes 0.31 / Feb 9 / 19 days as an example; the DC's
    // formula on the DC's series gives these, and the DC is the behaviour truth.
    expect(p.rate).toBeCloseTo(0.2983, 4);
    expect(p.rate).toBeGreaterThan(p.needed);
    expect(p.arrivalDay).toBe("2027-02-17");
    expect(p.daysEarly).toBe(11);
  });

  it("the sentence, the tiles and the arrival agree with one another", () => {
    expect(p.sentence).toContain(`You need ${p.needed.toFixed(2)} kg a week to make 77 kg by Feb 28.`);
    expect(p.sentence).toContain(`On your 30-day pace of ${p.rate.toFixed(2)}`);
    expect(p.sentence).toContain(`${p.daysEarly} days early`);
    expect(Math.round(p.arrivalDays)).toBe(147 - (p.daysEarly as number));
  });

  it("draws the needed line to the goal date and the pace line to the arrival", () => {
    expect(p.chart.arrivalVisible).toBe(true);
    expect(p.chart.arrivalX).toBeLessThan(p.chart.goalX);
    expect(p.chart.onPath).toBe(`M16,14 L${p.chart.arrivalX.toFixed(1)},74 L304,74`);
    expect(p.chart.neededPath).toBe(`M16,14 L${p.chart.goalX.toFixed(1)},74`);
  });

  it("says so plainly when weight is not moving", () => {
    const flat = Array.from({ length: 60 }, (_, i) => ({ day: addDays("2026-08-01", i), value: 82.8 }));
    const stuck = pace(flat, "2026-09-29", { weightKg: 77, byDate: "2027-02-28" })!;
    expect(stuck.arrivalDay).toBeNull();
    expect(stuck.sentence).toMatch(/isn’t moving at the moment/);
    // The pace line ends on the right edge above the target: the gap is the shortfall.
    expect(stuck.chart.arrivalVisible).toBe(false);
    expect(stuck.chart.arrivalY).toBeLessThan(74);
  });

  it("recognises a target already met", () => {
    const done = pace([{ day: "2026-10-04", value: 76.5 }], "2026-10-04", { weightKg: 77, byDate: "2027-02-28" })!;
    expect(done.sentence).toMatch(/already at or under 77 kg/);
  });
});

describe("goal progress and the two-target note", () => {
  it("is 86% of the way from 117.3 to 77 at 82.8", () => {
    expect(goalProgress(82.8, 77).toFixed(0)).toBe("86");
  });
  it("clamps past either end", () => {
    expect(goalProgress(120, 77)).toBe(0);
    expect(goalProgress(70, 77)).toBe(100);
  });
  it("flags targets that cannot both be true at today's lean mass", () => {
    // 77 kg with 71.83 kg lean is ~7% fat, six points under a 13% target.
    expect(goalsNote({ weightKg: 77, bodyFatPct: 13 }, 71.83)).toContain("about 7% fat");
    expect(goalsNote({ weightKg: 82, bodyFatPct: 13 }, 71.83)).toBe(
      "The two targets agree at today’s lean mass."
    );
    expect(goalsNote({ weightKg: 77, bodyFatPct: 13 }, null)).toBeNull();
  });
});

describe("range bar", () => {
  it("places band, start, now and target as clamped percentages", () => {
    const g = rangeBar({ value: 82.8, start: 117.3, axis: [55, 120], band: [59.2, 80.2], target: 77 });
    expect(g.nowX).toBeCloseTo(((82.8 - 55) / 65) * 100, 5);
    expect(g.startX).toBeCloseTo(((117.3 - 55) / 65) * 100, 5);
    expect(g.histL).toBe(g.nowX);
    expect(g.histW).toBeCloseTo(g.startX - g.nowX, 5);
    expect(g.targetX).toBeCloseTo(((77 - 55) / 65) * 100, 5);
    expect(rangeBar({ value: 200, start: 0, axis: [55, 120], band: [59.2, 80.2] })).toMatchObject({
      nowX: 100, startX: 0, targetX: null,
    });
  });

  const series = (from: number, to: number): DayPoint[] =>
    Array.from({ length: 41 }, (_, i) => ({ day: addDays("2026-08-25", i), value: from + ((to - from) * i) / 40 }));
  const spec = (key: string) => COMP.find((c) => c.key === key)!;

  it("builds a composition row: value, 30-day change, green only the good way", () => {
    const fat = buildCompRow(spec("fat"), series(15, 13.2), "2026-10-04", { target: 13 })!;
    expect(fat.valueText).toBe("13.2");
    expect(fat.good).toBe(true); // fat going down
    expect(fat.d30Text.startsWith("−")).toBe(true);
    expect(fat.estimate).toBe(true);
    expect(fat.inBand).toBe(true);
    expect(fat.bandText).toBe("10.0–20.0 %");

    const muscleDown = buildCompRow(spec("skm"), series(42, 41), "2026-10-04")!;
    expect(muscleDown.good).toBe(false); // muscle falling is not green, and it is not red either
    const weight = buildCompRow(spec("weight"), series(84, 82.8), "2026-10-04", { start: 117.3, target: 77 })!;
    expect(weight.estimate).toBe(false);
    expect(weight.start).toBe(117.3);
    expect(weight.inBand).toBe(false);
  });

  it("sorts by change and by outside-band without touching the default order", () => {
    const rows = [
      buildCompRow(spec("fat"), series(13.3, 13.2), "2026-10-04")!,
      buildCompRow(spec("skm"), series(36, 41.3), "2026-10-04")!,
    ];
    expect(sortCompRows(rows, 0).map((r) => r.key)).toEqual(["fat", "skm"]);
    expect(sortCompRows(rows, 1).map((r) => r.key)).toEqual(["skm", "fat"]);
    expect(sortCompRows(rows, 2).map((r) => r.key)).toEqual(["skm", "fat"]); // skm is above its band
  });

  it("returns nothing for a metric with no readings", () => {
    expect(buildCompRow(spec("fat"), [], "2026-10-04")).toBeNull();
  });

  it("compares against a real reading ~30 days back, never a line drawn across a gap", () => {
    // Old scale read 20.7 in July; the new one 14.5 on Sep 11 and 13.2 today.
    // Interpolating to Sep 4 would claim a 2-point drop the new scale never saw.
    const fat: DayPoint[] = [
      { day: "2026-07-28", value: 20.7 }, { day: "2026-09-11", value: 14.5 }, { day: "2026-10-04", value: 13.2 },
    ];
    expect(nearestValue(fat, "2026-09-04")).toBe(14.5);
    expect(buildCompRow(spec("fat"), fat, "2026-10-04")!.d30Text).toBe("−1.3");
  });
});

describe("notes are computed, never a stale sentence", () => {
  it("names his position against the band instead of assuming it", () => {
    expect(bandNote("fat", { value: 13.2, band: [10, 20], start: 34, target: 13 })).toBe(
      "Inside the band and 0.2 from your target. Single readings swing a point either way; the slope is what counts."
    );
    expect(bandNote("fat", { value: 21.4, band: [10, 20], start: 34, target: 13 })).toMatch(/^Above the band and 8.4 from/);
    expect(bandNote("fat", { value: 12.9, band: [10, 20], start: 34, target: 13 })).toMatch(/and at your target/);
  });
  it("reproduces the design's sentences at the design's numbers", () => {
    expect(bandNote("weight", { value: 82.8, band: [59.2, 80.2], start: 117.3, skeletalMuscleKg: 41.3, heightCm: 178 })).toBe(
      "Above the population band for 178 cm, and that is expected at 41 kg of skeletal muscle. The band is context; the trail from 117.3 is the measure."
    );
    expect(bandNote("visceral", { value: 2, band: [1, 9], start: 14 })).toBe(
      "Well inside the band. Under 10 is the healthy range; at 2 there is nothing here to chase."
    );
    expect(bandNote("metAge", { value: 29, band: [20, 32], start: 51, age: 32 })).toBe(
      "Three years under your actual age. A scale summary score, not a clinical one — the gap widening is the trend."
    );
  });
  it("never colours or labels an out-of-band value as a warning", () => {
    for (const spec of COMP) {
      const above = bandNote(spec.key, { value: spec.band[1] + 5, band: spec.band, start: spec.band[1] });
      expect(above).not.toMatch(/\b(HIGH|LOW|warning|danger|too high)\b/i);
    }
  });
  it("fills the two meaning notes that quote his numbers", () => {
    expect(meaningNote("fatMass", { value: 10.92, start: 39.9 })).toContain("10.9 kg today against 39.9 at the start");
    expect(meaningNote("visceral", { value: 2, start: 14 })).toContain("fell from 14 to 2");
    expect(meaningNote("visceral", { value: 12, start: 12 })).not.toContain("fell from");
  });
});

describe("trend chart", () => {
  const daily = designWeight().slice(-90);
  const g = trendChart("weight", daily, "90d")!;

  it("sizes dots by density and labels the ends", () => {
    expect(g.n).toBe(90);
    expect(g.dotR).toBe(1.4);
    expect(g.x1).toBe("OCT 4");
    expect(g.smText).toBe("7-day trend over daily points");
    expect(g.delta).toMatch(/^−\d+\.\d kg · 90d$/);
  });
  it("snaps the scrub to real points and keeps the tooltip on the chart", () => {
    expect(g.indexAt(-50)).toBe(0);
    expect(g.indexAt(9999)).toBe(89);
    const tip = g.tip(89);
    expect(tip.text).toBe("82.8 kg · OCT 4");
    expect(tip.left).toBeLessThanOrEqual(228);
    expect(g.tip(0).left).toBe(0);
  });
  it("runs the line through the raw points when there are fewer than twelve", () => {
    const tape: DayPoint[] = [
      { day: "2025-12-15", value: 118 }, { day: "2026-03-15", value: 106 }, { day: "2026-09-06", value: 88 },
    ];
    const t = trendChart("waist", tape, "Since start")!;
    expect(t.smText).toBe("tape points");
    expect(t.dotR).toBe(3.2);
    expect(t.line.split(" ").length).toBe(3);
  });
  it("spaces points by time, so a gap looks like a gap", () => {
    const gappy: DayPoint[] = [
      { day: "2026-09-01", value: 83 }, { day: "2026-09-02", value: 83 }, { day: "2026-10-01", value: 82 },
    ];
    const t = trendChart("weight", gappy, "30d")!;
    expect(t.raw[1].x - t.raw[0].x).toBeLessThan(20);
    expect(t.raw[2].x).toBe(354);
  });
  it("handles a single point and an empty range", () => {
    expect(trendChart("weight", [], "7d")).toBeNull();
    expect(trendChart("weight", [{ day: "2026-10-04", value: 82.8 }], "7d")!.raw[0].x).toBe(180);
  });
  it("filters a range by days back from today", () => {
    expect(pointsInRange(designWeight(), "7d", TODAY)).toHaveLength(8);
    expect(pointsInRange(designWeight(), "all", TODAY)).toHaveLength(294);
    expect(pointsInRange(designWeight(), "custom", TODAY, { from: "2026-10-01", to: "2026-10-02" })).toHaveLength(2);
  });
});

describe("body-type matrix", () => {
  it("places 26.1 BMI × 13.2% in ATHLETIC and washes that cell", () => {
    const m = bodyTypeMatrix({ bmi: 26.1, bf: 13.2 }, []);
    expect(m.cell.name).toBe("ATHLETIC");
    expect(m.cell).toMatchObject({ x: 90.8, y: 96.4 });
    expect(m.cell.w).toBeCloseTo(62.6, 5);
    expect(m.cell.h).toBeCloseTo(43.1, 5);
    expect(m.captions.filter((c) => c.current).map((c) => c.text)).toEqual(["ATHLETIC"]);
    expect(m.captions).toHaveLength(9);
  });
  it("names the corners per the spec", () => {
    expect(bodyTypeMatrix({ bmi: 37, bf: 34 }, []).cell.name).toBe("CARRYING FAT");
    expect(bodyTypeMatrix({ bmi: 31, bf: 9 }, []).cell.name).toBe("SOLID");
    expect(bodyTypeMatrix({ bmi: 22, bf: 25 }, []).cell.name).toBe("LIGHT · SOFT");
  });
  it("averages each month into one trail point and ends on now", () => {
    const bmi: DayPoint[] = [
      { day: "2025-12-24", value: 36 }, { day: "2025-12-28", value: 35 }, { day: "2026-02-10", value: 33.8 },
    ];
    const fat: DayPoint[] = [
      { day: "2025-12-24", value: 34.7 }, { day: "2025-12-28", value: 33.3 }, { day: "2026-02-10", value: 30.1 },
    ];
    const trail = monthlyTrail(bmi, fat);
    expect(trail).toEqual([
      { month: "2025-12", bmi: 35.5, bf: 34 },
      { month: "2026-02", bmi: 33.8, bf: 30.1 },
    ]);
    const m = bodyTypeMatrix({ bmi: 26.1, bf: 13.2 }, trail);
    expect(m.trail).toHaveLength(2);
    expect(m.trail[1].label).toBe("FEB");
    expect(m.trail[0].label).toBe(""); // the start is unlabelled, as in the design
    expect(m.polyline.split(" ")).toHaveLength(3);
    expect(m.length).toBeGreaterThan(0);
  });
  it("drops labels that would pile up on a plateau", () => {
    const steady = ["2026-07", "2026-08", "2026-09"].map((month) => ({ month, bmi: 26.2, bf: 14 }));
    const m = bodyTypeMatrix({ bmi: 26.1, bf: 13.2 }, [{ month: "2026-01", bmi: 34, bf: 30 }, ...steady]);
    expect(m.trail.filter((t) => t.label).length).toBeLessThanOrEqual(1);
  });
});

describe("body map", () => {
  it("maps % of standard to the spec's opacity curves", () => {
    expect(segmentOpacity("muscle", 110)).toBeCloseTo(0.5 + 10 / 45, 5);
    expect(segmentOpacity("muscle", 121.8)).toBe(0.95); // his arms: past the cap
    expect(segmentOpacity("muscle", 40)).toBe(0.4);
    expect(segmentOpacity("muscle", 200)).toBe(0.95);
    expect(segmentOpacity("fat", 63.2)).toBeCloseTo(0.32 + 13.2 / 100, 5);
    expect(segmentOpacity("fat", 10)).toBe(0.3);
    expect(segmentOpacity("fat", null)).toBe(1);
  });
  it("offsets the balance dot 12px per percent, toward the subject's left", () => {
    const arms = balance(4.19, 4.16);
    expect(arms.text).toBe("L 50.2 · R 49.8");
    expect(arms.offsetPx).toBeCloseTo(((4.19 / 8.35 - 0.5) * 1200), 0);
    expect(balance(4, 4).offsetPx).toBe(0);
  });
  it("is green only when both pairs are within 1%, and never an alarm", () => {
    expect(balanceVerdict(balance(4.19, 4.16), balance(11.86, 11.85))).toEqual({
      text: "Balanced · within 1%", balanced: true,
    });
    const uneven = balanceVerdict(balance(4.4, 4.13), balance(11.86, 11.85))!;
    expect(uneven.balanced).toBe(false);
    expect(uneven.text).toMatch(/^Left arm \+\d\.\d%$/);
    expect(balanceVerdict(null, null)).toBeNull();
  });
  it("names a muscle from its id and finds its segment", () => {
    expect(describeMuscle("arm-left-forearm-flexors")).toEqual({ segment: "armLeft", name: "Left forearm flexors" });
    expect(describeMuscle("trunk-abs-upper-right")).toEqual({ segment: "trunk", name: "Right abs upper" });
    expect(describeMuscle("leg-right-calves")).toEqual({ segment: "legRight", name: "Right calves" });
    expect(describeMuscle("base")).toBeNull();
  });
});

describe("tape", () => {
  const waist = TAPE_SITES.find((s) => s.key === "waist")!;
  const arms = TAPE_SITES.find((s) => s.key === "arms")!;

  it("builds a row: latest value, change since the first tape, sparkline", () => {
    const row = buildTapeRow(waist, [
      { day: "2025-12-15", value: 118 }, { day: "2026-03-15", value: 106 }, { day: "2026-10-04", value: 86.5 },
    ], "2026-10-04")!;
    expect(row.valueText).toBe("86.5");
    expect(row.deltaText).toBe("−31.5");
    expect(row.good).toBe(true);
    expect(row.when).toBe("today");
    expect(row.spark.split(" ")).toHaveLength(3);
  });
  it("is green only for waist, hips and neck going down", () => {
    const row = buildTapeRow(arms, [
      { day: "2025-12-15", value: 40.5 }, { day: "2026-09-06", value: 38.8 },
    ], "2026-10-04")!;
    expect(row.good).toBe(false);
    expect(row.when).toBe("Sep 6");
  });
  it("shows no change across a switch of measuring method", () => {
    // His shoulders: 118.5 cm around, then 50.9 cm across. Not a 67 cm loss.
    const shoulders = TAPE_SITES.find((s) => s.key === "shoulders")!;
    const row = buildTapeRow(shoulders, [
      { day: "2026-03-04", value: 118.5 }, { day: "2026-08-20", value: 50.9 },
    ], "2026-10-04")!;
    expect(row.deltaText).toBe("—");
    expect(row.absDelta).toBe(0);
    // A real 21% drop over three tapes is not mistaken for one.
    const real = buildTapeRow(waist, [
      { day: "2026-02-09", value: 111 }, { day: "2026-03-04", value: 103.9 }, { day: "2026-08-20", value: 87.4 },
    ], "2026-10-04")!;
    expect(real.deltaText).toBe("−23.6");
  });

  it("shows a dash, not +0.0, for a site taped once", () => {
    expect(buildTapeRow(waist, [{ day: "2026-09-06", value: 88 }], "2026-10-04")!.deltaText).toBe("—");
    expect(buildTapeRow(waist, [], "2026-10-04")).toBeNull();
  });
});

describe("voice tape entry", () => {
  it("parses the spec's sentence into two readings", () => {
    expect(parseTapeUtterance("waist 86.5 and hips 96")).toEqual([
      { site: "waist", value: 86.5 },
      { site: "hips", value: 96 },
    ]);
  });
  it("takes commas, filler words and synonyms", () => {
    expect(parseTapeUtterance("Belly is 86.5, chest at 101, bicep 38.9")).toEqual([
      { site: "waist", value: 86.5 },
      { site: "chest", value: 101 },
      { site: "arms", value: 38.9 },
    ]);
    expect(parseTapeUtterance("thigh 60 calf 39 shoulders 121")).toEqual([
      { site: "legs", value: 60 },
      { site: "calves", value: 39 },
      { site: "shoulders", value: 121 },
    ]);
  });
  it("does not mistake forearm for arm", () => {
    expect(parseTapeUtterance("forearm 30.4 arm 38.9")).toEqual([
      { site: "forearms", value: 30.4 },
      { site: "arms", value: 38.9 },
    ]);
  });
  it("understands Spanish and a decimal comma", () => {
    expect(parseTapeUtterance("cintura 86,5 y cadera 96")).toEqual([
      { site: "waist", value: 86.5 },
      { site: "hips", value: 96 },
    ]);
  });
  it("drops what it cannot trust and returns nothing for no site", () => {
    expect(parseTapeUtterance("waist 865")).toEqual([]);
    expect(parseTapeUtterance("waist 5")).toEqual([]);
    expect(parseTapeUtterance("I weighed 82.8 today")).toEqual([]);
    expect(parseTapeUtterance("")).toEqual([]);
  });
  it("keeps the last value when a site is repeated", () => {
    expect(parseTapeUtterance("waist 88, no, waist 86.5")).toEqual([{ site: "waist", value: 86.5 }]);
  });
  it("keypad: five characters, one decimal, no leading dot", () => {
    let v = "";
    for (const k of ["8", "6", ".", "5", "9", "."]) v = keypadPress(v, k);
    expect(v).toBe("86.5");
    expect(keypadPress("", ".")).toBe("");
    expect(keypadPress("12345", "6")).toBe("12345");
    expect(keypadPress("86.5", "⌫")).toBe("86.");
  });
});

describe("milestones", () => {
  const weight: DayPoint[] = [
    { day: "2025-12-24", value: 113.55 }, { day: "2026-02-20", value: 107.1 }, { day: "2026-04-03", value: 99.6 },
    { day: "2026-08-09", value: 87.3 }, { day: "2026-10-04", value: 82.8 },
  ];
  const bmi: DayPoint[] = [{ day: "2025-12-24", value: 35.8 }, { day: "2026-06-11", value: 29.9 }, { day: "2026-09-12", value: 26.1 }];
  const fat: DayPoint[] = [{ day: "2025-12-24", value: 34.7 }, { day: "2026-09-12", value: 14.5 }];
  const auto = autoMilestones({ weight, bmi, fat, today: "2026-10-04" });

  it("opens on the fixed start and closes on today", () => {
    expect(auto[0]).toMatchObject({ day: "2025-12-15", title: "Started", weightKg: 117.3 });
    expect(auto[auto.length - 1]).toMatchObject({ title: "Today", weightKg: 82.8, note: "−34.5 kg · 42 weeks" });
  });
  it("dates each crossing to the first reading over the line", () => {
    const by = Object.fromEntries(auto.map((m) => [m.title, m.day]));
    expect(by["First 10 kg gone"]).toBe("2026-02-20"); // 107.1 ≤ 107.3
    expect(by["Under 100"]).toBe("2026-04-03");
    expect(by["30 kg gone"]).toBe("2026-08-09"); // 87.3 ≤ 87.3
    expect(by["BMI under 30"]).toBe("2026-06-11");
    expect(by["BMI under 27"]).toBe("2026-09-12");
    expect(by["Body fat under 15%"]).toBe("2026-09-12");
  });
  it("omits a line he has not crossed", () => {
    const early = autoMilestones({ weight: weight.slice(0, 2), bmi: bmi.slice(0, 1), fat: fat.slice(0, 1), today: "2026-02-20" });
    expect(early.map((m) => m.title)).toEqual(["Started", "First 10 kg gone", "Today"]);
  });
  it("interleaves logged entries by date and keeps Today last", () => {
    const merged = mergeMilestones(auto, [
      { day: "2026-07-19", title: "Swing PR · 32 kg × 10", weightKg: 88.6, kind: "logged" },
      { day: "2026-10-04", title: "Into size 32", weightKg: 82.8, kind: "logged" },
    ]);
    const titles = merged.map((m) => m.title);
    expect(titles.indexOf("Swing PR · 32 kg × 10")).toBeLessThan(titles.indexOf("30 kg gone"));
    expect(titles[titles.length - 1]).toBe("Today");
  });
});

describe("change of scale", () => {
  const fat: DayPoint[] = [
    { day: "2026-07-28", value: 20.7 }, { day: "2026-09-11", value: 14.5 }, { day: "2026-10-04", value: 13.2 },
  ];
  it("owes a sentence when an estimate is drawn across the swap", () => {
    expect(scaleChangeNote("fat", fat, "2026-09-11")).toBe(
      "Readings before Sep 11 are from your previous scale. The step there is the two scales disagreeing, not your body."
    );
  });
  it("says nothing when the range sits on one side of it", () => {
    expect(scaleChangeNote("fat", fat.slice(1), "2026-09-11")).toBeNull();
    expect(scaleChangeNote("fat", fat.slice(0, 1), "2026-09-11")).toBeNull();
    expect(scaleChangeNote("fat", fat, null)).toBeNull();
  });
  it("never applies to weight or tape, which are measured", () => {
    expect(scaleChangeNote("weight", fat, "2026-09-11")).toBeNull();
    expect(scaleChangeNote("waist", fat, "2026-09-11")).toBeNull();
  });
});

describe("small text", () => {
  it("says how long ago the newest reading arrived", () => {
    const now = Date.UTC(2026, 9, 5, 12);
    expect(agoText(now - 20_000, now)).toBe("just now");
    expect(agoText(now - 12 * 60_000, now)).toBe("12 min ago");
    expect(agoText(now - 9 * 3600_000, now)).toBe("9 h ago");
    expect(agoText(now - 5 * 86_400_000, now)).toBe("5 d ago");
  });
  it("names the device and the route a reading took", () => {
    expect(sourceLines({ source: "apple_health", externalId: "renpho:1", fieldSources: { weightKg: "renpho_api" } })).toEqual({
      device: "RENPHO scale", via: "via Apple Health",
    });
    expect(sourceLines({ source: "mcp", fieldSources: { weightKg: "renpho_api" } }).via).toBe("logged through Claude");
    expect(sourceLines({ source: "vesync" })).toEqual({ device: "Etekcity scale", via: "VeSync import" });
    expect(sourceLines({ source: null })).toEqual({ device: "Scale", via: "source unknown" });
  });
});
