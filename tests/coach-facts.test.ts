import { describe, expect, it, vi } from "vitest";

// The Coach's facts layer (docs/coach-plan.md §2.1): rows in, facts out.
// Driven entirely by the synthetic fixture week — nothing here is his data.
// lib/prs.ts and lib/health-coach.ts import the Prisma client for their
// database halves; the pure helpers the builder uses never touch it.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildWeekFacts, factByKey, factsForModel, factsInGroup } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import { DEFAULT_FACTS_OPTIONS, type Fact, type FactsOptions, type WeekFacts, type WeekInput } from "@/lib/coach/types";
import { isoWeekNumber } from "@/lib/timezone";
import {
  FIXTURE_SETTINGS,
  FIXTURE_TIME_ZONE,
  FIXTURE_WEEK_START,
  type FixtureKind,
  fixtureSource,
} from "@/tests/fixtures/coach-week";

const NOW = new Date("2026-10-12T00:00:00Z"); // Sunday 19:00 in Bogotá

async function build(
  kind: FixtureKind,
  weekStart = FIXTURE_WEEK_START,
  now = NOW,
  options?: Partial<FactsOptions>
): Promise<WeekFacts> {
  const input = await loadWeekInput(fixtureSource(kind), {
    weekStart,
    timeZone: FIXTURE_TIME_ZONE,
    now,
    options,
  });
  return buildWeekFacts(input);
}

const value = (facts: WeekFacts, key: string) => factByKey(facts, key)?.value;
const fact = (facts: WeekFacts, key: string): Fact => {
  const f = factByKey(facts, key);
  if (!f) throw new Error(`missing fact ${key}`);
  return f;
};
const keys = (facts: WeekFacts, prefix: string) =>
  facts.facts.filter((f) => f.key.startsWith(prefix)).map((f) => f.key);

