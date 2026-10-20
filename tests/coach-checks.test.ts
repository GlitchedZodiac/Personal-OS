import { beforeAll, describe, expect, it, vi } from "vitest";

// The Coach's post-check (docs/coach-plan.md §2.3, reworked in review round
// 3): every number against the facts ITS OWN sentence cites, with its unit.
// Synthetic fixture week only.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  checkReview,
  citedClosure,
  currentPcts,
  evidenceFrom,
  extractNumbers,
  liftCites,
  medicalPhrase,
  needsRetry,
  payloadEvidence,
  stillWritable,
  tokenize,
  toNumber,
  unverifiedTokens,
  validateAction,
  windowDates,
  type Evidence,
} from "@/lib/coach/checks";
import { buildWeekFacts, factByKey } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import type { Fact, WeekFacts } from "@/lib/coach/types";
import { badReview, goodReview } from "@/tests/fixtures/coach-review";
import { FIXTURE_TIME_ZONE, FIXTURE_WEEK_START, fixtureSource } from "@/tests/fixtures/coach-week";

const SUNDAY_EVENING = new Date("2026-10-12T00:00:00Z"); // Sun Oct 11, 19:00 Bogotá
let facts: WeekFacts;

beforeAll(async () => {
  const input = await loadWeekInput(fixtureSource("full"), { weekStart: FIXTURE_WEEK_START, timeZone: FIXTURE_TIME_ZONE, now: SUNDAY_EVENING });
  facts = buildWeekFacts(input);
});

const fact = (key: string): Fact => {
  const f = factByKey(facts, key);
  if (!f) throw new Error(`missing ${key}`);
  return f;
};
/** The evidence a sentence citing these fact keys carries. */
const citing = (...keys: string[]): Evidence => evidenceFrom(citedClosure(keys.map((k) => fact(k).id), facts.facts), windowDates(facts));
const bad = (text: string, ...keys: string[]) => unverifiedTokens(text, citing(...keys));

describe("reading numbers as people write them", () => {
  it("digits with commas, decimals, minus signs, thousands, and digits glued to letters", () => {
    expect(extractNumbers("1,850 kcal and −0.3 kg, 10k steps, x4321, 2200kcal")).toEqual(["1,850", "−0.3", "10k", "4321", "2200"]);
    expect(toNumber("1,850")).toBe(1850);
    expect(toNumber("10k")).toBe(10000);
    // fact ids and heart-rate zones are names, not numbers
    expect(extractNumbers("6 sessions [f4, f9], f12, mostly Z2")).toEqual(["6"]);
  });

  it("units, number words, ranges, times and dates", () => {
    const t = tokenize("seven days, a dozen sessions, 3–4 kg, at 9:30 pm on Oct 13, three moves");
    expect(t.numbers.map((n) => [n.value, n.unit])).toEqual([
      [3, "kg"],
      [4, "kg"],
      [7, "days"],
      [12, "sessions"],
    ]);
    expect(t.times).toEqual([{ raw: "9:30 pm", minutes: 21 * 60 + 30 }]);
    expect(t.dates).toEqual([{ raw: "Oct 13", key: "10-13" }]);
  });

  it("a small digit before a structural noun is a count of moves, not a claim", () => {
    expect(extractNumbers("3 moves for next week")).toEqual([]);
    expect(extractNumbers("3 sessions")).toEqual(["3"]);
  });
});

describe("every number against the facts its sentence cites", () => {
  it("passes the cited fact's value, in its unit, by absolute value", () => {
    expect(bad("6 sessions", "training.sessions")).toEqual([]);
    expect(bad("down 0.3 kg", "body.weightDelta")).toEqual([]);
    expect(bad("2,233 kcal a day, 267 under", "intake.avgVsTarget")).toEqual([]); // a parent of the cited fact
  });

  it("refuses another metric's value, even when it equals some fact", () => {
    const sleepHours = fact("recovery.sleepAvg").value as number; // 6.9
    expect(bad(`slept ${sleepHours} hours`, "training.sessions")).toEqual([`${sleepHours} h`]);
    expect(bad("6 sessions", "intake.avgKcal")).toEqual(["6 sessions"]); // right number, wrong fact cited
  });

  it("refuses a unit that does not match", () => {
    expect(bad("6 days", "training.sessions")).toEqual(["6 days"]);
    expect(bad("down 0.3 lb", "body.weightDelta")).toEqual(["0.3 lb"]);
  });

  it("reads number words and both ends of a range", () => {
    expect(bad("trained six days", "training.days")).toEqual([]);
    expect(bad("trained seven days", "training.days")).toEqual(["seven days"]);
    expect(bad("2–3 sessions", "plan.thisWeek.done")).toEqual(["3 sessions"]); // 2 is the fact, 3 is not
  });

  it("dates: inside the window, or named by a cited fact — nothing else", () => {
    expect(bad("plan Oct 13", "training.sessions")).toEqual([]);
    expect(bad("unlike Sep 3", "training.sessions")).toEqual(["Sep 3"]);
    expect(bad("last ran Oct 1", "trails.1.prev.minutes")).toEqual([]);
  });

  it("times: only one a cited fact states", () => {
    expect(bad("through 7:00 pm", "week.coverage")).toEqual([]);
    expect(bad("by 9 pm", "week.coverage")).toEqual(["9 pm"]);
  });

  it("an empty citation carries no evidence at all", () => {
    expect(unverifiedTokens("6 sessions", evidenceFrom([], windowDates(facts)))).toEqual(["6 sessions"]);
  });
});

