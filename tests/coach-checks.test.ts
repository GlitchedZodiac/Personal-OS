import { beforeAll, describe, expect, it, vi } from "vitest";

// The Coach's post-check (docs/coach-plan.md §2.3): the model is held to the
// facts. Synthetic fixture week only.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  buildAllowance,
  checkReview,
  extractNumbers,
  liftCites,
  medicalPhrase,
  needsRetry,
  stillWritable,
  stripAllowedDates,
  toNumber,
  unverifiedTokens,
  validateAction,
  type Allowance,
} from "@/lib/coach/checks";
import { buildWeekFacts, factByKey } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import type { WeekFacts } from "@/lib/coach/types";
import { badReview, goodReview } from "@/tests/fixtures/coach-review";
import { FIXTURE_TIME_ZONE, FIXTURE_WEEK_START, fixtureSource } from "@/tests/fixtures/coach-week";

const SUNDAY_EVENING = new Date("2026-10-12T00:00:00Z"); // Sun Oct 11, 19:00 Bogotá
let facts: WeekFacts;

beforeAll(async () => {
  const input = await loadWeekInput(fixtureSource("full"), {
    weekStart: FIXTURE_WEEK_START,
    timeZone: FIXTURE_TIME_ZONE,
    now: SUNDAY_EVENING,
  });
  facts = buildWeekFacts(input);
});

const allowance = (numbers: number[], dates: string[] = []): Allowance => ({ numbers, dates: new Set(dates) });

describe("numbers as people write them", () => {
  it("finds commas, decimals, minus signs and thousands — never the digits of a word", () => {
    expect(extractNumbers("1,850 kcal and −0.3 kg, 10k steps, f12, Z2, 2200kcal")).toEqual([
      "1,850", "−0.3", "10k", "2200",
    ]);
    expect(extractNumbers("6 sessions [f4, f9]")).toEqual(["6"]);
    expect(toNumber("1,850")).toBe(1850);
    expect(toNumber("−0.3")).toBe(-0.3);
    expect(toNumber("10k")).toBe(10000);
  });

  it("accepts fact numbers by absolute value, within rounding", () => {
    const a = allowance([6, -0.3, 1850, 90.4]);
    expect(unverifiedTokens("6 sessions, down 0.3 kg, 1,850 kcal", a)).toEqual([]);
    expect(unverifiedTokens("about 90 kg", a)).toEqual([]); // 90.4 rounds to 90
    expect(unverifiedTokens("5 sessions", a)).toEqual(["5"]);
    expect(unverifiedTokens("dropped 0.5 kg", a)).toEqual(["0.5"]);
  });

  it("lets a bare small count through, but not a quantity", () => {
    const a = allowance([6]);
    expect(unverifiedTokens("three moves, 2 of them quick", a)).toEqual([]);
    expect(unverifiedTokens("3 moves for next week", a)).toEqual([]);
    expect(unverifiedTokens("2 sessions", a)).toEqual(["2"]);
    expect(unverifiedTokens("2 kg heavier", a)).toEqual(["2"]);
    expect(unverifiedTokens("3 days", a)).toEqual(["3"]);
  });

  it("accepts a date only when it is written as a date inside the window", () => {
    const a = allowance([6], ["10-12", "10-5"]);
    expect(stripAllowedDates("plan Oct 12 and 5 October and 2026-10-12", a.dates).replace(/\s+/g, " ").trim()).toBe("plan and and");
    expect(unverifiedTokens("start Oct 12", a)).toEqual([]);
    expect(unverifiedTokens("start Oct 25", a)).toEqual(["25"]);
    expect(unverifiedTokens("12 of them", a)).toEqual(["12"]); // a bare day number is not a date
  });

  it("builds the allowance from fact values, label thresholds and the three weeks", () => {
    const a = buildAllowance(facts);
    expect(a.numbers).toContain(factByKey(facts, "training.sessions")!.value);
    expect(a.numbers).toContain(10000); // "Days at 10,000+ steps"
    expect(a.numbers).not.toContain(77);
    expect(a.numbers).not.toContain(1200);
    expect(a.dates.has("9-28")).toBe(true); // the week before
    expect(a.dates.has("10-19")).toBe(true); // the reminder horizon
    expect(a.dates.has("11-30")).toBe(false);
  });
});

