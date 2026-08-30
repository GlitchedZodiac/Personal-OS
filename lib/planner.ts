// The dynamic training week (2026-08-28): day-level plans he dictates in
// words ("this week: Armor Builder, a back day, Thursday climb Tres Cruces").
// One brain shared by /api/health/planner, the chat's plan_training confirm,
// the morning nudge cron, and the auto-complete hooks on both workout writers.

import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getWeekStartDateString,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";

export interface PlannedDayInput {
  date: string; // YYYY-MM-DD
  title: string;
  notes?: string | null;
  routineName?: string | null;
  trailName?: string | null;
  targetWeightKg?: number | null;
  /** Timed sub-reminders — become real Reminder rows the push cron delivers. */
  reminders?: Array<{ atLocal: string; title: string }> | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDay(value: unknown): string | null {
  return typeof value === "string" && DAY_RE.test(value) ? value : null;
}

/** Case-insensitive routine lookup: exact name first, then containment. */
async function resolveSequenceId(name: string): Promise<string | null> {
  const rows = await prisma.sequence.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const exact = rows.find((r) => r.name.trim().toLowerCase() === n);
  if (exact) return exact.id;
  const contains = rows.find(
    (r) =>
      r.name.toLowerCase().includes(n) || n.includes(r.name.trim().toLowerCase())
  );
  return contains?.id ?? null;
}

async function resolveTrailId(name: string): Promise<string | null> {
  const rows = await prisma.trail.findMany({
    select: { id: true, name: true, aliases: true },
  });
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const match = rows.find(
    (r) =>
      r.name.trim().toLowerCase() === n ||
      r.aliases.some((a) => a.trim().toLowerCase() === n) ||
      r.name.toLowerCase().includes(n)
  );
  return match?.id ?? null;
}

export async function planWeek(input: {
  days: PlannedDayInput[];
  replaceWeek?: boolean;
  timeZone: string;
}): Promise<{ created: number; remindersCreated: number; weekDates: string[] }> {
  const days = input.days.filter((d) => cleanDay(d.date) && d.title?.trim());
  if (days.length === 0) return { created: 0, remindersCreated: 0, weekDates: [] };

  const weekDates = [...new Set(days.map((d) => d.date))].sort();

  if (input.replaceWeek) {
    // Clear only still-planned rows across the touched weeks — done/skipped
    // days are history and survive a re-plan.
    const weekStarts = [
      ...new Set(weekDates.map((d) => getWeekStartDateString(d))),
    ];
    for (const start of weekStarts) {
      const end = addDaysToDateString(start, 6);
      await prisma.plannedWorkout.deleteMany({
        where: { status: "planned", localDate: { gte: start, lte: end } },
      });
    }
  }

  let created = 0;
  let remindersCreated = 0;
  for (const day of days) {
    const sequenceId = day.routineName
      ? await resolveSequenceId(day.routineName)
      : null;
    const trailId = day.trailName ? await resolveTrailId(day.trailName) : null;
    await prisma.plannedWorkout.create({
      data: {
        localDate: day.date,
        title: day.title.trim(),
        notes: day.notes?.trim() || null,
        sequenceId,
        trailId,
        targetWeightKg:
          typeof day.targetWeightKg === "number" && Number.isFinite(day.targetWeightKg)
            ? day.targetWeightKg
            : null,
        source: "chat",
      },
    });
    created++;

    for (const reminder of day.reminders ?? []) {
      const at = parseLocalStamp(reminder.atLocal, input.timeZone);
      if (!at || !reminder.title?.trim()) continue;
      await prisma.reminder.create({
        data: {
          title: reminder.title.trim(),
          body: day.title.trim(),
          remindAt: at,
          url: "/health/workouts",
        },
      });
      remindersCreated++;
    }
  }

  return { created, remindersCreated, weekDates };
}

/** "YYYY-MM-DD HH:mm" (his local wall clock) → UTC Date. */
export function parseLocalStamp(value: string, timeZone: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!m) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return zonedLocalDateTimeToUtc(m[1], timeZone, hour, minute, 0);
}

export async function getTrainingWeek(timeZone: string, weekStart?: string) {
  const start =
    cleanDay(weekStart) ?? getWeekStartDateString(getDateStringInTimeZone(new Date(), timeZone));
  const end = addDaysToDateString(start, 6);
  const plans = await prisma.plannedWorkout.findMany({
    where: { localDate: { gte: start, lte: end } },
    orderBy: [{ localDate: "asc" }, { createdAt: "asc" }],
  });
  const sequenceIds = [...new Set(plans.map((p) => p.sequenceId).filter(Boolean))] as string[];
  const trailIds = [...new Set(plans.map((p) => p.trailId).filter(Boolean))] as string[];
  const [sequences, trails] = await Promise.all([
    sequenceIds.length
      ? prisma.sequence.findMany({
          where: { id: { in: sequenceIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    trailIds.length
      ? prisma.trail.findMany({
          where: { id: { in: trailIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const seqName = new Map(sequences.map((s) => [s.id, s.name]));
  const trailName = new Map(trails.map((t) => [t.id, t.name]));
  return {
    weekStart: start,
    weekEnd: end,
    plans: plans.map((p) => ({
      id: p.id,
      localDate: p.localDate,
      title: p.title,
      notes: p.notes,
      sequenceId: p.sequenceId,
      sequenceName: p.sequenceId ? (seqName.get(p.sequenceId) ?? null) : null,
      trailId: p.trailId,
      trailName: p.trailId ? (trailName.get(p.trailId) ?? null) : null,
      targetWeightKg: p.targetWeightKg,
      status: p.status,
      source: p.source,
    })),
  };
}

export type TrainingWeek = Awaited<ReturnType<typeof getTrainingWeek>>;

/// A saved workout on a planned day marks that day's plan done. An exact
/// sequence match wins; otherwise the day's single un-sequenced plan counts.
export async function markPlannedDone(input: {
  startedAt: Date;
  timeZone: string;
  sequenceId?: string | null;
}): Promise<string | null> {
  const localDate = getDateStringInTimeZone(input.startedAt, input.timeZone);
  const plans = await prisma.plannedWorkout.findMany({
    where: { localDate, status: "planned" },
    orderBy: { createdAt: "asc" },
  });
  if (plans.length === 0) return null;
  const match =
    (input.sequenceId && plans.find((p) => p.sequenceId === input.sequenceId)) ||
    plans.find((p) => !p.sequenceId) ||
    (plans.length === 1 ? plans[0] : null);
  if (!match) return null;
  await prisma.plannedWorkout.update({
    where: { id: match.id },
    data: { status: "done" },
  });
  return match.id;
}
