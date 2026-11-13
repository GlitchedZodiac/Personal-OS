import { describe, expect, it, vi, beforeEach } from "vitest";

// MCP v2 Phase D (2026-11-12): targets as rules, update_settings, and the
// day ledger's math — the number he looks at every day.

let settingsRow: { data: Record<string, unknown> } | null = null;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: {
      findUnique: vi.fn(async () => settingsRow),
      upsert: vi.fn(async ({ update }: { update: { data: Record<string, unknown> } }) => {
        settingsRow = { data: update.data };
        return settingsRow;
      }),
    },
    recordChange: { createMany: vi.fn(async () => ({ count: 0 })) },
  },
}));

import {
  applyTargetsPatch,
  legacyFromRest,
  readTargets,
  resolveDayTarget,
  restFromLegacy,
} from "@/lib/targets";
import { applySettingsPatch, mirrorLegacyFromTargets } from "@/lib/settings-patch";
import { buildDayRow, buildWeekly, ledgerRange, type DayInputs, type DayRow } from "@/lib/day-ledger";
import { V2_TOOLS } from "@/lib/mcp/tools-v2";

const REST = { kcal: 2000, proteinG: 160, fatG: 65, carbsG: 205 };
const TRAINING = { kcal: 2300, proteinG: 160, fatG: 70, carbsG: 270 };

describe("targets", () => {
  it("derive from the legacy keys when none are stored", () => {
    expect(restFromLegacy({ calorieTarget: 2000, proteinPct: 32, carbsPct: 40, fatPct: 28 })).toEqual({
      kcal: 2000,
      proteinG: 160,
      carbsG: 200,
      fatG: 62,
    });
    const t = readTargets({});
    expect(t.rest.kcal).toBe(2000);
    expect(t.training).toBeNull();
    expect(t.tdee.tefPct).toBe(10);
  });

  it("mirror back into the legacy keys every screen reads", () => {
    expect(legacyFromRest(REST)).toEqual({ calorieTarget: 2000, proteinPct: 32, carbsPct: 41, fatPct: 29 });
  });

  it("pick the training target once the day's workouts pass the rule", () => {
    const t = { ...readTargets({}), rest: REST, training: TRAINING, trainingDayRule: { minWorkoutKcal: 300 } };
    expect(resolveDayTarget(t, 299)).toEqual({ dayType: "rest", target: REST });
    expect(resolveDayTarget(t, 300)).toEqual({ dayType: "training", target: TRAINING });
    expect(resolveDayTarget({ ...t, training: null }, 900).dayType).toBe("rest");
  });

  it("patch partially, validate ranges, warn when macros don't add up", () => {
    const base = { ...readTargets({}), rest: REST };
    const ok = applyTargetsPatch(base, { rest: { kcal: 1900 } }, "mcp");
    expect("targets" in ok && ok.targets.rest).toEqual({ ...REST, kcal: 1900 });
    expect("targets" in ok && ok.warnings.length).toBe(1); // 2045 kcal of macros vs 1900
    expect(applyTargetsPatch(base, { rest: { kcal: 100 } }, "mcp")).toEqual({
      error: "targets.rest.kcal must be a number from 800 to 6000",
    });
    expect(applyTargetsPatch(base, { training: { kcal: 2300 } }, "mcp")).toEqual({
      error: "targets.training.proteinG is missing",
    });
    expect(applyTargetsPatch(base, { tdee: { bmr: { source: "fixed" } } }, "mcp")).toHaveProperty("error");
    expect(applyTargetsPatch(base, { colour: "red" }, "mcp")).toHaveProperty("error");
    const cleared = applyTargetsPatch({ ...base, training: TRAINING }, { training: null }, "mcp");
    expect("targets" in cleared && cleared.targets.training).toBeNull();
  });
});

