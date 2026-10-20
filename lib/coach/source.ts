// Loads one week's rows through a CoachSource (2026-10-17, lane B). The
// ranges are decided here, once, so the Prisma source and the fixture source
// are asked the same questions: the week and the week before it for anything
// compared week over week, four weeks for the weight trend, this week and
// next for the plan.

import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";
import { DEFAULT_FACTS_OPTIONS, type CoachSource, type DateRange, type FactsOptions, type WeekInput } from "./types";

/** The weight trend reads this many days ending on the week's Sunday. */
export const BODY_TREND_DAYS = 28;

function range(from: string, to: string, timeZone: string): DateRange {
  const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(from, to, timeZone);
  return { start: rangeStart, end: rangeEnd };
}

export interface LoadWeekOptions {
  /** Any day in the week; normalised to its Monday. */
  weekStart: string;
  timeZone: string;
  now?: Date;
  options?: Partial<FactsOptions>;
}

export async function loadWeekInput(source: CoachSource, opts: LoadWeekOptions): Promise<WeekInput> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone;
  const weekStart = getWeekStartDateString(opts.weekStart, 1);
  const weekEnd = addDaysToDateString(weekStart, 6);
  const prevStart = addDaysToDateString(weekStart, -7);
  const nextEnd = addDaysToDateString(weekStart, 13);
  const bodyFrom = addDaysToDateString(weekEnd, -(BODY_TREND_DAYS - 1));

  const twoWeeks = range(prevStart, weekEnd, timeZone);
  const week = range(weekStart, weekEnd, timeZone);
  // A week still running is read through "now"; a finished one through its Sunday.
  const cutoff = now < week.end ? now : week.end;

  const [
    settings,
    food,
    workouts,
    records,
    body,
    lastWeighInBefore,
    snapshots,
    activity,
    plans,
    sequences,
    trails,
    water,
    journal,
    progression,
  ] = await Promise.all([
    source.settings(),
    source.foodLogs(twoWeeks),
    source.workouts(twoWeeks),
    source.records(week),
    source.bodyMeasurements(range(bodyFrom, weekEnd, timeZone)),
    source.lastWeighInBefore(week.start),
    source.snapshots({ from: prevStart, to: weekEnd }),
    source.activityRows({ from: prevStart, to: weekEnd }),
    source.plannedWorkouts({ from: weekStart, to: nextEnd }),
    source.sequences(),
    source.trails(),
    source.waterLogs(week),
    source.journalEntries({ from: weekStart, to: weekEnd }),
    source.progression(),
  ]);

  // A trail run this week is compared with the trail's previous run, which
  // may be months back — asked for by trail, not by date window.
  const trailIds = [
    ...new Set(
      workouts
        .filter((w) => {
          if (!w.trailId) return false;
          const day = getDateStringInTimeZone(w.startedAt, timeZone);
          return day >= weekStart && day <= weekEnd;
        })
        .map((w) => w.trailId as string)
    ),
  ];
  const previousTrailRuns =
    trailIds.length > 0 ? await source.previousTrailRuns(trailIds, week.start) : [];

  return {
    weekStart,
    timeZone,
    now,
    cutoff,
    options: { ...DEFAULT_FACTS_OPTIONS, ...opts.options },
    settings,
    food,
    workouts,
    records,
    body,
    lastWeighInBefore,
    snapshots,
    activity,
    plans,
    sequences,
    trails,
    previousTrailRuns,
    water,
    journal,
    progression,
  };
}
