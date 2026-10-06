import { describe, expect, it } from "vitest";
import {
  analyzeIntervals,
  formatClock,
  formatJumpRopePR,
  groupByProtocol,
  jumpRopeExerciseRow,
  jumpRopePRCandidates,
  jumpSecondsOf,
  protocolKey,
  readIntervals,
  type IntervalRecord,
} from "@/lib/jump-rope";
import { activityTypeOf, isDistanceType } from "@/lib/activities";

// A synthetic 30/30 session: HR climbs through each work interval and falls
// through each rest, with the peak right at the end of work and the trough
// right at the end of rest. `base` rises per round to model drift.
function session(rounds: number, opts: { work?: number; rest?: number; drift?: number; step?: number } = {}) {
  const work = opts.work ?? 30;
  const rest = opts.rest ?? 30;
  const drift = opts.drift ?? 0;
  const step = opts.step ?? 5;
  const marks: [number, number][] = [];
  const time: number[] = [];
  const hr: number[] = [];
  const period = work + rest;
  for (let r = 0; r < rounds; r++) marks.push([r * period, r * period + work]);
  for (let t = 0; t <= rounds * period; t += step) {
    const r = Math.min(Math.floor(t / period), rounds - 1);
    const into = t - r * period;
    const low = 120 + r * drift;
    const high = 160 + r * drift;
    const v =
      into <= work
        ? low + ((high - low) * into) / work
        : high - ((high - low) * (into - work)) / rest;
    time.push(t);
    hr.push(Math.round(v));
  }
  const intervals: IntervalRecord = {
    mode: "interval",
    workSeconds: work,
    restSeconds: rest,
    plannedRounds: rounds,
    roundsCompleted: rounds,
    jumpSeconds: rounds * work,
    restSecondsTotal: rounds * rest,
    marks,
    source: "measured",
  };
  return { intervals, time, hr, duration: rounds * period };
}

describe("readIntervals", () => {
  it("reads a measured record and sorts its marks", () => {
    const rec = readIntervals({
      intervals: {
        mode: "interval",
        workSeconds: 30,
        restSeconds: 30,
        roundsCompleted: 2,
        marks: [
          [60, 90],
          [0, 30],
        ],
      },
    });
    expect(rec?.marks).toEqual([
      [0, 30],
      [60, 90],
    ]);
    // jumpSeconds falls back to the sum of the marks
    expect(rec?.jumpSeconds).toBe(60);
    expect(rec?.source).toBe("measured");
  });

  it("returns null for anything that is not an interval record", () => {
    expect(readIntervals(null)).toBeNull();
    expect(readIntervals({})).toBeNull();
    expect(readIntervals({ intervals: { mode: "tabata" } })).toBeNull();
    expect(readIntervals({ intervals: "30/30" })).toBeNull();
  });

  it("drops malformed marks instead of throwing", () => {
    const rec = readIntervals({
      intervals: { mode: "interval", workSeconds: 30, roundsCompleted: 1, marks: [[10, 5], ["a", 2], [0, 30]] },
    });
    expect(rec?.marks).toEqual([[0, 30]]);
  });

  it("keeps his own count and the wrist estimate apart", () => {
    const rec = readIntervals({
      intervals: {
        mode: "continuous",
        roundsCompleted: 1,
        jumpSeconds: 300,
        jumps: { total: 640, source: "manual" },
        jumpsEstimated: { total: 655, algo: "gyro-zc-1" },
      },
    });
    expect(rec?.jumps).toEqual({ source: "manual", total: 640 });
    expect(rec?.jumpsEstimated).toEqual({ total: 655, algo: "gyro-zc-1" });
  });
});

describe("protocolKey / exercise row", () => {
  it("names the protocol", () => {
    expect(protocolKey({ mode: "interval", workSeconds: 30, restSeconds: 30 })).toBe("30/30");
    expect(protocolKey({ mode: "interval", workSeconds: 45, restSeconds: 15 })).toBe("45/15");
    expect(protocolKey({ mode: "continuous" })).toBe("continuous");
  });

  it("builds his own row shape: sets = rounds, seconds = work per round", () => {
    const { intervals } = session(17);
    expect(jumpRopeExerciseRow(intervals)).toEqual({
      name: "Jump Rope",
      exercise: "jump-rope",
      sets: 17,
      seconds: 30,
    });
  });

  it("continuous is one set of the whole jump", () => {
    expect(
      jumpRopeExerciseRow({
        mode: "continuous",
        roundsCompleted: 1,
        jumpSeconds: 420,
        restSecondsTotal: 0,
        source: "measured",
      })
    ).toEqual({ name: "Jump Rope", exercise: "jump-rope", sets: 1, seconds: 420 });
  });
});