describe("applySettingsPatch", () => {
  it("writes targets and the mirrored legacy keys, reporting each change", () => {
    const r = applySettingsPatch({ calorieTarget: 2200, proteinPct: 30, carbsPct: 40, fatPct: 30 }, { targets: { rest: REST } });
    if ("error" in r) throw new Error(r.error);
    expect(r.next.calorieTarget).toBe(2000);
    expect((r.next.targets as { rest: unknown }).rest).toEqual(REST);
    expect(r.changes.map((c) => c.key)).toEqual(["targets", "calorieTarget", "proteinPct", "carbsPct", "fatPct"]);
    expect(r.changes.find((c) => c.key === "calorieTarget")).toEqual({ key: "calorieTarget", before: 2200, after: 2000 });
  });

  it("refuses the legacy keys and anything not writable", () => {
    expect(applySettingsPatch({}, { calorieTarget: 1800 })).toHaveProperty("error");
    expect(applySettingsPatch({}, { timeZone: "UTC" })).toHaveProperty("error");
    expect(applySettingsPatch({}, { finance: {} })).toHaveProperty("error");
    expect(applySettingsPatch({}, {})).toHaveProperty("error");
  });

  it("standing rules replace the old text and keep the other instruction keys", () => {
    const r = applySettingsPatch(
      { aiInstructions: { health: "old", finance: "keep me" } },
      { "aiInstructions.health": "  Log jump rope EMOMs as intervals.  " }
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.next.aiInstructions).toEqual({ health: "Log jump rope EMOMs as intervals.", finance: "keep me" });
    expect(applySettingsPatch({}, { "aiInstructions.health": "x".repeat(2001) })).toHaveProperty("error");
  });

  it("checks goals and HR zones", () => {
    expect(applySettingsPatch({}, { hrZoneTops: [120, 150, 165, 180] })).not.toHaveProperty("error");
    expect(applySettingsPatch({}, { hrZoneTops: [150, 120, 165, 180] })).toHaveProperty("error");
    expect(applySettingsPatch({}, { bodyGoals: { goalWeightKg: 77 } })).not.toHaveProperty("error");
    expect(applySettingsPatch({}, { bodyGoals: { goalWeightKg: 7 } })).toHaveProperty("error");
    expect(applySettingsPatch({}, { workoutGoals: { daysPerWeek: 9 } })).toHaveProperty("error");
  });

  it("a whole-blob app save cannot move the goal away from targets", () => {
    const body = mirrorLegacyFromTargets({ calorieTarget: 2200, targets: { rest: REST } });
    expect(body.calorieTarget).toBe(2000);
    expect(mirrorLegacyFromTargets({ calorieTarget: 2200 }).calorieTarget).toBe(2200);
  });
});

describe("update_settings over MCP", () => {
  const tool = V2_TOOLS.find((t) => t.def.name === "update_settings")!;
  beforeEach(() => {
    settingsRow = { data: { calorieTarget: 2200, proteinPct: 30, carbsPct: 40, fatPct: 30, timeZone: "America/Bogota" } };
  });

  it("needs a reason", async () => {
    expect(await tool.handler({ patch: { targets: { rest: REST } } })).toHaveProperty("error");
  });

  it("saves, keeps keys it didn't touch, and says what changed", async () => {
    const out = (await tool.handler({ patch: { targets: { rest: REST, training: TRAINING } }, reason: "New targets" })) as {
      changes: { key: string }[];
    };
    expect(out.changes.map((c) => c.key)).toContain("targets");
    expect(settingsRow!.data.calorieTarget).toBe(2000);
    expect(settingsRow!.data.timeZone).toBe("America/Bogota");
    const again = (await tool.handler({ patch: { targets: { rest: REST, training: TRAINING } }, reason: "Again" })) as {
      changes: unknown[];
      note?: string;
    };
    // updatedAt moves, so only the stamp would differ — the macros do not.
    expect(again.changes.every((c) => (c as { key: string }).key === "targets")).toBe(true);
  });
});

// ── The ledger ──────────────────────────────────────────────────────────────

const targets = { ...readTargets({}), rest: REST, training: TRAINING, trainingDayRule: { minWorkoutKcal: 300 } };

function day(over: Partial<DayInputs> = {}): DayInputs {
  return {
    date: "2026-11-10",
    isToday: false,
    food: [{ calories: 1640, proteinG: 150, carbsG: 150, fatG: 55 }],
    workouts: [],
    health: { steps: 6200, activeEnergyKcal: 300, restingHeartRateBpm: 58, hrvMs: 70 },
    bmr: { kcal: 1750, source: "scale 2026-10-24" },
    ...over,
  };
}

