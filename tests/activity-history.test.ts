import { describe, expect, it } from "vitest";
import type { ActivityRow } from "@/lib/activity-summary";
import { buildActivityHistory, mergeActivitySources } from "@/lib/activity-history";
import { addDaysToDateString } from "@/lib/timezone";

// Steps over his whole history (2026-10-17). "Today" is Sat 17 Oct 2026, so
// everything runs through Fri 16 Oct.

const TODAY = "2026-10-17";

function row(date: string, steps: number | null, extra: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date,
    steps,
    activeEnergyKcal: steps === null ? null : steps / 20,
    restingEnergyKcal: null,
    walkingRunningDistanceKm: steps === null ? null : steps / 1000,
    ...extra,
  };
}

/** `n` consecutive days ending on `end`, steps from `f(i)` (i = 0 oldest). */
function series(end: string, n: number, f: (i: number) => number | null): ActivityRow[] {
  return Array.from({ length: n }, (_, i) => row(addDaysToDateString(end, i - (n - 1)), f(i)));
}

describe("mergeActivitySources", () => {
  it("the Shortcut's day wins; the app fills only the gaps", () => {
    const merged = mergeActivitySources(
      [row("2026-10-15", 8000)],
      [
        { localDate: "2026-10-15", steps: 3000, activeEnergyKcal: 100, walkingRunningDistanceMeters: 2000 },
        { localDate: "2026-10-14", steps: 4500, activeEnergyKcal: 200, walkingRunningDistanceMeters: 3200 },
      ]
    );
    expect(merged.map((r) => [r.date, r.steps, r.origin])).toEqual([
      ["2026-10-14", 4500, "app"],
      ["2026-10-15", 8000, "shortcut"],
    ]);
    expect(merged[0].walkingRunningDistanceKm).toBe(3.2);
    expect(merged[0].restingEnergyKcal).toBeNull();
  });

  it("a travel day with two app rows keeps the fuller one", () => {
    const merged = mergeActivitySources(
      [],
      [
        { localDate: "2026-10-10", steps: 3484, activeEnergyKcal: 32, walkingRunningDistanceMeters: 2431 },
        { localDate: "2026-10-10", steps: 5072, activeEnergyKcal: 31, walkingRunningDistanceMeters: 3643 },
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].steps).toBe(5072);
  });

  it("skips app rows that hold nothing", () => {
    expect(
      mergeActivitySources([], [
        { localDate: "2026-10-10", steps: 0, activeEnergyKcal: null, walkingRunningDistanceMeters: null },
      ])
    ).toEqual([]);
  });
});

