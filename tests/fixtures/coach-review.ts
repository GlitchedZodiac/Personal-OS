// Canned model answers for the Coach's tests — built FROM the synthetic
// fixture week's facts (tests/fixtures/coach-week.ts), so every number in
// the good one is a fact value and every problem in the bad one is
// deliberate. Nothing here is his data.

import { factByKey } from "@/lib/coach/facts";
import type { Fact, WeekFacts } from "@/lib/coach/types";

function factOf(facts: WeekFacts, key: string): Fact {
  const f = factByKey(facts, key);
  if (!f) throw new Error(`fixture review needs fact ${key}`);
  return f;
}

/** A review that keeps every rule: cited fact numbers, plain words, three valid moves. */
export function goodReview(facts: WeekFacts) {
  const f = (key: string) => factOf(facts, key);
  const n = (key: string) => f(key).value as number;
  return {
    headline: "More training, protein still short",
    verdict: "mixed",
    whatHappened: [
      { text: `Reviewed through Sunday evening: ${f("week.coverage").value}.`, cites: [f("week.coverage").id] },
      {
        text: `${n("training.sessions")} sessions against a target of ${n("plan.targetDaysPerWeek")} days [${f("training.sessions").id}, ${f("plan.targetDaysPerWeek").id}].`,
        cites: [],
      },
      {
        text: `Tonnage ${n("training.volumeKg").toLocaleString("en-US")} kg, up ${n("training.volumeKg.deltaPct")}% on last week.`,
        cites: [f("training.volumeKg").id, f("training.volumeKg.deltaPct").id],
      },
      { text: `Weight down ${Math.abs(n("body.weightDelta"))} kg across the week.`, cites: [f("body.weightDelta").id] },
    ],
    whatItMeans: [
      {
        text: `Protein averaged ${n("intake.avgProteinG")} g against ${n("intake.proteinTargetG")} g, hit on ${n("intake.proteinDaysHit")} days.`,
        cites: [f("intake.avgProteinG").id, f("intake.proteinTargetG").id, f("intake.proteinDaysHit").id],
      },
    ],
    moves: [
      {
        title: "Plan the strength days",
        why: `Only ${n("plan.thisWeek.done")} planned sessions were trained [${f("plan.thisWeek.done").id}].`,
        cites: [],
        action: {
          kind: "plan_week",
          replaceWeek: false,
          days: [
            {
              date: facts.nextWeek.dates[3],
              title: "Ridge Loop",
              trailName: "ridge loop",
            },
            {
              date: facts.nextWeek.dates[1],
              title: "Strength A",
              routineName: "routine alpha",
              targetWeightKg: 24,
              // the planner would turn this into a Reminder row the card never showed
              reminders: [{ atLocal: `${facts.nextWeek.dates[1]}T06:00`, title: "Stretch first" }],
            },
          ],
        },
      },
      {
        title: "Shift calories toward protein",
        why: `Protein reached ${n("intake.proteinPctOfTarget")}% of target.`,
        cites: [f("intake.proteinPctOfTarget").id],
        action: { kind: "adjust_targets", proteinPct: 35, carbsPct: 40, fatPct: 25 },
      },
      {
        title: "Weigh in on Saturday",
        why: `Weighed in on only ${n("body.weighIns")} days.`,
        cites: [f("body.weighIns").id],
        action: { kind: "log_measurement", fields: ["weightKg", "waistCm", "notAField"] },
      },
    ],
  };
}

/** A review that breaks the rules on purpose — one of each kind. */
export function badReview(facts: WeekFacts) {
  const f = (key: string) => factOf(facts, key);
  return {
    headline: "77 sessions and a record week",
    verdict: "great",
    whatHappened: [
      { text: "You trained 77 sessions this week.", cites: [f("training.sessions").id] },
      { text: `Intake averaged ${(f("intake.avgKcal").value as number).toLocaleString("en-US")} kcal.`, cites: [] },
      { text: `Steps averaged ${(f("activity.stepsAvg").value as number).toLocaleString("en-US")} a day [f9999].`, cites: [] },
      { text: "Low HRV suggests insomnia, worth watching.", cites: [f("recovery.hrvAvg").id] },
    ],
    whatItMeans: [],
    moves: [
      {
        title: "Cut to 1,200 kcal",
        why: "Drop hard and fast.",
        cites: [],
        action: { kind: "adjust_targets", calorieTarget: 1200 },
      },
    ],
  };
}