function emptyInput(weekStart: string, timeZone: string): WeekInput {
  return {
    weekStart,
    timeZone,
    now: NOW,
    cutoff: NOW,
    options: DEFAULT_FACTS_OPTIONS,
    settings: FIXTURE_SETTINGS,
    food: [],
    workouts: [],
    records: [],
    body: [],
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

describe("the full fixture week — shape of the evidence", () => {
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

  it("every derived fact cites facts that exist", async () => {
    const facts = await build("full");
    const ids = new Set(facts.facts.map((f) => f.id));
    const derived = facts.facts.filter((f) => f.derivedFrom);
    expect(derived.length).toBeGreaterThan(10);
    for (const f of derived) {
      expect(f.derivedFrom!.length).toBeGreaterThan(0);
      for (const id of f.derivedFrom!) expect(ids.has(id)).toBe(true);
    }
  });

  it("caps ids at 50 and dates at 14 on aggregates", async () => {
    const facts = await build("full");
    for (const f of facts.facts) {
      expect((f.source.ids ?? []).length).toBeLessThanOrEqual(50);
      expect((f.source.dates ?? []).length).toBeLessThanOrEqual(14);
    }
  });

  it("carries the envelope: week, number, targets, routines, trails, next week", async () => {
    const facts = await build("full");
    expect(facts.weekStart).toBe("2026-10-05");
    expect(facts.weekEnd).toBe("2026-10-11");
    expect(facts.weekNumber).toBe(41);
    expect(facts.timeZone).toBe(FIXTURE_TIME_ZONE);
    expect(facts.builtAt).toBe(NOW.toISOString());
    expect(facts.targets).toMatchObject({
      calorieTarget: 2200,
      proteinTargetG: 165,
      carbsTargetG: 248,
      fatTargetG: 61,
      plannedWorkoutDays: 4,
    });
    expect(facts.routines.map((r) => r.name)).toEqual(["Routine Alpha", "EMOM Bravo"]);
    expect(facts.trails.map((t) => t.name)).toEqual(["Ridge Loop", "Quarry Climb"]);
    expect(facts.nextWeek).toEqual({
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      dates: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
    });
    expect(facts.groups).toEqual([
      "week", "training", "records", "trails", "intake", "hydration", "body", "recovery", "activity", "plan", "journal", "compare",
    ]);
  });

  it("normalises any day of the week to its Monday", async () => {
    const facts = await build("full", "2026-10-08");
    expect(facts.weekStart).toBe("2026-10-05");
    expect(value(facts, "training.sessions")).toBe(6);
  });
});

describe("training", () => {
  it("counts sessions, tonnage (a pair counts both bells), minutes, burn and rope time", async () => {
    const facts = await build("full");
    expect(value(facts, "training.sessions")).toBe(6);
    expect(fact(facts, "training.sessions").source).toMatchObject({ table: "workout_logs", count: 6 });
    expect(fact(facts, "training.sessions").source.ids).toContain("fx-w1");
    expect(value(facts, "training.volumeKg")).toBe(2256 + 1728);
    expect(fact(facts, "training.volumeKg").source.ids).toEqual(["fx-w1", "fx-w3"]);
    expect(value(facts, "training.activeMinutes")).toBe(45 + 52 + 38 + 40 + 95 + 20);
    expect(value(facts, "training.kcal")).toBe(380 + 210 + 330 + 160 + 640 + 190);
    expect(fact(facts, "training.kcal").source.note).toMatch(/training burn only/);
    expect(value(facts, "training.jumpMinutes")).toBe(10);
    expect(value(facts, "training.type.walk")).toBe(2);
    expect(value(facts, "training.type.strength")).toBe(1);
  });

  it("compares with the previous week as derived facts", async () => {
    const facts = await build("full");
    expect(value(facts, "training.sessions.prev")).toBe(3);
    expect(value(facts, "training.sessions.delta")).toBe(3);
    expect(value(facts, "training.volumeKg.prev")).toBe(2280);
    expect(value(facts, "training.volumeKg.deltaPct")).toBe(75);
    const delta = fact(facts, "training.volumeKg.deltaPct");
    expect(delta.group).toBe("compare");
    expect(delta.derivedFrom).toEqual([fact(facts, "training.volumeKg").id, fact(facts, "training.volumeKg.prev").id]);
  });

  it("lists each session in order with distance and climb where they exist", async () => {
    const facts = await build("full");
    expect(fact(facts, "training.session.1.minutes").label).toBe("Mon, Oct 5 · strength · Routine Alpha");
    expect(value(facts, "training.session.1.minutes")).toBe(45);
    expect(fact(facts, "training.session.2.minutes").label).toBe("Wed, Oct 7 · walk · Ridge Loop");
    expect(value(facts, "training.session.2.km")).toBe(4.8);
    expect(value(facts, "training.session.2.gainM")).toBe(180);
    expect(fact(facts, "training.session.2.km").source).toEqual({
      table: "workout_logs", field: "distanceMeters", ids: ["fx-w2"], dates: ["2026-10-07"],
    });
    expect(factByKey(facts, "training.session.1.km")).toBeUndefined(); // strength has no distance
    expect(fact(facts, "training.session.6.minutes").label).toBe("Sun, Oct 11 · jump rope");
  });

  it("reads the week's plan and the weekly target", async () => {
    const facts = await build("full");
    expect(value(facts, "plan.thisWeek.planned")).toBe(3);
    expect(value(facts, "plan.thisWeek.done")).toBe(2);
    expect(value(facts, "plan.thisWeek.missed")).toBe(1);
    expect(fact(facts, "plan.thisWeek.missed").source.ids).toEqual(["fx-p3"]);
    expect(factByKey(facts, "plan.thisWeek.skipped")).toBeUndefined();
    expect(value(facts, "plan.targetDaysPerWeek")).toBe(4);
    expect(value(facts, "training.vsTargetDays")).toBe(2);
  });
});

describe("records and trails", () => {
  it("lists each record with what it beat, or says it is the first", async () => {
    const facts = await build("full");
    expect(value(facts, "records.count")).toBe(2);
    const swing = fact(facts, "records.1");
    expect(swing.label).toBe("Kettlebell Swing · weight record (Mon, Oct 5)");
    expect(swing.value).toBe(24);
    expect(swing.unit).toBe("kg");
    expect(swing.source).toMatchObject({ table: "personal_records", ids: ["fx-r1"], dates: ["2026-10-05"] });
    expect(value(facts, "records.1.previous")).toBe(20);
    expect(value(facts, "records.2")).toBe(480);
    expect(factByKey(facts, "records.2.previous")).toBeUndefined();
    expect(fact(facts, "records.2").source.note).toMatch(/first record/);
  });

  it("compares a trail run with the trail's previous run, and knows a first run", async () => {
    const facts = await build("full");
    expect(fact(facts, "trails.1.minutes").label).toBe("Ridge Loop · Wed, Oct 7");
    expect(value(facts, "trails.1.minutes")).toBe(52);
    expect(value(facts, "trails.1.km")).toBe(4.8);
    expect(value(facts, "trails.1.prev.minutes")).toBe(60);
    expect(fact(facts, "trails.1.prev.minutes").source.ids).toEqual(["fx-pw2"]);
    expect(value(facts, "trails.1.minutes.delta")).toBe(-8);
    expect(value(facts, "trails.1.prev.km")).toBe(4.6);
    expect(value(facts, "trails.1.prev.gainM")).toBe(170);
    expect(fact(facts, "trails.2.minutes").label).toBe("Quarry Climb · Sat, Oct 10");
    expect(value(facts, "trails.2.prev.none")).toBe("first recorded run of this trail");
    expect(factByKey(facts, "trails.2.prev.minutes")).toBeUndefined();
  });
});

describe("intake and hydration", () => {
  it("averages over logged days only and states the day count", async () => {
    const facts = await build("full");
    expect(value(facts, "intake.loggedDays")).toBe(6);
    expect(fact(facts, "intake.loggedDays").source.count).toBe(18);
    expect(value(facts, "intake.target")).toBe(2200);
    expect(value(facts, "intake.avgKcal")).toBe(2233);
    expect(fact(facts, "intake.avgKcal").source.note).toMatch(/logged days only/);
    expect(value(facts, "intake.avgVsTarget")).toBe(33);
    expect(value(facts, "intake.weekVsTarget")).toBe(33 * 6);
    expect(value(facts, "intake.proteinTargetG")).toBe(165);
    expect(value(facts, "intake.avgProteinG")).toBe(149);
    expect(value(facts, "intake.proteinPctOfTarget")).toBe(90);
    expect(value(facts, "intake.proteinDaysHit")).toBe(3);
    expect(fact(facts, "intake.proteinDaysHit").source.dates).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
    expect(value(facts, "intake.day.2026-10-05")).toBe(2150);
    expect(value(facts, "intake.day.2026-10-10")).toBe(2600);
    expect(factByKey(facts, "intake.day.2026-10-11")).toBeUndefined();
    expect(value(facts, "intake.avgCarbsG")).toBe(Math.round((220 + 275 + 155 + 255 + 190 + 310) / 6));
  });

  it("compares with the previous week", async () => {
    const facts = await build("full");
    expect(value(facts, "intake.loggedDays.prev")).toBe(4);
    expect(value(facts, "intake.avgKcal.prev")).toBe(2050);
    expect(value(facts, "intake.avgKcal.delta")).toBe(183);
    expect(value(facts, "intake.avgProteinG.prev")).toBe(150);
    expect(value(facts, "intake.avgProteinG.delta")).toBe(-1);
  });

  it("reports hydration only from logged water", async () => {
    const facts = await build("full");
    expect(value(facts, "hydration.daysLogged")).toBe(2);
    expect(value(facts, "hydration.totalMl")).toBe(1500);
    expect(value(facts, "hydration.avgMlPerLoggedDay")).toBe(750);
    expect(fact(facts, "hydration.avgMlPerLoggedDay").derivedFrom).toHaveLength(2);
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
    expect(value(facts, "body.weightLast")).toBe(90.1);
    expect(value(facts, "body.weightDelta")).toBe(-0.3);
    expect(value(facts, "body.fatPct")).toBe(22.4);
    expect(fact(facts, "body.fatPct").source.fieldSource).toBe("renpho_report");
    expect(value(facts, "body.skeletalMuscleKg")).toBe(38.1);
    expect(factByKey(facts, "body.none")).toBeUndefined();
  });

  it("fits a four-week trend and compares with the previous week's last weigh-in", async () => {
    const facts = await build("full");
    expect(value(facts, "body.trendKgPerWeek") as number).toBeCloseTo(-0.29, 2);
    expect(fact(facts, "body.trendKgPerWeek").source.count).toBe(5);
    expect(value(facts, "body.weightLast.prev")).toBe(90.6);
    expect(value(facts, "body.weightWeekOverWeek")).toBe(-0.5);
  });
});

describe("recovery", () => {
  it("averages each metric over the days that have it, picking the fuller row on a duplicate day", async () => {
    const facts = await build("full");
    expect(value(facts, "recovery.sleepAvg")).toBe(6.9);
    expect(value(facts, "recovery.sleepNights")).toBe(3);
    expect(fact(facts, "recovery.sleepAvg").source.ids).toEqual(["fx-sn0b", "fx-sn2", "fx-sn4"]);
    expect(value(facts, "recovery.hrvAvg")).toBe(48);
    expect(value(facts, "recovery.hrvDays")).toBe(5);
    expect(value(facts, "recovery.rhrAvg")).toBe(57);
    expect(value(facts, "recovery.rhrDays")).toBe(4);
    expect(value(facts, "recovery.sleepAvg.prev")).toBe(6.5);
    expect(value(facts, "recovery.sleepAvg.delta")).toBe(0.4);
    expect(value(facts, "recovery.hrvAvg.delta")).toBe(3);
    expect(value(facts, "recovery.rhrAvg.delta")).toBe(-1);
  });
});

describe("activity", () => {
  it("averages only the days that arrived and compares with the previous week", async () => {
    const facts = await build("full");
    expect(value(facts, "activity.daysArrived")).toBe(6);
    expect(value(facts, "activity.stepsAvg")).toBe(9775);
    expect(value(facts, "activity.stepsTotal")).toBe(58650);
    expect(value(facts, "activity.tenKDays")).toBe(3);
    expect(fact(facts, "activity.tenKDays").source.dates).toEqual(["2026-10-06", "2026-10-08", "2026-10-10"]);
    expect(value(facts, "activity.bestDaySteps")).toBe(12800);
    expect(fact(facts, "activity.bestDaySteps").label).toBe("Most steps · Sat, Oct 10");
    expect(value(facts, "activity.activeKcalAvg")).toBe(545);
    expect(value(facts, "activity.kmAvg")).toBe(7.1);
    expect(value(facts, "activity.stepsAvg.prev")).toBe(8000);
    expect(value(facts, "activity.stepsAvg.deltaPct")).toBe(22);
  });
});

describe("plan and journal", () => {
  it("lists what is already planned for next week and the progression math", async () => {
    const facts = await build("full");
    expect(value(facts, "plan.nextWeek.planned")).toBe(2);
    expect(value(facts, "plan.nextWeek.1")).toBe("Strength A · Routine Alpha · 24 kg");
    expect(fact(facts, "plan.nextWeek.1").source).toEqual({ table: "planned_workouts", ids: ["fx-p4"], dates: ["2026-10-12"] });
    expect(value(facts, "plan.nextWeek.2")).toBe("Ridge Loop · Ridge Loop");
    expect(value(facts, "plan.progression.1")).toBe("raise earned — 3 clean runs in a row");
    expect(fact(facts, "plan.progression.1").source.note).toMatch(/never a command/);
  });

  it("counts journal pages; quotes excerpts only when the switch is on", async () => {
    const facts = await build("full");
    expect(value(facts, "journal.pages")).toBe(2);
    expect(keys(facts, "journal.excerpt.")).toEqual([]); // OFF by default — his words stay his
    const quoted = await build("full", FIXTURE_WEEK_START, NOW, { journalExcerpts: true });
    expect(value(quoted, "journal.excerpt.1")).toMatch(/^Felt strong on the swings\./);
    expect(fact(quoted, "journal.excerpt.1").source).toEqual({ table: "journal_entries", field: "text", ids: ["fx-j1"], dates: ["2026-10-06"] });
    expect(keys(quoted, "journal.excerpt.")).toHaveLength(2);
  });
});

describe("an empty week says so, fact by fact", () => {
  it("has no data facts, honest none-facts, and no optional groups", async () => {
    const facts = await build("empty");
    expect(value(facts, "training.sessions")).toBe(0);
    expect(value(facts, "training.volumeKg")).toBe(0);
    expect(factByKey(facts, "training.jumpMinutes")).toBeUndefined();
    expect(keys(facts, "training.session.")).toEqual([]);
    expect(value(facts, "plan.thisWeek.none")).toBe("no plan was set for this week");
    expect(factByKey(facts, "plan.thisWeek.planned")).toBeUndefined();
    expect(value(facts, "records.count")).toBe(0);
    expect(fact(facts, "records.count").source.note).toBe("no new records this week");
    expect(value(facts, "intake.loggedDays")).toBe(0);
    expect(value(facts, "intake.none")).toBe("no food logged this week");
    expect(factByKey(facts, "intake.avgKcal")).toBeUndefined();
    expect(value(facts, "intake.target")).toBe(2200); // targets are facts even with nothing logged
    expect(keys(facts, "hydration.")).toEqual([]);
    expect(keys(facts, "trails.")).toEqual([]);
    expect(value(facts, "body.none")).toBe("no weigh-in this week");
    expect(factByKey(facts, "body.lastWeighInDaysAgo")).toBeUndefined();
    expect(value(facts, "recovery.sleep.none")).toBe("no sleep data this week");
    expect(value(facts, "recovery.hrv.none")).toBe("no hrv data this week");
    expect(value(facts, "recovery.rhr.none")).toBe("no resting heart rate data this week");
    expect(value(facts, "activity.none")).toBe("no step data this week");
    expect(value(facts, "plan.nextWeek.none")).toBe("nothing planned yet for next week");
    expect(value(facts, "journal.none")).toBe("no journal pages this week");
    expect(facts.groups).toEqual(["week", "training", "records", "intake", "body", "recovery", "activity", "plan", "journal", "compare"]);
    expect(facts.routines).toEqual([]);
    expect(factByKey(facts, "intake.avgKcal.prev")).toBeUndefined();
    expect(value(facts, "intake.loggedDays.prev")).toBe(0);
  });
});

describe("a partial week keeps every count honest", () => {
  it("states day counts and never invents a comparison it cannot make", async () => {
    const facts = await build("partial");
    expect(value(facts, "training.sessions")).toBe(2);
    expect(value(facts, "training.sessions.prev")).toBe(0);
    expect(factByKey(facts, "training.volumeKg.deltaPct")).toBeUndefined(); // nothing to compare with
    expect(value(facts, "intake.loggedDays")).toBe(2);
    expect(value(facts, "intake.avgKcal")).toBe(Math.round((2150 + 2300) / 2));
    expect(factByKey(facts, "intake.avgKcal.delta")).toBeUndefined();
    expect(value(facts, "body.weighIns")).toBe(1);
    expect(value(facts, "body.weightFirst")).toBe(90.4);
    expect(factByKey(facts, "body.weightLast")).toBeUndefined();
    expect(factByKey(facts, "body.weightDelta")).toBeUndefined();
    expect(factByKey(facts, "body.weightLast.prev")).toBeUndefined();
    expect(value(facts, "body.trendKgPerWeek")).toBeTypeOf("number"); // three weigh-ins over 21 days
    expect(value(facts, "recovery.sleepNights")).toBe(1);
    expect(value(facts, "recovery.sleepAvg")).toBe(6.9);
    expect(value(facts, "recovery.hrvDays")).toBe(3);
    expect(value(facts, "recovery.hrvAvg")).toBe(50);
    expect(value(facts, "recovery.rhr.none")).toBe("no resting heart rate data this week");
    expect(value(facts, "activity.daysArrived")).toBe(2);
    expect(value(facts, "activity.stepsAvg")).toBe(9800);
    expect(factByKey(facts, "activity.stepsAvg.prev")).toBeUndefined();
    expect(value(facts, "records.count")).toBe(0);
    expect(keys(facts, "trails.")).toEqual([]);
    expect(keys(facts, "hydration.")).toEqual([]);
    expect(value(facts, "plan.thisWeek.none")).toBe("no plan was set for this week");
    expect(value(facts, "journal.none")).toBe("no journal pages this week");
    expect(facts.groups).not.toContain("trails");
    expect(facts.groups).not.toContain("hydration");
  });
});

describe("local days, not UTC days", () => {
  it("files a row by the user's local day at both ends of the week", () => {
    const input = emptyInput("2026-10-05", "America/Bogota");
    input.cutoff = new Date("2026-10-12T05:00:00Z"); // the week is over — read it whole
    input.food = [
      // 23:30 on Sunday Oct 11 in Bogotá — inside the week
      { id: "late-sun", loggedAt: new Date("2026-10-12T04:30:00Z"), calories: 400, proteinG: 20, carbsG: 40, fatG: 10 },
      // 00:00 on Monday Oct 12 in Bogotá — the next week
      { id: "early-mon", loggedAt: new Date("2026-10-12T05:00:00Z"), calories: 999, proteinG: 1, carbsG: 1, fatG: 1 },
      // 23:00 on Sunday Oct 4 in Bogotá — the previous week
      { id: "prev-sun", loggedAt: new Date("2026-10-05T04:00:00Z"), calories: 700, proteinG: 30, carbsG: 50, fatG: 20 },
    ];
    const facts = buildWeekFacts(input);
    expect(value(facts, "intake.loggedDays")).toBe(1);
    expect(value(facts, "intake.day.2026-10-11")).toBe(400);
    expect(fact(facts, "intake.loggedDays").source.ids).toEqual(["late-sun"]);
    expect(value(facts, "intake.loggedDays.prev")).toBe(1);
    expect(value(facts, "intake.avgKcal.prev")).toBe(700);
  });

  it("uses the week's Sunday, not today, for days since the last weigh-in", () => {
    const input = emptyInput("2026-10-05", "America/Bogota"); // cutoff Sunday 19:00
    input.body = [
      {
        id: "old", measuredAt: new Date("2026-09-30T12:00:00Z"), weightKg: 88, bodyFatPct: null,
        skeletalMuscleKg: null, skeletalMusclePct: null, source: "manual", fieldSources: null,
      },
    ];
    const facts = buildWeekFacts(input);
    expect(value(facts, "body.none")).toBe("no weigh-in this week");
    expect(value(facts, "body.lastWeighInDaysAgo")).toBe(11);
    expect(fact(facts, "body.lastWeighInDaysAgo").source.fieldSource).toBe("manual");
    expect(factByKey(facts, "body.trendKgPerWeek")).toBeUndefined(); // one point is not a trend
  });
});

describe("coverage — the Sunday-evening cutoff", () => {
  it("names what a Sunday 19:00 review covers, and compares like for like", async () => {
    const facts = await build("full"); // NOW is Sunday 19:00 in Bogotá
    expect(facts.coverage).toEqual({
      complete: false,
      cutoff: NOW.toISOString(),
      cutoffLocal: "Sun, Oct 11 · 7:00 pm",
      daysCovered: 7,
      label: "Monday to Saturday in full, Sunday through 7:00 pm",
    });
    expect(value(facts, "week.coverage")).toBe("Monday to Saturday in full, Sunday through 7:00 pm");
    expect(fact(facts, "week.coverage").source.note).toMatch(/like for like/);
    expect(value(facts, "week.daysCovered")).toBe(7);
    expect(value(facts, "week.number")).toBe(41);
    expect(facts.facts[0].key).toBe("week.number"); // the week speaks first
  });

  it("is complete once the week is over", async () => {
    const monday = new Date("2026-10-12T12:00:00Z"); // Mon 07:00 Bogotá
    const facts = await build("full", FIXTURE_WEEK_START, monday);
    expect(facts.coverage.complete).toBe(true);
    expect(facts.coverage.label).toBe("the full week, Monday to Sunday");
    expect(value(facts, "training.sessions")).toBe(6);
    expect(value(facts, "intake.loggedDays.prev")).toBe(4);
  });

  it("a mid-week run truncates BOTH weeks at the same weekday and time", async () => {
    const wednesdayNoon = new Date("2026-10-07T17:00:00Z"); // Wed 12:00 Bogotá
    const facts = await build("full", FIXTURE_WEEK_START, wednesdayNoon);
    expect(facts.coverage.label).toBe("Monday to Tuesday in full, Wednesday through 12:00 pm");
    expect(facts.coverage.daysCovered).toBe(3);
    // this week: Mon strength 18:00 + Wed walk 07:00; Thu/Fri/Sat/Sun not yet
    expect(value(facts, "training.sessions")).toBe(2);
    // previous week cut at Wed Sep 30 12:00: only the Tuesday session counts
    expect(value(facts, "training.sessions.prev")).toBe(1);
    expect(value(facts, "training.sessions.delta")).toBe(1);
    // food: Mon, Tue, and Wednesday's breakfast only
    expect(value(facts, "intake.loggedDays")).toBe(3);
    expect(value(facts, "intake.day.2026-10-07")).toBe(450);
    expect(value(facts, "intake.loggedDays.prev")).toBe(2);
    // recovery by day: Mon, Tue, Wed rows only
    expect(value(facts, "recovery.hrvDays")).toBe(3);
    // activity by day: Mon–Wed vs the previous Mon–Wed
    expect(value(facts, "activity.daysArrived")).toBe(3);
    expect(value(facts, "activity.stepsAvg")).toBe(Math.round((8200 + 11400 + 6900) / 3));
    expect(value(facts, "activity.stepsAvg.prev")).toBe(Math.round((7800 + 8200 + 7600) / 3));
    // a planned day still ahead is upcoming, not missed
    expect(value(facts, "plan.thisWeek.missed")).toBe(0);
    expect(value(facts, "plan.thisWeek.upcoming")).toBe(1);
    // the weigh-in on Saturday has not happened yet
    expect(value(facts, "body.weighIns")).toBe(1);
    expect(factByKey(facts, "body.weightDelta")).toBeUndefined();
  });

  it("never reads before the week starts", () => {
    const input = emptyInput("2026-10-05", "America/Bogota");
    input.cutoff = new Date("2026-10-01T12:00:00Z"); // before the week
    const facts = buildWeekFacts(input);
    expect(facts.coverage.complete).toBe(false);
    expect(facts.coverage.daysCovered).toBe(1);
    expect(facts.coverage.label).toBe("Monday through 12:00 am");
  });
});

describe("the model's copy", () => {
  it("keeps every fact but strips row ids and dates", async () => {
    const facts = await build("full");
    const model = factsForModel(facts);
    expect(model.facts).toHaveLength(facts.facts.length);
    expect(model.coverage).toEqual(facts.coverage);
    for (const f of model.facts) {
      expect("ids" in f.source).toBe(false);
      expect("dates" in f.source).toBe(false);
      expect(f.source.table).toBeTruthy();
    }
    const kcal = model.facts.find((f) => f.key === "training.kcal")!;
    expect(kcal.source).toEqual({ table: "workout_logs", field: "caloriesBurned", count: 6, note: "training burn only — no BMR model" });
    // the stored facts still carry provenance for the chips
    expect(fact(facts, "training.kcal").source.ids).toHaveLength(6);
    // and it is smaller (the fixture's ids are short; real rows carry 36-char UUIDs)
    expect(JSON.stringify(model).length).toBeLessThan(JSON.stringify(facts).length);
    expect(JSON.stringify(model.facts)).not.toContain('"ids"');
    expect(JSON.stringify(model.facts)).not.toContain('"dates"');
    expect(model.nextWeek.dates).toHaveLength(7); // the envelope keeps its calendar
  });
});

describe("helpers", () => {
  it("isoWeekNumber follows ISO-8601", () => {
    expect(isoWeekNumber("2026-10-05")).toBe(41);
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-12-31")).toBe(53);
  });

  it("factsInGroup filters by group", async () => {
    const facts = await build("full");
    const compare = factsInGroup(facts, "compare");
    expect(compare.length).toBeGreaterThan(5);
    expect(compare.every((f) => f.group === "compare")).toBe(true);
  });
});
