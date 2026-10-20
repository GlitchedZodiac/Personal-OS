// Confirming a move, on the server (2026-10-20, lane B — review round 3,
// item 3). The card only previews; this is the one path that writes. It loads
// the STORED move (a client never says what to write — except the values of a
// measurement he types, validated here), refuses Test reviews, re-runs the
// action's validation and stillWritable() with HIS zone, is idempotent (a
// confirmed move returns its earlier result), writes through the existing lib
// paths and records the move — all in one transaction, under a row lock, so
// two taps never write twice.

import { INT_FIELDS, MEASURED_FIELDS, stampSources } from "@/lib/body-measurements";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { planWeek, type PlannedDayInput } from "@/lib/planner";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { zonedLocalDateTimeToUtc } from "@/lib/timezone";
import { stillWritable, validateAction } from "./checks";
import type { ConfirmedAction, ReviewJson, WeekFacts } from "./types";

/** Where a reminder's clock time is read (D21): the device's zone, else his settings'. */
export async function reminderZone(): Promise<string> {
  const prefs = await getNotificationPrefs();
  return prefs.timeZone ?? (await getUserTimeZone(null));
}

export interface ConfirmResult {
  status: number;
  body: Record<string, unknown>;
}

const MEASURED = new Set<string>(MEASURED_FIELDS as readonly string[]);
/** The settings defaults lib/health-coach.ts assumes when a key is missing. */
const TARGET_DEFAULTS = { calorieTarget: 2000, proteinPct: 30, carbsPct: 40, fatPct: 30 };

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function confirmMove(
  reviewId: string,
  index: number,
  input: { values?: unknown } = {},
  now: Date = new Date()
): Promise<ConfirmResult> {
  const [zone, timeZone] = await Promise.all([reminderZone(), getUserTimeZone(null)]);
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Two taps, one write: the second waits here, then finds the record.
        await tx.$queryRaw`SELECT id FROM coach_reviews WHERE id = ${reviewId} FOR UPDATE`;
        const row = await tx.coachReview.findUnique({ where: { id: reviewId } });
        if (!row) throw new Refusal(404, "Review not found");
        if (row.kind === "test") throw new Refusal(409, "A Test review takes no actions.");
        if (row.status !== "ready") throw new Refusal(409, "This review has no moves to confirm.");
        const move = (row.reviewJson as ReviewJson | null)?.moves?.[index];
        if (!move || move.removed || move.action.kind === "none") throw new Refusal(400, "No writable move at that index.");

        const actions = (Array.isArray(row.actionsJson) ? row.actionsJson : []) as unknown as ConfirmedAction[];
        const prior = actions.find((a) => a.index === index && !a.undoneAt);
        if (prior) return { status: 200, body: { actions, result: prior.result, duplicate: true } };

        // The stored move, validated again against the stored facts, then the clock.
        const validated = validateAction(move.action, row.factsJson as unknown as WeekFacts);
        if (validated.action.kind === "none") throw new Refusal(409, validated.note ?? "This move can no longer be written.");
        const action = validated.action;
        const writable = stillWritable(action, now, zone);
        if (!writable.ok) throw new Refusal(409, `Can't write this any more — ${writable.reason}.`);

        let payload: unknown = action;
        let result: Record<string, unknown>;
        switch (action.kind) {
          case "plan_week": {
            // No reminders, never replacing the week: exactly the days the card showed.
            const days: PlannedDayInput[] = action.days.map((d) => ({
              date: d.date,
              title: d.title,
              notes: d.notes ?? null,
              routineName: d.routineName ?? null,
              trailName: d.trailName ?? null,
              targetWeightKg: d.targetWeightKg ?? null,
            }));
            const planned = await planWeek({ days, replaceWeek: false, timeZone, source: "coach" }, tx);
            result = { created: planned.created, weekDates: planned.weekDates };
            break;
          }
          case "adjust_targets": {
            const settingsRow = await tx.userSettings.findUnique({ where: { id: "default" } });
            const data = (settingsRow?.data ?? {}) as Record<string, unknown>;
            const read = (key: keyof typeof TARGET_DEFAULTS) => (typeof data[key] === "number" ? (data[key] as number) : TARGET_DEFAULTS[key]);
            const before = { calorieTarget: read("calorieTarget"), proteinPct: read("proteinPct"), carbsPct: read("carbsPct"), fatPct: read("fatPct") };
            const after = {
              calorieTarget: action.calorieTarget ?? before.calorieTarget,
              proteinPct: action.proteinPct ?? before.proteinPct,
              carbsPct: action.carbsPct ?? before.carbsPct,
              fatPct: action.fatPct ?? before.fatPct,
            };
            const next = { ...data, ...after };
            await tx.userSettings.upsert({
              where: { id: "default" },
              update: { data: next as object },
              create: { id: "default", data: next as object },
            });
            result = { before, after };
            break;
          }
          case "set_reminder": {
            const [date, time] = action.atLocal.split("T");
            const [h, m] = time.split(":").map(Number);
            const remindAt = zonedLocalDateTimeToUtc(date, zone, h, m, 0);
            const reminder = await tx.reminder.create({
              data: { title: action.title, body: "From the Coach", remindAt, url: `/health/coach?review=${reviewId}` },
            });
            result = { reminderId: reminder.id, remindAt: remindAt.toISOString(), timeZone: zone, atLocal: action.atLocal };
            break;
          }
          case "log_measurement": {
            const raw = (input.values ?? {}) as Record<string, unknown>;
            const fields: Record<string, number> = {};
            for (const field of action.fields) {
              const v = Number(raw[field]);
              if (!MEASURED.has(field) || !Number.isFinite(v) || v <= 0 || v >= 10_000) {
                throw new Refusal(400, `Enter a value for every field (${field}).`);
              }
              fields[field] = INT_FIELDS.has(field) ? Math.round(v) : v;
            }
            const entry = await tx.bodyMeasurement.create({
              data: { measuredAt: now, ...fields, source: "manual", fieldSources: stampSources(fields, "manual") },
            });
            payload = { ...action, values: fields };
            result = { measurementId: entry.id, values: fields, measuredAt: now.toISOString() };
            break;
          }
        }

        const next: ConfirmedAction[] = [
          ...actions,
          { index, kind: action.kind, payload, result, confirmedAt: now.toISOString() },
        ];
        await tx.coachReview.update({ where: { id: reviewId }, data: { actionsJson: next as unknown as object } });
        return { status: 200, body: { actions: next, result } };
      },
      { timeout: 15_000, maxWait: 5_000 }
    );
  } catch (error) {
    if (error instanceof Refusal) return { status: error.status, body: { error: error.message } };
    throw error;
  }
}