describe("citations and words", () => {
  it("lifts inline [f12] markers into the cites list and tidies the text", () => {
    expect(liftCites("6 sessions [f4, f9].", ["f4", "nonsense"])).toEqual({ text: "6 sessions.", cites: ["f4", "f9"] });
    expect(liftCites("no cites here", undefined)).toEqual({ text: "no cites here", cites: [] });
  });

  it("flags clinical framing and leaves training words alone", () => {
    expect(medicalPhrase("Low HRV suggests insomnia")).toBe("insomnia");
    expect(medicalPhrase("you may have a deficiency")).toBeTruthy();
    expect(medicalPhrase("talk to your doctor about it")).toBeTruthy();
    expect(medicalPhrase("ask a doctor")).toBeTruthy();
    expect(medicalPhrase("a 300 kcal deficit, held all week")).toBeNull();
    expect(medicalPhrase("you have 2 sessions planned")).toBeNull();
    expect(medicalPhrase("an easy treadmill walk")).toBeNull();
    expect(medicalPhrase("resting heart rate held at 57")).toBeNull();
  });
});

describe("actions are validated as the card will write them", () => {
  it("plan_week: next week only, known names only, no hidden reminders, sorted", () => {
    const result = validateAction(goodReview(facts).moves[0].action, facts);
    expect(result.action).toEqual({
      kind: "plan_week",
      replaceWeek: false,
      days: [
        { date: facts.nextWeek.dates[1], title: "Strength A", routineName: "Routine Alpha", targetWeightKg: 24 },
        { date: facts.nextWeek.dates[3], title: "Ridge Loop", trailName: "Ridge Loop" },
      ],
    });
    expect(JSON.stringify(result.action)).not.toContain("reminders");

    const mixed = validateAction(
      {
        kind: "plan_week",
        days: [
          { date: "2026-10-01", title: "Old day" },
          { date: facts.nextWeek.dates[0], title: "Made-up", routineName: "Routine Zulu" },
        ],
      },
      facts
    );
    expect(mixed.action).toEqual({ kind: "plan_week", replaceWeek: false, days: [{ date: facts.nextWeek.dates[0], title: "Made-up" }] });
    expect(mixed.note).toMatch(/2026-10-01 is not in next week; routine "Routine Zulu" not found/);

    expect(validateAction({ kind: "plan_week", days: [{ date: "2026-10-01", title: "x" }] }, facts).action.kind).toBe("none");
  });

  it("adjust_targets: within 25 %, macros as a complete set adding to 100", () => {
    const current = facts.targets.calorieTarget;
    expect(validateAction({ kind: "adjust_targets", calorieTarget: Math.round(current * 1.1) }, facts).action).toEqual({
      kind: "adjust_targets",
      calorieTarget: Math.round(current * 1.1),
    });
    expect(validateAction({ kind: "adjust_targets", calorieTarget: Math.round(current * 0.6) }, facts).note).toMatch(/too big/);
    expect(validateAction({ kind: "adjust_targets", proteinPct: 35, carbsPct: 40 }, facts).note).toMatch(/complete set/);
    expect(validateAction({ kind: "adjust_targets", proteinPct: 35, carbsPct: 40, fatPct: 24 }, facts).note).toMatch(/add up to 99/);
    expect(validateAction({ kind: "adjust_targets", calorieTarget: current }, facts).note).toMatch(/no target change/);
  });

  it("set_reminder and log_measurement", () => {
    const at = `${facts.nextWeek.dates[1]}T07:00`;
    expect(validateAction({ kind: "set_reminder", title: "Weigh in", atLocal: at }, facts).action).toEqual({
      kind: "set_reminder",
      title: "Weigh in",
      atLocal: at,
    });
    expect(validateAction({ kind: "set_reminder", title: "x", atLocal: "tomorrow 7am" }, facts).action.kind).toBe("none");
    expect(validateAction({ kind: "set_reminder", title: "x", atLocal: "2026-12-01T07:00" }, facts).action.kind).toBe("none");
    expect(validateAction({ kind: "log_measurement", fields: ["weightKg", "waistCm", "notAField", "weightKg"] }, facts).action).toEqual({
      kind: "log_measurement",
      fields: ["weightKg", "waistCm"],
    });
    expect(validateAction({ kind: "log_measurement", fields: ["shoeSize"] }, facts).action.kind).toBe("none");
    expect(validateAction({ kind: "teleport" }, facts).note).toMatch(/unknown action "teleport"/);
  });

  it("stillWritable: a plan for a week already begun, or a reminder already past, is refused at confirm", () => {
    const plan = { kind: "plan_week" as const, replaceWeek: false, days: [{ date: "2026-10-13", title: "Strength A" }] };
    expect(stillWritable(plan, new Date("2026-10-12T15:00:00Z"), "America/Bogota")).toEqual({ ok: true });
    expect(stillWritable(plan, new Date("2026-10-14T15:00:00Z"), "America/Bogota")).toMatchObject({ ok: false });
    const reminder = { kind: "set_reminder" as const, title: "Weigh in", atLocal: "2026-10-13T07:00" }; // 12:00Z in Bogotá
    expect(stillWritable(reminder, new Date("2026-10-13T11:59:00Z"), "America/Bogota")).toEqual({ ok: true });
    expect(stillWritable(reminder, new Date("2026-10-13T12:00:00Z"), "America/Bogota")).toMatchObject({ ok: false });
    // the same wall-clock 07:00 in Houston is 12:00Z in October (CDT): the zone decides
    expect(stillWritable(reminder, new Date("2026-10-13T11:59:00Z"), "America/Chicago")).toEqual({ ok: true });
    expect(stillWritable({ kind: "none" }, new Date(), "America/Bogota")).toMatchObject({ ok: false });
    expect(stillWritable({ kind: "adjust_targets", calorieTarget: 2300 }, new Date(), "America/Bogota")).toEqual({ ok: true });
  });
});