describe("analyzeIntervals", () => {
  it("finds each round's peak, trough and drop", () => {
    const s = session(6);
    const a = analyzeIntervals({
      intervals: s.intervals,
      hrStream: s.hr,
      timeStream: s.time,
      durationSeconds: s.duration,
      caloriesBurned: 60,
    });
    expect(a.rounds).toHaveLength(6);
    expect(a.rounds[0].peak).toBe(160);
    expect(a.rounds[0].trough).toBe(120);
    expect(a.rounds[0].drop).toBe(40);
    expect(a.avgDrop).toBe(40);
    expect(a.protocol).toBe("30/30");
  });

  it("splits the averages by work and rest", () => {
    const s = session(8);
    const a = analyzeIntervals({
      intervals: s.intervals,
      hrStream: s.hr,
      timeStream: s.time,
      durationSeconds: s.duration,
    });
    // Symmetric triangle wave: both halves average the midpoint.
    expect(a.avgWorkHr).toBe(140);
    expect(a.avgRestHr).toBe(140);
  });

  it("reports cardiac drift, first third vs last third", () => {
    const s = session(9, { drift: 2 });
    const a = analyzeIntervals({
      intervals: s.intervals,
      hrStream: s.hr,
      timeStream: s.time,
      durationSeconds: s.duration,
    });
    expect(a.drift).not.toBeNull();
    // rounds 1–3 vs 7–9: six rounds apart at +2 bpm a round
    expect(a.drift!.delta).toBe(12);
    expect(a.drift!.last).toBeGreaterThan(a.drift!.first);
  });

  it("flags rising troughs as not recovering", () => {
    const rising = session(10, { drift: 2 });
    const flat = session(10);
    const up = analyzeIntervals({
      intervals: rising.intervals,
      hrStream: rising.hr,
      timeStream: rising.time,
      durationSeconds: rising.duration,
    });
    const steady = analyzeIntervals({
      intervals: flat.intervals,
      hrStream: flat.hr,
      timeStream: flat.time,
      durationSeconds: flat.duration,
    });
    expect(up.troughTrend?.rising).toBe(true);
    expect(steady.troughTrend?.rising).toBe(false);
  });

  it("jump time, share of the session and calories per jumping minute", () => {
    const s = session(10);
    const a = analyzeIntervals({
      intervals: s.intervals,
      hrStream: s.hr,
      timeStream: s.time,
      durationSeconds: s.duration,
      caloriesBurned: 100,
    });
    expect(a.jumpSeconds).toBe(300);
    expect(a.jumpPct).toBe(50);
    expect(a.kcalPerJumpMinute).toBe(20);
    expect(a.longestJumpSeconds).toBe(30);
  });

  it("still answers on a coarse stream, and says how coarse it is", () => {
    const s = session(6, { step: 10 });
    const a = analyzeIntervals({
      intervals: s.intervals,
      hrStream: s.hr,
      timeStream: s.time,
      durationSeconds: s.duration,
    });
    expect(a.hrResolutionSeconds).toBe(10);
    expect(a.rounds[2].peak).toBe(160);
  });

  it("a declared session has protocol numbers and no rounds", () => {
    const a = analyzeIntervals({
      intervals: {
        mode: "interval",
        workSeconds: 30,
        restSeconds: 30,
        roundsCompleted: 29,
        jumpSeconds: 870,
        restSecondsTotal: 870,
        source: "declared",
      },
      durationSeconds: 1740,
      caloriesBurned: 313,
    });
    expect(a.rounds).toEqual([]);
    expect(a.drift).toBeNull();
    expect(a.avgWorkHr).toBeNull();
    expect(a.jumpPct).toBe(50);
    expect(a.source).toBe("declared");
  });

  it("no HR stream means no HR numbers, never invented ones", () => {
    const s = session(4);
    const a = analyzeIntervals({ intervals: s.intervals, durationSeconds: s.duration });
    expect(a.rounds[0].peak).toBeNull();
    expect(a.avgDrop).toBeNull();
    expect(a.hrResolutionSeconds).toBeNull();
  });

  it("jumps come only from his count; the estimate stays separate", () => {
    const s = session(4);
    const a = analyzeIntervals({
      intervals: {
        ...s.intervals,
        jumps: { total: 260, source: "manual" },
        jumpsEstimated: { total: 251, algo: "gyro-zc-1" },
      },
      durationSeconds: s.duration,
    });
    expect(a.jumps).toBe(260);
    expect(a.jumpsPerMinute).toBe(130);
    expect(a.jumpsEstimated).toBe(251);
  });

  it("an estimate alone is not a jump count", () => {
    const s = session(4);
    const a = analyzeIntervals({
      intervals: { ...s.intervals, jumpsEstimated: { total: 251, algo: "gyro-zc-1" } },
      durationSeconds: s.duration,
    });
    expect(a.jumps).toBeNull();
    expect(a.jumpsEstimated).toBe(251);
  });
});