describe("a move's own evidence is its structured payload only", () => {
  it("targets, grams derived from them, days planned, the reminder's time", () => {
    const targets = payloadEvidence({ kind: "adjust_targets", calorieTarget: 2600, proteinPct: 30, carbsPct: 45, fatPct: 25 }, facts);
    expect(unverifiedTokens("2,600 kcal, protein 30% — 195 g", targets)).toEqual([]);
    const plan = payloadEvidence({ kind: "plan_week", replaceWeek: false, days: [{ date: "2026-10-13", title: "Strength A 5x5", targetWeightKg: 24 }] }, facts);
    expect(unverifiedTokens("1 day at 24 kg", plan)).toEqual([]);
    expect(unverifiedTokens("5x5", plan)).toEqual(["5", "5"]); // a number in a title is not evidence
    const reminder = payloadEvidence({ kind: "set_reminder", title: "Bed", atLocal: "2026-10-13T21:30" }, facts);
    expect(unverifiedTokens("at 9:30 pm", reminder)).toEqual([]);
  });
});

describe("citations and medical framing", () => {
  it("lifts inline [f12] markers into the cites list", () => {
    expect(liftCites("6 sessions [f4, f9].", ["f4", "nonsense"])).toEqual({ text: "6 sessions.", cites: ["f4", "f9"] });
  });

  it("catches conditions, diagnoses, treatments, doses and supplement advice — in context", () => {
    for (const s of [
      "low HRV suggests insomnia",
      "you might have a deficiency",
      "this looks like overtraining",
      "watch your blood pressure",
      "could be low testosterone",
      "high cortisol from stress",
      "signs of inflammation",
      "careful with that injury",
      "you're heading for burnout",
      "chronic fatigue risk",
      "possible sleep apnea",
      "take 400 mg magnesium",
      "try melatonin",
      "talk to your doctor",
    ]) {
      expect(medicalPhrase(s), s).not.toBeNull();
    }
  });

  it("leaves coaching language alone", () => {
    for (const s of [
      "treat yourself to a rest day",
      "a full dose of sleep",
      "supplement your walks with a hike",
      "a 300 kcal deficit held all week",
      "resting heart rate held at 57",
      "you have 2 sessions planned",
    ]) {
      expect(medicalPhrase(s), s).toBeNull();
    }
  });
});