describe("buildActivityHistory", () => {
  it("runs through yesterday — today's partial count never counts", () => {
    const h = buildActivityHistory([row("2026-10-16", 9000), row(TODAY, 1200)], TODAY);
    expect(h.asOf).toBe("2026-10-16");
    expect(h.daysWithData).toBe(1);
    expect(h.days.at(-1)).toMatchObject({ start: "2026-10-16", avg: { steps: 9000 } });
  });

  it("has 30 days, 26 weeks and 24 months on screen, oldest first", () => {
    const h = buildActivityHistory(series("2026-10-16", 400, () => 8000), TODAY);
    expect(h.days).toHaveLength(30);
    expect(h.days[0].start).toBe("2026-09-17");
    expect(h.weeks).toHaveLength(26);
    expect(h.weeks.at(-1)).toMatchObject({ start: "2026-10-12", end: "2026-10-16", days: 5 });
    expect(h.months).toHaveLength(24);
    expect(h.months.at(-1)).toMatchObject({ start: "2026-10-01", end: "2026-10-16" });
    expect(h.months[0].start).toBe("2024-11-01");
  });

  it("weeks and months show the daily average over the days that arrived", () => {
    // Oct 2026: only three days in.
    const h = buildActivityHistory(
      [row("2026-10-02", 6000), row("2026-10-09", 9000), row("2026-10-16", 12000)],
      TODAY
    );
    const oct = h.months.at(-1)!;
    expect(oct.days).toBe(3);
    expect(oct.avg.steps).toBe(9000);
    expect(oct.total.steps).toBe(27000);
    const empty = h.months[0];
    expect(empty.days).toBe(0);
    expect(empty.avg.steps).toBeNull();
  });

  it("has a year for every year since the first day", () => {
    const h = buildActivityHistory(
      [row("2019-03-04", 5000), row("2026-10-16", 7000)],
      TODAY
    );
    expect(h.firstDate).toBe("2019-03-04");
    expect(h.years.map((y) => y.start)).toEqual([
      "2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01",
      "2023-01-01", "2024-01-01", "2025-01-01", "2026-01-01",
    ]);
    expect(h.years.at(-1)!.end).toBe("2026-10-16");
    expect(h.years[1].days).toBe(0);
  });

  it("trends compare each window's daily average with the one before", () => {
    // 14 days: 6,000 a day, then 9,000 a day.
    const h = buildActivityHistory(series("2026-10-16", 14, (i) => (i < 7 ? 6000 : 9000)), TODAY);
    const week = h.trends.find((t) => t.key === "7d")!;
    expect(week.avg.steps).toBe(9000);
    expect(week.prevAvg.steps).toBe(6000);
    expect(week.change.steps).toBe(50);
    expect(week.covered).toBe(7);
    const month = h.trends.find((t) => t.key === "30d")!;
    expect(month.prevAvg.steps).toBeNull();
    expect(month.change.steps).toBeNull();
  });

  it("all time: totals, average, best day", () => {
    const h = buildActivityHistory(
      [row("2026-10-14", 4000), row("2026-10-15", 16000), row("2026-10-16", 10000)],
      TODAY
    );
    expect(h.allTime.total.steps).toBe(30000);
    expect(h.allTime.dailyAvg.steps).toBe(10000);
    expect(h.allTime.bestDay.steps).toEqual({ date: "2026-10-15", value: 16000 });
    expect(h.allTime.bestDay.walkingRunningDistanceKm).toEqual({ date: "2026-10-15", value: 16 });
  });

  it("best week needs 4 days in, best month 15", () => {
    const rows = [
      // Week of 5 Oct: one huge day only.
      row("2026-10-05", 30000),
      // Week of 12 Oct: four steady days.
      ...series("2026-10-15", 4, () => 9000),
    ];
    const h = buildActivityHistory(rows, TODAY);
    expect(h.allTime.bestWeek).toMatchObject({ start: "2026-10-12", avg: 9000, days: 4 });
    expect(h.allTime.bestMonth).toBeNull(); // October has 5 days in
  });

  it("counts 10k days and streaks; a missing day breaks a streak", () => {
    const rows = [
      row("2026-10-08", 11000),
      row("2026-10-09", 12000),
      row("2026-10-10", 13000), // 3 in a row
      // 11 Oct missing
      row("2026-10-12", 10500),
      row("2026-10-13", 4000),
      row("2026-10-14", 10000),
      row("2026-10-15", 10001),
      row("2026-10-16", 15000), // current streak 3
    ];
    const h = buildActivityHistory(rows, TODAY);
    expect(h.allTime.daysOver10k).toBe(7);
    expect(h.allTime.longest10kStreak).toBe(3);
    expect(h.allTime.current10kStreak).toBe(3);
  });

  it("no current streak when yesterday has not arrived", () => {
    const h = buildActivityHistory([row("2026-10-15", 12000)], TODAY);
    expect(h.allTime.current10kStreak).toBe(0);
    expect(h.allTime.longest10kStreak).toBe(1);
  });

  it("averages steps by weekday, Monday first", () => {
    const h = buildActivityHistory(
      [row("2026-10-12", 4000), row("2026-10-05", 6000), row("2026-10-11", 12000)],
      TODAY
    );
    expect(h.allTime.weekdaySteps[0]).toBe(5000); // two Mondays
    expect(h.allTime.weekdaySteps[6]).toBe(12000); // Sunday
    expect(h.allTime.weekdaySteps[2]).toBeNull();
  });

  it("says where the days came from", () => {
    const h = buildActivityHistory(
      [row("2026-10-15", 5000, { origin: "app" }), row("2026-10-16", 6000, { origin: "shortcut" })],
      TODAY
    );
    expect(h.origins).toEqual({ shortcut: 1, app: 1 });
  });

  it("an empty history is well-formed", () => {
    const h = buildActivityHistory([], TODAY);
    expect(h.firstDate).toBeNull();
    expect(h.years).toEqual([]);
    expect(h.allTime.total.steps).toBeNull();
    expect(h.allTime.bestDay.steps).toBeNull();
    expect(h.days).toHaveLength(30);
  });
});
