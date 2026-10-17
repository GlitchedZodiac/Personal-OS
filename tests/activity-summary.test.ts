import { describe, expect, it } from "vitest";
import {
  type ActivityRow,
  buildMorningReport,
  buildWeeklyReport,
  morningNotification,
  pctChange,
  weekdayOf,
  weeklyNotification,
} from "@/lib/activity-summary";

// The arithmetic behind the morning and weekly activity reports
// (2026-10-17). Dates: Mon 5 Oct … Sun 18 Oct 2026.

function row(date: string, steps: number | null, extra: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date,
    steps,
    activeEnergyKcal: steps === null ? null : steps / 20,
    restingEnergyKcal: steps === null ? null : 1800,
    walkingRunningDistanceKm: steps === null ? null : steps / 1300,
    source: "mixed",
    ...extra,
  };
}

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

describe("pctChange", () => {
  it("is a whole percent, null when there is no honest base", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(100, 100)).toBe(0);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
  });
});

describe("weekdayOf", () => {
  it("names the day of a date string", () => {
    expect(weekdayOf("2026-10-16")).toBe("Friday");
    expect(weekdayOf("2026-10-18")).toBe("Sunday");
  });
});

describe("buildMorningReport", () => {
  // Fri 16 Oct reported; the 7 days before are 9–15 Oct.
  const rows = [
    row(day(8), 50_000), // outside the window — must not count
    row(day(9), 7000), // last Friday
    row(day(10), 6000),
    row(day(11), 8000),
    row(day(12), 9000),
    row(day(13), 5000),
    row(day(14), 7000),
    row(day(15), 7000),
    row(day(16), 8400),
  ];

  it("compares yesterday with the 7 days before it", () => {
    const r = buildMorningReport(rows, day(16));
    expect(r.hasData).toBe(true);
    expect(r.weekday).toBe("Friday");
    expect(r.metrics.steps.value).toBe(8400);
    expect(r.metrics.steps.avg7).toBe(7000); // (7+6+8+9+5+7+7)k / 7
    expect(r.metrics.steps.avg7Days).toBe(7);
    expect(r.metrics.steps.vsAvg7Pct).toBe(20);
  });

  it("compares with the same weekday a week earlier", () => {
    const r = buildMorningReport(rows, day(16));
    expect(r.lastWeekDate).toBe(day(9));
    expect(r.metrics.steps.lastWeek).toBe(7000);
    expect(r.metrics.steps.vsLastWeekPct).toBe(20);
  });

  it("reports every metric, rounded for the screen", () => {
    const r = buildMorningReport(rows, day(16));
    expect(r.metrics.activeEnergyKcal.value).toBe(420);
    expect(r.metrics.restingEnergyKcal.value).toBe(1800);
    expect(r.metrics.restingEnergyKcal.vsAvg7Pct).toBe(0);
    expect(r.metrics.walkingRunningDistanceKm.value).toBe(6.46); // 8400/1300
    expect(r.metrics.walkingRunningDistanceKm.avg7).toBe(5.38);
  });

  it("averages only the days that arrived — a missing day is not a zero", () => {
    const sparse = [row(day(12), 6000), row(day(14), 8000), row(day(16), 7000)];
    const r = buildMorningReport(sparse, day(16));
    expect(r.metrics.steps.avg7).toBe(7000);
    expect(r.metrics.steps.avg7Days).toBe(2);
    expect(r.metrics.steps.vsAvg7Pct).toBe(0);
    expect(r.metrics.steps.lastWeek).toBeNull();
    expect(r.metrics.steps.vsLastWeekPct).toBeNull();
  });

  it("a metric missing on one day is skipped for that metric only", () => {
    const r = buildMorningReport(
      [row(day(15), 6000, { activeEnergyKcal: null }), row(day(16), 6000)],
      day(16)
    );
    expect(r.metrics.steps.avg7Days).toBe(1);
    expect(r.metrics.activeEnergyKcal.avg7Days).toBe(0);
    expect(r.metrics.activeEnergyKcal.avg7).toBeNull();
    expect(r.metrics.activeEnergyKcal.vsAvg7Pct).toBeNull();
  });

  it("says so when the day has not arrived", () => {
    const r = buildMorningReport(rows.slice(0, 5), day(16));
    expect(r.hasData).toBe(false);
    expect(r.metrics.steps.value).toBeNull();
    expect(r.metrics.steps.vsAvg7Pct).toBeNull();
    expect(morningNotification(r)).toBeNull();
  });

  it("writes the 7 am push", () => {
    const msg = morningNotification(buildMorningReport(rows, day(16)));
    expect(msg).toEqual({
      title: "Yesterday · 8,400 steps",
      body: "↑ 20% vs 7-day avg · ↑ 20% vs last Fri · 420 active + 1,800 resting kcal · 6.5 km",
    });
  });
});