describe("jumpRopePRCandidates", () => {
  it("rounds are per protocol; duration is the longest unbroken jump", () => {
    const { intervals } = session(17);
    const c = jumpRopePRCandidates({ intervals });
    expect(c).toContainEqual({
      exercise: "jump-rope@30-30",
      exerciseName: "Jump Rope · 30/30",
      kind: "rounds",
      value: 17,
      unit: "rounds",
    });
    expect(c.find((x) => x.kind === "duration")?.value).toBe(30);
    expect(c.some((x) => x.kind === "jumps")).toBe(false);
  });

  it("jump records need his own count", () => {
    const { intervals } = session(3);
    const estimated = jumpRopePRCandidates({
      intervals: { ...intervals, jumpsEstimated: { total: 400, algo: "x" } },
    });
    expect(estimated.some((x) => x.kind === "jumps")).toBe(false);
    const counted = jumpRopePRCandidates({
      intervals: { ...intervals, jumps: { source: "manual", perRound: [60, 72, 65] } },
    });
    expect(counted.find((x) => x.kind === "jumps")?.value).toBe(197);
    expect(counted.find((x) => x.kind === "jumps_round")?.value).toBe(72);
  });

  it("a non-interval row yields nothing", () => {
    expect(jumpRopePRCandidates({})).toEqual([]);
    expect(jumpRopePRCandidates(null)).toEqual([]);
  });
});

describe("grouping and formatting", () => {
  it("groups sessions by protocol, oldest first", () => {
    const a = session(10);
    const b = session(12);
    const c = session(5, { work: 45, rest: 15 });
    const groups = groupByProtocol([
      { id: "b", startedAt: "2026-10-06T10:00:00Z", durationMinutes: 12, metricsData: { intervals: b.intervals } },
      { id: "c", startedAt: "2026-10-05T10:00:00Z", durationMinutes: 5, metricsData: { intervals: c.intervals } },
      { id: "a", startedAt: "2026-10-04T10:00:00Z", durationMinutes: 10, metricsData: { intervals: a.intervals } },
      { id: "x", startedAt: "2026-10-03T10:00:00Z", durationMinutes: 10, metricsData: {} },
    ]);
    expect(groups.map((g) => g.protocol)).toEqual(["30/30", "45/15"]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(groups[0].bestRounds).toBe(12);
  });

  it("jumpSecondsOf is zero for anything that is not jump rope", () => {
    const { intervals } = session(4);
    expect(jumpSecondsOf({ workoutType: "jump_rope", metricsData: { intervals } })).toBe(120);
    expect(jumpSecondsOf({ workoutType: "freestyle", metricsData: { intervals } })).toBe(0);
  });

  it("formats records and clocks", () => {
    expect(formatJumpRopePR("rounds", 29)).toBe("29 rounds");
    expect(formatJumpRopePR("duration", 270)).toBe("4:30");
    expect(formatJumpRopePR("jumps", 1240)).toBe("1,240 jumps");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("card typing", () => {
  it("jump rope is its own card, whatever distance the row carries", () => {
    expect(
      activityTypeOf({ workoutType: "jump_rope", distanceMeters: 7079, metricsData: null })
    ).toBe("rope");
  });

  it("only ground-covering types count as distance", () => {
    expect(isDistanceType("walk")).toBe(true);
    expect(isDistanceType("treadmill_walk")).toBe(true);
    expect(isDistanceType("freestyle")).toBe(false);
    expect(isDistanceType("jump_rope")).toBe(false);
  });
});