describe("checkReview — the whole answer", () => {
  it("passes a review that keeps every rule, untouched apart from the actions", () => {
    const result = checkReview(goodReview(facts), facts, { attempts: 1, retried: false });
    expect(result.violations).toEqual([]);
    expect(result.checks).toMatchObject({ unverified: 0, uncited: 0, unknownCites: 0, tooLong: 0, medicalRemoved: [], actionsInvalidated: [] });
    expect(result.review.headlineFlags).toBeUndefined();
    expect(result.review.whatHappened).toHaveLength(4);
    expect(result.review.whatHappened.every((i) => !i.flags)).toBe(true);
    expect(result.review.whatHappened[1].text).not.toContain("[");
    expect(result.review.whatHappened[1].cites).toHaveLength(2);
    expect(result.review.moves).toHaveLength(3);
    expect(result.review.moves.map((m) => m.action.kind)).toEqual(["plan_week", "adjust_targets", "log_measurement"]);
    expect(needsRetry(result)).toBe(false);
  });

  it("flags, removes and invalidates — and asks for a retry", () => {
    const result = checkReview(badReview(facts), facts, { attempts: 1, retried: false });
    expect(result.review.headlineFlags).toEqual([{ kind: "unverified", tokens: ["77"] }]);
    expect(result.review.verdict).toBe("mixed");
    const [invented, uncited, unknownCite] = result.review.whatHappened;
    expect(invented.flags).toEqual([{ kind: "unverified", tokens: ["77"] }]);
    expect(uncited.flags).toEqual([{ kind: "uncited" }]);
    expect(unknownCite.flags).toEqual([{ kind: "unknown_cite", ids: ["f9999"] }]);
    expect(result.review.whatHappened).toHaveLength(3); // the insomnia line is gone
    expect(result.checks.medicalRemoved).toEqual([{ section: "what happened", phrase: "insomnia" }]);
    expect(result.checks.actionsInvalidated).toEqual([{ index: 0, reason: expect.stringMatching(/too big/) }]);
    expect(result.review.moves[0].action).toMatchObject({ kind: "none" });
    expect(result.review.moves[0].flags).toContainEqual({ kind: "unverified", tokens: ["1,200"] });
    expect(result.violations.length).toBeGreaterThan(5);
    expect(needsRetry(result)).toBe(true);
  });

  it("a proposed target's number is the move's own evidence", () => {
    const target = facts.targets.calorieTarget + 100;
    const raw = {
      ...goodReview(facts),
      moves: [
        {
          title: `Raise the target to ${target.toLocaleString("en-US")} kcal`,
          why: `Training burn rose [${factByKey(facts, "training.kcal")!.id}].`,
          cites: [],
          action: { kind: "adjust_targets", calorieTarget: target },
        },
      ],
    };
    const result = checkReview(raw, facts, { attempts: 1, retried: false });
    expect(result.review.moves[0].flags).toBeUndefined();
  });

  it("falls back to a plain headline and survives garbage", () => {
    const result = checkReview({ headline: "", moves: "nope" }, facts, { attempts: 2, retried: true });
    expect(result.review.headline).toBe("The week, in numbers");
    expect(result.review.moves).toEqual([]);
    expect(result.checks).toMatchObject({ attempts: 2, retried: true });
    expect(needsRetry(result)).toBe(true);
  });
});
