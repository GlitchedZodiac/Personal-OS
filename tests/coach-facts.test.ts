import { describe, expect, it, vi } from "vitest";

// The Coach's facts layer (docs/coach-plan.md §2.1): rows in, facts out.
// Driven entirely by the synthetic fixture week — nothing here is his data.
// lib/prs.ts and lib/health-coach.ts import the Prisma client for their
// database halves; the pure helpers the builder uses never touch it.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildWeekFacts, factByKey, factsForModel, factsInGroup } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import { DEFAULT_FACTS_OPTIONS, type Fact, type FactsOptions, type WeekFacts, type WeekInput, type WorkoutRow } from "@/lib/coach/types";
import { isoWeekNumber } from "@/lib/timezone";
import {
  FIXTURE_SETTINGS,
  FIXTURE_TIME_ZONE,
  FIXTURE_WEEK_START,
  type FixtureKind,
  fixtureRows,
  fixtureSource,
} from "@/tests/fixtures/coach-week";

const SUNDAY_EVENING = new Date("2026-10-12T00:00:00Z"); // Sun Oct 11, 19:00 Bogotá
const MONDAY_MORNING = new Date("2026-10-12T12:00:00Z"); // Mon Oct 12, 07:00 — the week is over
const WEDNESDAY_NOON = new Date("2026-10-07T17:00:00Z"); // Wed Oct 7, 12:00

async function build(kind: FixtureKind, now = SUNDAY_EVENING, options?: Partial<FactsOptions>, weekStart = FIXTURE_WEEK_START): Promise<WeekFacts> {
  const input = await loadWeekInput(fixtureSource(kind), { weekStart, timeZone: FIXTURE_TIME_ZONE, now, options });
  return buildWeekFacts(input);
}

const value = (facts: WeekFacts, key: string) => factByKey(facts, key)?.value;
const fact = (facts: WeekFacts, key: string): Fact => {
  const f = factByKey(facts, key);
  if (!f) throw new Error(`missing fact ${key}`);
  return f;
};
const keys = (facts: WeekFacts, prefix: string) => facts.facts.filter((f) => f.key.startsWith(prefix)).map((f) => f.key);

function emptyInput(cutoff = SUNDAY_EVENING): WeekInput {
  return {
    weekStart: "2026-10-05",
    timeZone: "America/Bogota",
    now: cutoff,
    cutoff,
    options: DEFAULT_FACTS_OPTIONS,
    settings: FIXTURE_SETTINGS,
    food: [],
    workouts: [],
    records: [],
    body: [],
    lastWeighInBefore: null,
    snapshots: [],
    activity: [],
    plans: [],
    sequences: [],
    trails: [],
    previousTrailRuns: [],
    water: [],
    journal: [],
    progression: [],
  };
}

const workout = (id: string, iso: string, extra: Partial<WorkoutRow> = {}): WorkoutRow => ({
  id,
  startedAt: new Date(iso),
  workoutType: "strength",
  durationMinutes: 40,
  caloriesBurned: null,
  distanceMeters: null,
  elevationGainM: null,
  avgHeartRateBpm: null,
  exercises: null,
  metricsData: null,
  trailId: null,
  ...extra,
});