describe("buildDayRow", () => {
  it("adds up the energy estimate and the deficit", () => {
    const row = buildDayRow(day(), targets);
    expect(row.dayType).toBe("rest");
    expect(row.eaten.kcal).toBe(1640);
    expect(row.remaining).toEqual({ kcal: 360, proteinG: 10 });
    // 1750 + 164 (10% of 1640) + 248 (6200 × 0.04) + 0
    expect(row.tdee).toEqual({ total: 2162, bmr: 1750, bmrSource: "scale 2026-10-24", tef: 164, neat: 248, workouts: 0 });
    expect(row.deficit).toBe(522);
    expect(row.net).toBe(1640);
    expect(row.dataQuality).toEqual([]);
  });

  it("does not count a walk twice — its steps leave the NEAT", () => {
    const row = buildDayRow(
      day({ workouts: [{ id: "w1", workoutType: "walk", caloriesBurned: 310, stepCount: 2900, source: "app_watch" }] }),
      targets
    );
    expect(row.dayType).toBe("training");
    expect(row.target).toEqual(TRAINING);
    expect(row.activity.stepsOutsideWorkouts).toBe(3300);
    expect(row.tdee!.neat).toBe(132);
    expect(row.tdee!.workouts).toBe(310);
    expect(row.net).toBe(1330);
  });

  it("flags implausible Apple active energy and never uses it", () => {
    const row = buildDayRow(day({ health: { steps: 4385, activeEnergyKcal: 1.3, restingHeartRateBpm: null, hrvMs: null } }), targets);
    expect(row.activity.activeEnergyTrusted).toBe(false);
    expect(row.dataQuality[0]).toContain("active energy looks wrong");
    expect(row.tdee!.total).toBe(1750 + 164 + 175);
  });

  it("says what is missing instead of guessing", () => {
    const noBmr = buildDayRow(day({ bmr: null, health: null }), targets);
    expect(noBmr.tdee).toBeNull();
    expect(noBmr.deficit).toBeNull();
    expect(noBmr.dataQuality.join(" ")).toMatch(/No step count.*No BMR/);
    const low = buildDayRow(day({ food: [{ calories: 500, proteinG: 20, carbsG: 50, fatG: 20 }] }), targets);
    expect(low.dataQuality.join(" ")).toContain("probably incomplete logging");
    const noKcal = buildDayRow(
      day({ workouts: [{ id: "w9", workoutType: "strength", caloriesBurned: null, stepCount: null, source: "mcp" }] }),
      targets
    );
    expect(noKcal.dataQuality.join(" ")).toContain("has no calories");
  });

  it("marks today partial and doesn't call it incomplete logging", () => {
    const row = buildDayRow(day({ isToday: true, food: [] }), targets);
    expect(row.partial).toBe(true);
    expect(row.dataQuality.join(" ")).not.toContain("No food logged");
  });
});

describe("buildWeekly", () => {
  const today = "2026-11-12";
  const rows = (kcal: number, deficit: number): DayRow[] =>
    Array.from({ length: 14 }, (_, i) => {
      const date = `2026-10-${String(29 + i).padStart(2, "0")}`.replace(/2026-10-(3[2-9]|4\d)/, (m) => {
        const d = Number(m.slice(-2)) - 31;
        return `2026-11-${String(d).padStart(2, "0")}`;
      });
      return {
        ...buildDayRow(day({ date, food: [{ calories: kcal, proteinG: 150, carbsG: 150, fatG: 55 }] }), targets),
        deficit,
      };
    });

  it("uses the last 7 complete days and predicts the weekly change", () => {
    const weighIns = [
      { id: "a", date: "2026-10-30", kg: 82.6 },
      { id: "b", date: "2026-11-03", kg: 82.5 },
      { id: "c", date: "2026-11-08", kg: 82.35 },
      { id: "d", date: "2026-11-10", kg: 82.4 },
      { id: "e", date: "2026-11-11", kg: 78.95 }, // someone else on the scale
      { id: "f", date: "2026-11-12", kg: 82.2 },
    ];
    const w = buildWeekly(rows(1800, 550), weighIns, today);
    expect(w.window).toMatchObject({ from: "2026-11-05", to: "2026-11-11" });
    expect(w.intake.avgKcal).toBe(1800);
    expect(w.deficit.avgKcal).toBe(550);
    expect(w.predictedChangeKg).toBe(-0.5);
    expect(w.weight.outliersExcluded).toEqual([{ id: "e", date: "2026-11-11", kg: 78.95 }]);
    expect(w.weight.avgKg).toBe(82.32);
    expect(w.weight.previousAvgKg).toBe(82.55);
    expect(w.weight.changeKg).toBe(-0.23);
    expect(w.verdict).toContain("less than the math predicts");
    expect(w.dataQuality.join(" ")).toContain("outliers");
  });

  it("says when there isn't enough to judge", () => {
    const w = buildWeekly(rows(1800, 550), [], today);
    expect(w.verdict).toContain("Not enough data");
    expect(w.dataQuality).toContain("No weigh-ins in the last 14 days");
  });

  it("flags a long gap without weigh-ins", () => {
    const w = buildWeekly(rows(1800, 550), [{ id: "a", date: "2026-11-01", kg: 82.4 }], today);
    expect(w.weight.daysSinceLastWeighIn).toBe(11);
    expect(w.dataQuality).toContain("No weigh-in for 11 days");
  });
});

describe("ledgerRange", () => {
  it("defaults to today, honours days and clamps to 31", () => {
    expect(ledgerRange({}, "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-12" });
    expect(ledgerRange({ days: 7 }, "2026-11-12")).toEqual({ from: "2026-11-06", to: "2026-11-12" });
    expect(ledgerRange({ days: 400 }, "2026-11-12").from).toBe("2026-10-13");
    expect(ledgerRange({ from: "2026-01-01", to: "2026-11-12" }, "2026-11-12").from).toBe("2026-10-13");
    expect(ledgerRange({ from: "2026-11-20", to: "2026-11-12" }, "2026-11-12").from).toBe("2026-11-12");
  });
});