describe("actions are validated as they will be written", () => {
  it("plan_week: next week only, known names, no reminders, never replacing the week", () => {
    const result = validateAction(goodReview(facts).moves[0].action, facts);
    expect(result.action).toEqual({
      kind: "plan_week",
      replaceWeek: false,
      days: [
        { date: facts.nextWeek.dates[1], title: "Strength A", routineName: "Routine Alpha", targetWeightKg: 24 },
        { date: facts.nextWeek.dates[3], title: "Ridge Loop", trailName: "Ridge Loop" },
      ],
    });
    const replace = validateAction({ kind: "plan_week", replaceWeek: true, days: [{ date: facts.nextWeek.dates[0], title: "Lift" }] }, facts);
    expect(replace.action).toMatchObject({ replaceWeek: false });
    expect(replace.note).toMatch(/replacing a week's plan is not offered/);
  });

  it("adjust_targets: ±25 % on kcal, macros complete, adding to 100, each moving ≤ 10 points", () => {
    const cur = currentPcts(facts);
    expect(cur).toEqual({ proteinPct: 25, carbsPct: 50, fatPct: 25 });
    expect(validateAction({ kind: "adjust_targets", proteinPct: 30, carbsPct: 45, fatPct: 25 }, facts).action).toEqual({
      kind: "adjust_targets", proteinPct: 30, carbsPct: 45, fatPct: 25,
    });
    expect(validateAction({ kind: "adjust_targets", proteinPct: 40, carbsPct: 35, fatPct: 25 }, facts).note).toMatch(/moving protein by 15 points/);
    expect(validateAction({ kind: "adjust_targets", calorieTarget: 1500 }, facts).note).toMatch(/too big/);
    expect(validateAction({ kind: "adjust_targets", proteinPct: 30, carbsPct: 45 }, facts).note).toMatch(/complete set/);
    expect(validateAction({ kind: "adjust_targets", proteinPct: 25, carbsPct: 50, fatPct: 25 }, facts).note).toMatch(/no target change/);
  });

  it("set_reminder and log_measurement, inside the review's window", () => {
    expect(validateAction({ kind: "set_reminder", title: "x", atLocal: "2026-12-01T07:00" }, facts).action.kind).toBe("none");
    expect(validateAction({ kind: "log_measurement", fields: ["weightKg", "shoeSize"], when: "2019-01-01" }, facts)).toEqual({
      action: { kind: "log_measurement", fields: ["weightKg"] },
      note: "2019-01-01 is outside the review's weeks — the measurement is timed when you confirm",
    });
  });

  it("stillWritable refuses a begun week's plan and a past reminder, in HIS zone", () => {
    const plan = { kind: "plan_week" as const, replaceWeek: false, days: [{ date: "2026-10-13", title: "Strength A" }] };
    expect(stillWritable(plan, new Date("2026-10-12T15:00:00Z"), "America/Bogota")).toEqual({ ok: true });
    expect(stillWritable(plan, new Date("2026-10-14T15:00:00Z"), "America/Bogota")).toMatchObject({ ok: false });
    const reminder = { kind: "set_reminder" as const, title: "Weigh in", atLocal: "2026-10-13T07:00" }; // 12:00Z in Bogotá and in CDT
    expect(stillWritable(reminder, new Date("2026-10-13T11:59:00Z"), "America/Bogota")).toEqual({ ok: true });
    expect(stillWritable(reminder, new Date("2026-10-13T12:00:00Z"), "America/Bogota")).toMatchObject({ ok: false });
    expect(stillWritable({ kind: "none" }, new Date(), "America/Bogota")).toMatchObject({ ok: false });
  });
});

describe("checkReview — the whole answer", () => {
  it("passes a review that keeps every rule", () => {
    const result = checkReview(goodReview(facts), facts, { attempts: 1, retried: false });
    expect(result.violations).toEqual([]);
    expect(result.checks).toMatchObject({ unverified: 0, uncited: 0, unknownCites: 0, tooLong: 0, medicalRemoved: [], actionsInvalidated: [] });
    expect(result.checks.verdictInvalid).toBeUndefined();
    expect(result.review.whatHappened.every((i) => !i.flags)).toBe(true);
    expect(result.review.moves.map((m) => m.action.kind)).toEqual(["plan_week", "adjust_targets", "log_measurement"]);
    expect(needsRetry(result)).toBe(false);
  });

  it("flags, removes VISIBLY, invalidates — and asks for a retry", () => {
    const result = checkReview(badReview(facts), facts, { attempts: 1, retried: false });
    expect(result.review.headlineFlags).toEqual([{ kind: "unverified", tokens: ["77 sessions"] }]);
    expect(result.checks.verdictInvalid).toBe(true);
    const [invented, uncited, unknownCite, medical] = result.review.whatHappened;
    expect(invented.flags).toEqual([{ kind: "unverified", tokens: ["77 sessions"] }]);
    expect(uncited.flags).toEqual([{ kind: "unverified", tokens: ["2,233 kcal"] }, { kind: "uncited" }]);
    expect(unknownCite.flags).toContainEqual({ kind: "unknown_cite", ids: ["f9999"] });
    // the medical line stays in place, emptied and marked; its words are kept in the checks
    expect(medical).toEqual({ text: "", cites: [], removed: { reason: "medical", phrase: "insomnia" } });
    expect(result.checks.medicalRemoved).toEqual([{ section: "what happened", phrase: "insomnia", text: "Low HRV suggests insomnia, worth watching." }]);
    expect(result.checks.actionsInvalidated).toEqual([{ index: 0, reason: expect.stringMatching(/too big/) }]);
    expect(result.review.moves[0].flags).toContainEqual({ kind: "unverified", tokens: ["1,200 kcal"] });
    expect(needsRetry(result)).toBe(true);
  });

  it("a medical move is kept in its slot, never dropped", () => {
    const raw = goodReview(facts);
    raw.moves[1] = { title: "Try melatonin", why: "Sleep was short.", cites: [], action: { kind: "none" } as never };
    const result = checkReview(raw, facts, { attempts: 1, retried: false });
    expect(result.review.moves).toHaveLength(3);
    expect(result.review.moves[1]).toMatchObject({ title: "", removed: { reason: "medical", phrase: "Try melatonin" }, action: { kind: "none" } });
    expect(needsRetry(result)).toBe(true);
  });

  it("counts what it truncates", () => {
    const raw = goodReview(facts);
    raw.whatItMeans = [...raw.whatItMeans, ...raw.whatItMeans, ...raw.whatItMeans, ...raw.whatItMeans];
    const result = checkReview(raw, facts, { attempts: 1, retried: false });
    expect(result.review.whatItMeans).toHaveLength(3);
    expect(result.checks.truncated).toEqual([{ section: "what it means", dropped: 1 }]);
  });
});