describe("the evidence itself", () => {
  it("mints sequential unique ids, unique keys, and a table on every fact", async () => {
    const facts = await build("full");
    expect(facts.facts.length).toBeGreaterThan(60);
    facts.facts.forEach((f, i) => {
      expect(f.id).toBe(`f${i + 1}`);
      expect(f.source.table).toBeTruthy();
      expect(f.label).toBeTruthy();
    });
    expect(new Set(facts.facts.map((f) => f.key)).size).toBe(facts.facts.length);
  });

  it("every derived fact cites facts that exist; aggregates cap ids at 50 and dates at 14", async () => {
    const facts = await build("full");
    const ids = new Set(facts.facts.map((f) => f.id));
    const derived = facts.facts.filter((f) => f.derivedFrom);
    expect(derived.length).toBeGreaterThan(10);
    for (const f of derived) for (const id of f.derivedFrom!) expect(ids.has(id)).toBe(true);
    for (const f of facts.facts) {
      expect((f.source.ids ?? []).length).toBeLessThanOrEqual(50);
      expect((f.source.dates ?? []).length).toBeLessThanOrEqual(14);
    }
  });

  it("carries the envelope with the fixture's plainly synthetic targets", async () => {
    const facts = await build("full");
    expect(facts.weekStart).toBe("2026-10-05");
    expect(facts.weekEnd).toBe("2026-10-11");
    expect(facts.weekNumber).toBe(41);
    expect(facts.builtAt).toBe(SUNDAY_EVENING.toISOString());
    expect(facts.targets).toEqual({ calorieTarget: 2500, proteinTargetG: 156, carbsTargetG: 313, fatTargetG: 69, plannedWorkoutDays: 5 });
    expect(facts.routines.map((r) => r.name)).toEqual(["Routine Alpha", "EMOM Bravo"]);
    expect(facts.trails.map((t) => t.name)).toEqual(["Ridge Loop", "Quarry Climb"]);
    expect(facts.nextWeek.dates).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(facts.groups).toEqual(["week", "training", "records", "trails", "intake", "hydration", "body", "recovery", "activity", "plan", "journal", "compare"]);
  });

  it("normalises any day of the week to its Monday", async () => {
    const facts = await build("full", SUNDAY_EVENING, undefined, "2026-10-08");
    expect(facts.weekStart).toBe("2026-10-05");
  });
});