describe("buildWeeklyReport", () => {
  // Week of Mon 12 Oct; the week before is 5–11 Oct.
  const prev = [5, 6, 7, 8, 9, 10, 11].map((n) => row(day(n), 6000));
  const week = [
    row(day(12), 9000),
    row(day(13), 4000),
    row(day(14), 12000),
    row(day(15), 7000),
    row(day(16), 8000),
    row(day(17), 6000),
    row(day(18), 10000),
  ];

  it("has seven days, Mon to Sun, in order", () => {
    const r = buildWeeklyReport([...prev, ...week], day(12));
    expect(r.weekStart).toBe(day(12));
    expect(r.weekEnd).toBe(day(18));
    expect(r.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(r.days.map((d) => d.steps)).toEqual([9000, 4000, 12000, 7000, 8000, 6000, 10000]);
    expect(r.complete).toBe(true);
  });

  it("totals, averages, and picks the best and worst day", () => {
    const r = buildWeeklyReport([...prev, ...week], day(12));
    expect(r.totals.steps).toBe(56000);
    expect(r.dailyAvg.steps).toBe(8000);
    expect(r.totals.restingEnergyKcal).toBe(12600);
    expect(r.totals.activeEnergyKcal).toBe(2800);
    expect(r.best).toEqual({ date: day(14), label: "Wed", steps: 12000 });
    expect(r.worst).toEqual({ date: day(13), label: "Tue", steps: 4000 });
  });

  it("gives the week-over-week change on daily averages", () => {
    const r = buildWeeklyReport([...prev, ...week], day(12));
    expect(r.previous.dailyAvg.steps).toBe(6000);
    expect(r.previous.daysWithData).toBe(7);
    expect(r.change.steps).toBe(33); // 8000 vs 6000
    expect(r.change.restingEnergyKcal).toBe(0);
  });

  it("is fair to a week in progress: averages over the days in", () => {
    const partial = week.slice(0, 3); // Mon–Wed: 9000, 4000, 12000
    const r = buildWeeklyReport([...prev, ...partial], day(12));
    expect(r.complete).toBe(false);
    expect(r.daysWithData).toBe(3);
    expect(r.totals.steps).toBe(25000);
    expect(r.dailyAvg.steps).toBe(8333);
    expect(r.change.steps).toBe(39); // 8333.3 vs 6000
    expect(r.days[3]).toMatchObject({ date: day(15), hasData: false, steps: null });
  });

  it("has no worst day with only one day in, and no change without a week before", () => {
    const r = buildWeeklyReport([row(day(12), 5000)], day(12));
    expect(r.best?.steps).toBe(5000);
    expect(r.worst).toBeNull();
    expect(r.change.steps).toBeNull();
    expect(r.previous.daysWithData).toBe(0);
  });

  it("breaks a tie for best day by the earlier day", () => {
    const r = buildWeeklyReport([row(day(12), 7000), row(day(15), 7000), row(day(16), 3000)], day(12));
    expect(r.best?.date).toBe(day(12));
  });

  it("an empty week says nothing", () => {
    const r = buildWeeklyReport(prev, day(12));
    expect(r.daysWithData).toBe(0);
    expect(r.totals.steps).toBeNull();
    expect(r.best).toBeNull();
    expect(weeklyNotification(r)).toBeNull();
  });

  it("writes the Sunday push", () => {
    expect(weeklyNotification(buildWeeklyReport([...prev, ...week], day(12)))).toEqual({
      title: "Your week · 56,000 steps",
      body: "8,000/day · best Wed 12,000 · ↑ 33% vs last week · 2,800 active kcal · 43.1 km",
    });
  });

  it("says how many days are in when the week is short", () => {
    const msg = weeklyNotification(buildWeeklyReport([...prev, ...week.slice(0, 6)], day(12)));
    expect(msg?.body).toMatch(/6 of 7 days in$/);
  });
});