describe("coverage — whole days are averaged, the partial day is shown 'so far'", () => {
  it("a Sunday 19:00 review: Monday–Saturday in full, Sunday through 7:00 pm", async () => {
    const facts = await build("full");
    expect(facts.coverage).toEqual({
      complete: false,
      cutoff: SUNDAY_EVENING.toISOString(),
      cutoffLocal: "Sun, Oct 11 · 7:00 pm",
      fullDays: 6,
      partialDay: "2026-10-11",
      label: "Monday to Saturday in full, Sunday through 7:00 pm",
    });
    expect(facts.facts[0].key).toBe("week.number");
    expect(value(facts, "week.fullDays")).toBe(6);
    expect(value(facts, "week.coverage")).toBe("Monday to Saturday in full, Sunday through 7:00 pm");
    expect(fact(facts, "week.coverage").source.note).toMatch(/whole days only, in both weeks/);
  });

  it("Sunday's lunch is 'so far', its dinner after 19:00 does not exist yet, and neither is averaged", async () => {
    const facts = await build("full");
    expect(value(facts, "intake.loggedDays")).toBe(6);
    expect(value(facts, "intake.avgKcal")).toBe(2233); // Mon–Sat; one 800 kcal lunch would have dragged it to 2028
    expect(value(facts, "intake.avgVsTarget")).toBe(2233 - 2500);
    expect(factByKey(facts, "intake.day.2026-10-11")).toBeUndefined();
    expect(value(facts, "intake.partialDay.kcal")).toBe(800); // the 20:00 dinner is after the cutoff
    expect(value(facts, "intake.partialDay.proteinG")).toBe(40);
    expect(fact(facts, "intake.partialDay.kcal").label).toBe("Sunday so far (through 7:00 pm) · kcal logged");
    expect(fact(facts, "intake.partialDay.kcal").source.ids).toEqual(["fx-f19"]);
    // like for like: the previous Sunday's lunch is left out of the previous week's average too
    expect(value(facts, "intake.loggedDays.prev")).toBe(4);
    expect(value(facts, "intake.avgKcal.prev")).toBe(2050);
    // steps: Sunday so far, not averaged — in either week
    expect(value(facts, "activity.daysArrived")).toBe(6);
    expect(value(facts, "activity.stepsAvg")).toBe(9775);
    expect(value(facts, "activity.partialDay.steps")).toBe(4000);
    expect(value(facts, "activity.stepsAvg.prev")).toBe(8000);
  });

  it("once the week is over, Sunday is a whole day in both weeks", async () => {
    const facts = await build("full", MONDAY_MORNING);
    expect(facts.coverage).toMatchObject({ complete: true, fullDays: 7, partialDay: null, label: "the full week, Monday to Sunday" });
    expect(value(facts, "intake.loggedDays")).toBe(7);
    expect(value(facts, "intake.day.2026-10-11")).toBe(1700); // lunch and dinner
    expect(value(facts, "intake.avgKcal")).toBe(Math.round(15100 / 7));
    expect(keys(facts, "intake.partialDay")).toEqual([]);
    expect(value(facts, "intake.loggedDays.prev")).toBe(5);
    expect(value(facts, "activity.daysArrived")).toBe(7);
    expect(value(facts, "activity.stepsAvg")).toBe(Math.round(62650 / 7));
    expect(value(facts, "activity.stepsAvg.prev")).toBe(Math.round(49000 / 6));
  });

  it("a mid-week run truncates both weeks at the same weekday and second", async () => {
    const facts = await build("full", WEDNESDAY_NOON);
    expect(facts.coverage.label).toBe("Monday to Tuesday in full, Wednesday through 12:00 pm");
    expect(facts.coverage.fullDays).toBe(2);
    // counts of events run to the same moment in both weeks
    expect(value(facts, "training.sessions")).toBe(2); // Mon strength, Wed 07:00 walk
    expect(value(facts, "training.sessions.prev")).toBe(1); // Tue Sep 29; Thu/Sat not yet
    // averages: whole days only
    expect(value(facts, "intake.loggedDays")).toBe(2);
    expect(value(facts, "intake.partialDay.kcal")).toBe(450);
    expect(value(facts, "intake.loggedDays.prev")).toBe(2);
    expect(value(facts, "recovery.hrvDays")).toBe(2);
    expect(value(facts, "activity.daysArrived")).toBe(2);
    expect(value(facts, "activity.stepsAvg")).toBe(9800);
    expect(value(facts, "activity.partialDay.steps")).toBe(6900);
    expect(value(facts, "activity.stepsAvg.prev")).toBe(8000);
    // a planned session still ahead is upcoming, not missed
    expect(value(facts, "plan.thisWeek.missed")).toBe(0);
    expect(value(facts, "plan.thisWeek.upcoming")).toBe(1);
    expect(value(facts, "body.weighIns")).toBe(1);
  });

  it("the previous week is cut at the very same second", () => {
    const at = new Date("2026-10-07T17:00:42.500Z"); // Wed 12:00:42.5
    const input = emptyInput(at);
    input.food = [
      { id: "same", loggedAt: new Date("2026-09-30T17:00:42.500Z"), calories: 100, proteinG: 1, carbsG: 1, fatG: 1 },
      { id: "late", loggedAt: new Date("2026-09-30T17:00:42.501Z"), calories: 100, proteinG: 1, carbsG: 1, fatG: 1 },
      { id: "tue", loggedAt: new Date("2026-09-29T17:00:00Z"), calories: 500, proteinG: 1, carbsG: 1, fatG: 1 },
    ];
    input.workouts = [workout("w-same", "2026-09-30T17:00:42.500Z"), workout("w-late", "2026-09-30T17:00:42.501Z")];
    const facts = buildWeekFacts(input);
    expect(fact(facts, "training.sessions.prev").source.ids).toEqual(["w-same"]);
    expect(fact(facts, "intake.loggedDays.prev").source.ids).toEqual(["tue"]); // Wed Sep 30 is the partial twin
  });

  it("never reads before the week starts", () => {
    const facts = buildWeekFacts(emptyInput(new Date("2026-10-01T12:00:00Z")));
    expect(facts.coverage).toMatchObject({ complete: false, fullDays: 0, partialDay: "2026-10-05", label: "Monday through 12:00 am" });
  });
});

describe("training", () => {
  it("counts sessions and days, tonnage (a pair counts both bells), minutes, burn and rope time", async () => {
    const facts = await build("full");
    expect(value(facts, "training.sessions")).toBe(6);
    expect(value(facts, "training.days")).toBe(6);
    expect(fact(facts, "training.days").source.dates).toEqual(["2026-10-05", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(value(facts, "training.volumeKg")).toBe(2256 + 1728);
    expect(fact(facts, "training.volumeKg").source.ids).toEqual(["fx-w1", "fx-w3"]);
    expect(value(facts, "training.activeMinutes")).toBe(45 + 52 + 38 + 40 + 95 + 20);
    expect(value(facts, "training.kcal")).toBe(380 + 210 + 330 + 160 + 640 + 190);
    expect(value(facts, "training.jumpMinutes")).toBe(10);
    expect(value(facts, "training.type.walk")).toBe(2);
  });

  it("compares with the previous week, citing only the rows that lifted", async () => {
    const facts = await build("full");
    expect(value(facts, "training.sessions.prev")).toBe(3);
    expect(value(facts, "training.sessions.delta")).toBe(3);
    expect(value(facts, "training.volumeKg.prev")).toBe(2280);
    expect(fact(facts, "training.volumeKg.prev").source.ids).toEqual(["fx-pw1", "fx-pw3"]); // not the walk
    expect(value(facts, "training.volumeKg.deltaPct")).toBe(75);
  });

  it("measures the weekly target in DAYS: two sessions on one day are one day", () => {
    const input = emptyInput();
    input.workouts = [
      workout("walk", "2026-10-06T12:00:00Z", { workoutType: "walk" }),
      workout("lift", "2026-10-06T23:00:00Z"),
    ];
    const facts = buildWeekFacts(input);
    expect(value(facts, "training.sessions")).toBe(2);
    expect(value(facts, "training.days")).toBe(1);
    expect(value(facts, "training.vsTargetDays")).toBe(1 - 5);
    expect(fact(facts, "training.vsTargetDays").label).toBe("Days trained vs weekly target");
  });

  it("burn matches the Sunday Report to the calorie: each session rounded, then summed", () => {
    const input = emptyInput();
    input.workouts = [
      workout("a", "2026-10-06T12:00:00Z", { caloriesBurned: 100.4 }),
      workout("b", "2026-10-07T12:00:00Z", { caloriesBurned: 100.4 }),
      workout("c", "2026-10-08T12:00:00Z", { caloriesBurned: null }),
    ];
    const facts = buildWeekFacts(input);
    expect(value(facts, "training.kcal")).toBe(200); // not 201
    expect(fact(facts, "training.kcal").source.note).toMatch(/1 session recorded no burn/);
  });

  it("lists sessions with distance and climb where they exist, and reads the week's plan", async () => {
    const facts = await build("full");
    expect(fact(facts, "training.session.1.minutes").label).toBe("Mon, Oct 5 · strength · Routine Alpha");
    expect(value(facts, "training.session.2.km")).toBe(4.8);
    expect(factByKey(facts, "training.session.1.km")).toBeUndefined();
    expect(value(facts, "plan.thisWeek.planned")).toBe(3);
    expect(fact(facts, "plan.thisWeek.planned").unit).toBe("sessions");
    expect(value(facts, "plan.thisWeek.days")).toBe(3);
    expect(value(facts, "plan.thisWeek.done")).toBe(2);
    expect(value(facts, "plan.thisWeek.missed")).toBe(1);
    expect(value(facts, "plan.targetDaysPerWeek")).toBe(5);
    expect(value(facts, "training.vsTargetDays")).toBe(1);
  });
});

describe("records and trails", () => {
  it("lists each record with what it beat, or says it is the first", async () => {
    const facts = await build("full");
    expect(value(facts, "records.count")).toBe(2);
    expect(fact(facts, "records.1").label).toBe("Kettlebell Swing · weight record (Mon, Oct 5)");
    expect(value(facts, "records.1.previous")).toBe(20);
    expect(fact(facts, "records.2").source.note).toBe("first record on this movement");
  });

  it("compares a trail run with the trail's previous run, and knows a first run", async () => {
    const facts = await build("full");
    expect(value(facts, "trails.1.minutes")).toBe(52);
    expect(value(facts, "trails.1.prev.minutes")).toBe(60);
    expect(fact(facts, "trails.1.prev.minutes").source.ids).toEqual(["fx-pw2"]);
    expect(value(facts, "trails.1.minutes.delta")).toBe(-8);
    expect(value(facts, "trails.2.prev.none")).toBe("first recorded run of this trail");
  });

  it("a second run of a trail in the same week is compared with that week's first", () => {
    const input = emptyInput();
    input.trails = [{ id: "t1", name: "Synthetic Ridge", distanceMeters: null, elevationGainM: null }];
    input.workouts = [
      workout("run1", "2026-10-05T12:00:00Z", { workoutType: "walk", durationMinutes: 60, trailId: "t1" }),
      workout("run2", "2026-10-08T12:00:00Z", { workoutType: "walk", durationMinutes: 50, trailId: "t1" }),
    ];
    input.previousTrailRuns = [workout("old", "2026-09-01T12:00:00Z", { workoutType: "walk", durationMinutes: 70, trailId: "t1" })];
    const facts = buildWeekFacts(input);
    expect(value(facts, "trails.1.prev.minutes")).toBe(70);
    expect(value(facts, "trails.2.prev.minutes")).toBe(60);
    expect(fact(facts, "trails.2.prev.minutes").source.ids).toEqual(["run1"]);
    expect(value(facts, "trails.2.minutes.delta")).toBe(-10);
  });
});

describe("intake and hydration", () => {
  it("averages over whole logged days, like the Sunday Report", async () => {
    const facts = await build("full");
    expect(value(facts, "intake.target")).toBe(2500);
    expect(value(facts, "intake.weekVsTarget")).toBe((2233 - 2500) * 6);
    expect(value(facts, "intake.proteinTargetG")).toBe(156);
    expect(value(facts, "intake.avgProteinG")).toBe(149);
    expect(value(facts, "intake.proteinPctOfTarget")).toBe(96); // 149.17 ÷ 156, from the unrounded average
    expect(value(facts, "intake.proteinDaysHit")).toBe(3);
    expect(fact(facts, "intake.proteinDaysHit").source.dates).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
    expect(value(facts, "intake.avgKcal.delta")).toBe(183);
    expect(value(facts, "intake.avgProteinG.delta")).toBe(-1);
  });

  it("caps protein adherence at 100, as the Sunday Report does", () => {
    const input = emptyInput(MONDAY_MORNING);
    input.food = [{ id: "big", loggedAt: new Date("2026-10-06T17:00:00Z"), calories: 2500, proteinG: 300, carbsG: 200, fatG: 60 }];
    expect(value(buildWeekFacts(input), "intake.proteinPctOfTarget")).toBe(100);
  });

  it("reports hydration only from logged water, whole days only", async () => {
    const facts = await build("full");
    expect(value(facts, "hydration.daysLogged")).toBe(2);
    expect(value(facts, "hydration.totalMl")).toBe(1500);
    expect(value(facts, "hydration.avgMlPerLoggedDay")).toBe(750);
  });
});

describe("body", () => {
  it("names first and last weigh-in with their source, the change, and the composition", async () => {
    const facts = await build("full");
    expect(value(facts, "body.weighIns")).toBe(2);
    expect(value(facts, "body.weightFirst")).toBe(90.4);
    expect(fact(facts, "body.weightFirst").source).toEqual({
      table: "body_measurements", field: "weightKg", ids: ["fx-b4"], dates: ["2026-10-06"], fieldSource: "apple_health",
    });
    expect(value(facts, "body.weightDelta")).toBe(-0.3);
    expect(fact(facts, "body.fatPct").source.fieldSource).toBe("renpho_report");
    expect(value(facts, "body.trendKgPerWeek") as number).toBeCloseTo(-0.29, 2);
    expect(value(facts, "body.weightWeekOverWeek")).toBe(-0.5);
  });

  it("reads a day by its FIRST weigh-in", () => {
    const input = emptyInput();
    const w = (id: string, iso: string, kg: number) => ({
      id, measuredAt: new Date(iso), weightKg: kg, bodyFatPct: null, skeletalMuscleKg: null, skeletalMusclePct: null, source: "manual", fieldSources: null,
    });
    input.body = [w("morning", "2026-10-06T12:00:00Z", 90.0), w("night", "2026-10-07T02:00:00Z", 91.0), w("next", "2026-10-08T12:00:00Z", 89.8)];
    const facts = buildWeekFacts(input);
    expect(value(facts, "body.weighIns")).toBe(2); // Tue (two readings) and Thu
    expect(value(facts, "body.weightFirst")).toBe(90.0);
    expect(value(facts, "body.weightLast")).toBe(89.8);
    expect(value(facts, "body.weightDelta")).toBe(-0.2);
  });

  it("days since the last weigh-in: however old, counted to the cutoff", () => {
    const old = {
      id: "old", measuredAt: new Date("2026-08-15T12:00:00Z"), weightKg: 92, bodyFatPct: null,
      skeletalMuscleKg: null, skeletalMusclePct: null, source: "manual", fieldSources: null,
    };
    const sunday = emptyInput();
    sunday.lastWeighInBefore = old;
    expect(value(buildWeekFacts(sunday), "body.lastWeighInDaysAgo")).toBe(57); // Aug 15 → Sun Oct 11
    const wednesday = emptyInput(WEDNESDAY_NOON);
    wednesday.lastWeighInBefore = old;
    const facts = buildWeekFacts(wednesday);
    expect(value(facts, "body.lastWeighInDaysAgo")).toBe(53); // → Wed Oct 7, not the Sunday ahead
    expect(fact(facts, "body.lastWeighInDaysAgo").label).toBe("Days since the last weigh-in, at Wed, Oct 7");
  });
});

describe("recovery", () => {
  it("averages each metric over the whole days that have it", async () => {
    const facts = await build("full");
    expect(value(facts, "recovery.sleepAvg")).toBe(6.9);
    expect(value(facts, "recovery.sleepNights")).toBe(3);
    expect(value(facts, "recovery.hrvAvg")).toBe(48);
    expect(value(facts, "recovery.hrvDays")).toBe(5);
    expect(value(facts, "recovery.rhrAvg")).toBe(57);
    expect(value(facts, "recovery.sleepAvg.delta")).toBe(0.4);
  });

  it("merges a day's duplicate rows per FIELD, in a fixed order whatever order they arrive in", () => {
    const snap = (id: string, tz: string, sleep: number | null, hrv: number | null, rhr: number | null) => ({
      id, localDate: "2026-10-06", timeZone: tz, source: "apple_health", sleepMinutes: sleep, hrvMs: hrv, restingHeartRateBpm: rhr,
    });
    const rows = [snap("bog", "America/Bogota", 420, 40, null), snap("chi", "America/Chicago", null, 60, 55)];
    for (const order of [rows, [...rows].reverse()]) {
      const input = emptyInput();
      input.snapshots = order;
      const facts = buildWeekFacts(input);
      expect(value(facts, "recovery.sleepAvg")).toBe(7); // the sleep-only half is not lost
      expect(value(facts, "recovery.hrvAvg")).toBe(40); // Bogotá sorts first: deterministic
      expect(fact(facts, "recovery.hrvAvg").source.ids).toEqual(["bog"]);
      expect(value(facts, "recovery.rhrAvg")).toBe(55);
      expect(fact(facts, "recovery.rhrAvg").source.ids).toEqual(["chi"]);
    }
  });
});

describe("plan and journal", () => {
  it("lists next week's plan without repeating a name, and the progression math", async () => {
    const facts = await build("full");
    expect(value(facts, "plan.nextWeek.planned")).toBe(2);
    expect(value(facts, "plan.nextWeek.days")).toBe(2);
    expect(value(facts, "plan.nextWeek.1")).toBe("Strength A · Routine Alpha · 24 kg");
    expect(value(facts, "plan.nextWeek.2")).toBe("Ridge Loop");
    expect(value(facts, "plan.progression.1")).toBe("raise earned — 3 clean runs in a row");
  });

  it("counts journal pages; quotes excerpts only when the switch is on", async () => {
    const facts = await build("full");
    expect(value(facts, "journal.pages")).toBe(2);
    expect(keys(facts, "journal.excerpt.")).toEqual([]);
    const quoted = await build("full", SUNDAY_EVENING, { journalExcerpts: true });
    expect(value(quoted, "journal.excerpt.1")).toMatch(/^Felt strong on the swings\./);
  });
});

describe("an empty week: counts of zero, and nothing else made up", () => {
  it("keeps the zero counts and the none-facts, and mints no sum, average or delta", async () => {
    const facts = await build("empty");
    expect(value(facts, "training.sessions")).toBe(0);
    expect(value(facts, "training.days")).toBe(0);
    expect(value(facts, "training.vsTargetDays")).toBe(-5);
    for (const k of ["training.volumeKg", "training.activeMinutes", "training.kcal", "training.sessions.prev", "training.sessions.delta", "training.volumeKg.prev"]) {
      expect(factByKey(facts, k), k).toBeUndefined();
    }
    expect(value(facts, "plan.thisWeek.none")).toBe("no plan was set for this week");
    expect(value(facts, "records.count")).toBe(0);
    expect(value(facts, "intake.loggedDays")).toBe(0);
    expect(value(facts, "intake.none")).toBe("no food logged this week");
    expect(factByKey(facts, "intake.loggedDays.prev")).toBeUndefined();
    expect(keys(facts, "hydration.")).toEqual([]);
    expect(value(facts, "body.none")).toBe("no weigh-in this week");
    expect(value(facts, "recovery.rhr.none")).toBe("no resting heart rate data this week");
    expect(value(facts, "activity.none")).toBe("no step data this week");
    expect(value(facts, "plan.nextWeek.none")).toBe("nothing planned yet for next week");
    expect(value(facts, "journal.none")).toBe("no journal pages this week");
    expect(facts.groups).toEqual(["week", "training", "records", "intake", "body", "recovery", "activity", "plan", "journal"]);
  });

  it("one session with no recorded burn gets no 'Training burn 0 kcal'", () => {
    const input = emptyInput();
    input.workouts = [workout("w", "2026-10-06T12:00:00Z", { caloriesBurned: null })];
    const facts = buildWeekFacts(input);
    expect(value(facts, "training.sessions")).toBe(1);
    expect(factByKey(facts, "training.kcal")).toBeUndefined();
    expect(factByKey(facts, "training.volumeKg")).toBeUndefined();
  });
});

describe("a partial week never invents a comparison", () => {
  it("omits every delta whose other side is empty", async () => {
    const facts = await build("partial");
    expect(value(facts, "training.sessions")).toBe(2);
    expect(factByKey(facts, "training.sessions.prev")).toBeUndefined();
    expect(factByKey(facts, "training.sessions.delta")).toBeUndefined();
    expect(factByKey(facts, "training.volumeKg.deltaPct")).toBeUndefined();
    expect(value(facts, "intake.loggedDays")).toBe(2);
    expect(value(facts, "intake.avgKcal")).toBe(2225);
    expect(factByKey(facts, "intake.avgKcal.delta")).toBeUndefined();
    expect(value(facts, "body.weighIns")).toBe(1);
    expect(factByKey(facts, "body.weightDelta")).toBeUndefined();
    expect(value(facts, "recovery.sleepNights")).toBe(1);
    expect(value(facts, "recovery.hrvDays")).toBe(3);
    expect(value(facts, "activity.stepsAvg")).toBe(9800);
    expect(factByKey(facts, "activity.stepsAvg.prev")).toBeUndefined();
    expect(facts.groups).not.toContain("trails");
    expect(facts.groups).not.toContain("hydration");
    expect(facts.groups).not.toContain("compare");
  });
});

describe("local days, not UTC days", () => {
  it("files a row by the user's local day at both ends of a finished week", () => {
    const input = emptyInput(MONDAY_MORNING);
    input.food = [
      { id: "late-sun", loggedAt: new Date("2026-10-12T04:30:00Z"), calories: 400, proteinG: 20, carbsG: 40, fatG: 10 }, // Sun 23:30
      { id: "early-mon", loggedAt: new Date("2026-10-12T05:00:00Z"), calories: 999, proteinG: 1, carbsG: 1, fatG: 1 }, // Mon 00:00 — next week
      { id: "prev-sun", loggedAt: new Date("2026-10-05T04:00:00Z"), calories: 700, proteinG: 30, carbsG: 50, fatG: 20 }, // Sun Oct 4 23:00
    ];
    const facts = buildWeekFacts(input);
    expect(fact(facts, "intake.loggedDays").source.ids).toEqual(["late-sun"]);
    expect(value(facts, "intake.day.2026-10-11")).toBe(400);
    expect(value(facts, "intake.avgKcal.prev")).toBe(700);
  });
});

describe("the model's copy", () => {
  it("keeps every fact and value, and carries no row id of any table — not in notes, not in the envelope", async () => {
    for (const now of [SUNDAY_EVENING, MONDAY_MORNING]) {
      const facts = await build("full", now, { journalExcerpts: true });
      const model = factsForModel(facts);
      expect(model.facts).toHaveLength(facts.facts.length);
      expect(model.facts.map((f) => f.value)).toEqual(facts.facts.map((f) => f.value));
      const json = JSON.stringify(model);
      const rows = fixtureRows("full");
      const rowIds = [
        ...Object.values(rows).flatMap((list) => (list as Array<{ id?: string; sequenceId?: string }>).map((r) => r.id ?? r.sequenceId)),
      ].filter((id): id is string => typeof id === "string");
      expect(rowIds.length).toBeGreaterThan(60); // the collection itself is not empty
      for (const id of rowIds) expect(json, id).not.toContain(`"${id}"`);
      for (const id of rowIds) expect(json, id).not.toMatch(new RegExp(`\\b${id}\\b`));
      expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(model.routines).toEqual([{ name: "Routine Alpha", kind: "straight" }, { name: "EMOM Bravo", kind: "emom" }]);
      expect(model.trails).toEqual([{ name: "Ridge Loop" }, { name: "Quarry Climb" }]);
    }
    // the stored facts keep their provenance for the chips
    const stored = await build("full");
    expect(fact(stored, "training.kcal").source.ids).toHaveLength(6);
  });
});

describe("helpers", () => {
  it("isoWeekNumber follows ISO-8601", () => {
    expect(isoWeekNumber("2026-10-05")).toBe(41);
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-12-31")).toBe(53);
  });

  it("factsInGroup filters by group", async () => {
    const compare = factsInGroup(await build("full"), "compare");
    expect(compare.length).toBeGreaterThan(5);
    expect(compare.every((f) => f.group === "compare")).toBe(true);
  });
});
