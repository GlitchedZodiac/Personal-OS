// The one door every notification goes through (2026-10-04).
//
// Before this, five senders each called sendPush() directly: nothing was
// recorded, nothing knew about quiet hours, and a reminder that came due
// while no device was subscribed was marked "fired" and lost. notify():
//
//   1. checks the category's switch (Settings → Notifications);
//   2. refuses to send the same real-world event twice (dedupeKey);
//   3. holds it if it is quiet hours, to be delivered when they end;
//   4. delivers to every registered device;
//   5. writes down what happened — sent, failed, held, or nowhere to send.
//
// Rules for what quiet hours mean, when a silent pipeline alerts, and how a
// weigh-in is summarised live in lib/quiet-hours.ts (pure, tested).
//
// TRANSPORT. Web Push (lib/push.ts) is the only live one. The iPhone
// companion is a WKWebView, which has no Push API at all — reaching it means
// APNs, a native-lane change (docs/push-notifications.md). Nothing here
// depends on which transport delivers: add one in deliver() and every
// category, the quiet hours and the log apply to it unchanged.

import { Prisma } from "@prisma/client";
import {
  type CategoryPrefs,
  type NotificationPrefs,
  getNotificationPrefs,
} from "@/lib/notification-prefs";
import { prisma } from "@/lib/prisma";
import { pushConfigured, sendPush } from "@/lib/push";
import { isQuiet, quietEndsAt, syncAlertFor } from "@/lib/quiet-hours";
import { getUserTimeZone } from "@/lib/server-timezone";

export type NotificationCategory =
  | "reminders"
  | "training"
  | "weighIn"
  | "systemAlerts"
  | "prCelebration"
  | "weeklyReport"
  | "spiritHomework"
  | "test";

/** Which switch governs each category. `test` has none — he just asked for it. */
const CATEGORY_GATE: Record<NotificationCategory, keyof CategoryPrefs | null> = {
  reminders: "dueReminders",
  training: "plannedWorkout",
  weighIn: "weighIn",
  systemAlerts: "systemAlerts",
  prCelebration: "prCelebration",
  weeklyReport: "weeklyReport",
  spiritHomework: "spiritHomework",
  test: null,
};

export type NotifyStatus =
  | "sent"
  | "failed"
  | "no_devices"
  | "local"
  | "held"
  | "muted"
  | "duplicate";

export interface NotifyInput {
  category: NotificationCategory;
  title: string;
  body: string;
  /** where tapping it lands */
  url?: string;
  /** same tag = the newer one replaces the older on the device */
  tag?: string;
  /** one real-world event → at most one notification, ever */
  dedupeKey?: string;
  /** deliver even inside quiet hours (a reminder he timed himself) */
  breaksQuiet?: boolean;
  /** the calling tab will show it itself if no device is subscribed */
  localFallback?: boolean;
  now?: Date;
}

export interface NotifyResult {
  status: NotifyStatus;
  id?: string;
  sent: number;
  failed: number;
}

/** A reminder this late is a backlog artifact, not a moment (kept from 2026-08-28). */
const REMINDER_FRESH_MS = 48 * 3_600_000;
/** A held notification that still has not gone out this long after quiet hours ended. */
const HELD_EXPIRES_MS = 12 * 3_600_000;
const LOG_KEEP_MS = 90 * 86_400_000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function quietContext(prefs: NotificationPrefs) {
  const timeZone = prefs.timeZone ?? (await getUserTimeZone(null));
  const window = {
    enabled: prefs.quietHoursEnabled,
    start: prefs.quietStart,
    end: prefs.quietEnd,
  };
  return { timeZone, window };
}

/** How many places a notification could go right now. */
export async function deviceCount(): Promise<number> {
  if (!pushConfigured()) return 0;
  return prisma.pushSubscription.count();
}

interface Delivery {
  status: "sent" | "failed" | "no_devices";
  sent: number;
  failed: number;
  pruned: number;
  error?: string;
}

async function deliver(payload: {
  title: string;
  body: string;
  url?: string | null;
  tag?: string | null;
}): Promise<Delivery> {
  if (!pushConfigured()) {
    return { status: "no_devices", sent: 0, failed: 0, pruned: 0, error: "push keys not configured" };
  }
  try {
    const result = await sendPush({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? undefined,
      tag: payload.tag ?? undefined,
    });
    const status =
      result.sent > 0 ? "sent" : result.failed > 0 ? "failed" : "no_devices";
    return { status, ...result };
  } catch (error) {
    return {
      status: "failed",
      sent: 0,
      failed: 1,
      pruned: 0,
      error: (error as Error)?.message?.slice(0, 200) ?? "send failed",
    };
  }
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const now = input.now ?? new Date();
  const prefs = await getNotificationPrefs();

  const gate = CATEGORY_GATE[input.category];
  if (gate && !prefs[gate]) return { status: "muted", sent: 0, failed: 0 };

  const { timeZone, window } = await quietContext(prefs);
  const hold =
    input.category !== "test" && !input.breaksQuiet && isQuiet(now, timeZone, window);

  // The row is written BEFORE anything is sent: its unique dedupeKey is the
  // claim, so two racing callers cannot both deliver the same event.
  let row: { id: string };
  try {
    row = await prisma.notificationLog.create({
      data: {
        category: input.category,
        title: input.title,
        body: input.body,
        url: input.url ?? null,
        tag: input.tag ?? null,
        dedupeKey: input.dedupeKey ?? null,
        status: hold ? "held" : "sending",
        deliverAfter: hold ? quietEndsAt(now, timeZone, window) : null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "duplicate", sent: 0, failed: 0 };
    throw error;
  }
  if (hold) return { status: "held", id: row.id, sent: 0, failed: 0 };

  const delivery = await deliver(input);
  const status: NotifyStatus =
    delivery.status === "no_devices" && input.localFallback ? "local" : delivery.status;
  await prisma.notificationLog.update({
    where: { id: row.id },
    data: {
      status,
      sentAt: status === "sent" || status === "local" ? new Date() : null,
      detail: {
        sent: delivery.sent,
        failed: delivery.failed,
        pruned: delivery.pruned,
        ...(delivery.error ? { error: delivery.error } : {}),
      },
    },
  });
  return { status, id: row.id, sent: delivery.sent, failed: delivery.failed };
}

/** Quiet hours are over: send what was held during them. */
export async function flushHeld(now: Date = new Date()): Promise<number> {
  const due = await prisma.notificationLog.findMany({
    where: { status: "held", deliverAfter: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  if (due.length === 0) return 0;

  const prefs = await getNotificationPrefs();
  const { timeZone, window } = await quietContext(prefs);

  let flushed = 0;
  for (const row of due) {
    const claimed = await prisma.notificationLog.updateMany({
      where: { id: row.id, status: "held" },
      data: { status: "sending" },
    });
    if (claimed.count === 0) continue; // another sweep got there first

    const finish = (status: string, detail?: object) =>
      prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status,
          ...(status === "sent" ? { sentAt: new Date() } : {}),
          ...(detail ? { detail } : {}),
        },
      });

    const gate = CATEGORY_GATE[row.category as NotificationCategory];
    if (gate && !prefs[gate]) {
      await finish("muted");
      continue;
    }
    if (row.deliverAfter && now.getTime() - row.deliverAfter.getTime() > HELD_EXPIRES_MS) {
      await finish("expired");
      continue;
    }
    // He moved the window while this was waiting: wait for the new one.
    if (isQuiet(now, timeZone, window)) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: "held", deliverAfter: quietEndsAt(now, timeZone, window) },
      });
      continue;
    }

    const delivery = await deliver(row);
    await finish(delivery.status, {
      sent: delivery.sent,
      failed: delivery.failed,
      pruned: delivery.pruned,
      heldUntil: row.deliverAfter?.toISOString(),
      ...(delivery.error ? { error: delivery.error } : {}),
    });
    if (delivery.status === "sent") flushed++;
  }
  return flushed;
}

export interface DueReminder {
  id: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Deliver every reminder that has come due.
 *
 * Claim-first: `fired` flips atomically before the send, so the cron, an
 * open app and a syncing watch can all call this at once and each reminder
 * still goes out exactly once.
 *
 * A reminder is NOT claimed while there is nowhere to deliver it. It used to
 * be: with zero subscribed devices the cron marked it fired, pushed it to
 * nobody, and it was gone. Now it waits — for a device to be subscribed, or
 * for an open app that can show it — until it is 48 h stale.
 */
export async function deliverDueReminders(opts: {
  now?: Date;
  /** the caller is an open app that can show a notification itself */
  canShowLocally?: boolean;
} = {}): Promise<{ due: number; delivered: number; waiting: number; expired: number; local: DueReminder[] }> {
  const now = opts.now ?? new Date();
  const out = { due: 0, delivered: 0, waiting: 0, expired: 0, local: [] as DueReminder[] };

  // Reminders first, settings second: an open app calls this every minute
  // and almost every call finds nothing due — that case is one indexed query.
  const due = await prisma.reminder.findMany({
    where: { fired: false, remindAt: { lte: now } },
    orderBy: { remindAt: "asc" },
    take: 20,
  });
  out.due = due.length;
  if (due.length === 0) return out;

  const prefs = await getNotificationPrefs();
  if (!prefs.dueReminders) return out;

  const devices = await deviceCount();

  for (const reminder of due) {
    const stale = now.getTime() - reminder.remindAt.getTime() > REMINDER_FRESH_MS;
    if (!stale && devices === 0 && !opts.canShowLocally) {
      out.waiting++;
      continue;
    }

    const claimed = await prisma.reminder.updateMany({
      where: { id: reminder.id, fired: false },
      data: { fired: true },
    });
    if (claimed.count === 0) continue;

    const body = reminder.body ?? reminder.title;
    const url = reminder.url || "/dashboard";
    const dedupeKey = `reminder:${reminder.id}`;

    if (stale) {
      await prisma.notificationLog
        .create({
          data: {
            category: "reminders",
            title: reminder.title,
            body,
            url,
            status: "expired",
            dedupeKey,
            detail: { dueAt: reminder.remindAt.toISOString() },
          },
        })
        .catch(() => {});
      out.expired++;
      continue;
    }

    const result = await notify({
      category: "reminders",
      title: reminder.title,
      body,
      url,
      tag: `reminder-${reminder.id}`,
      dedupeKey,
      breaksQuiet: prefs.remindersBreakQuiet,
      localFallback: opts.canShowLocally,
      now,
    });
    if (result.status === "sent" || result.status === "local") out.delivered++;
    // An open app without its own subscription shows it itself — unless it
    // is being held for the morning.
    if (opts.canShowLocally && result.status !== "held") {
      out.local.push({ id: reminder.id, title: reminder.title, body, url });
    }
  }
  return out;
}

// ————— Pipeline health → system alerts —————

/**
 * Called by a sync pipeline on every attempt. A success clears the failure
 * streak; the first failure after a success starts the clock the alert reads.
 */
export async function recordSync(
  source: string,
  result: { ok: boolean; label: string; heartbeat?: boolean; error?: string }
): Promise<void> {
  const now = new Date();
  try {
    if (result.ok) {
      await prisma.syncStatus.upsert({
        where: { source },
        create: {
          source,
          label: result.label,
          heartbeat: result.heartbeat ?? false,
          lastAttemptAt: now,
          lastSuccessAt: now,
        },
        update: {
          label: result.label,
          ...(result.heartbeat !== undefined ? { heartbeat: result.heartbeat } : {}),
          lastAttemptAt: now,
          lastSuccessAt: now,
          lastError: null,
          failingSince: null,
        },
      });
      return;
    }
    const error = (result.error ?? "unknown error").slice(0, 300);
    const existing = await prisma.syncStatus.findUnique({ where: { source } });
    await prisma.syncStatus.upsert({
      where: { source },
      create: {
        source,
        label: result.label,
        heartbeat: result.heartbeat ?? false,
        lastAttemptAt: now,
        lastError: error,
        failingSince: now,
      },
      update: {
        label: result.label,
        lastAttemptAt: now,
        lastError: error,
        failingSince: existing?.failingSince ?? now,
      },
    });
  } catch (error) {
    // Bookkeeping must never break the sync it is keeping books on.
    console.warn("recordSync failed:", (error as Error)?.message);
  }
}

export async function checkSyncHealth(now: Date = new Date()): Promise<number> {
  const states = await prisma.syncStatus.findMany();
  let raised = 0;
  for (const state of states) {
    const alert = syncAlertFor(state, now);
    if (!alert) continue;
    const result = await notify({
      category: "systemAlerts",
      title: alert.title,
      body: alert.body,
      url: "/settings/notifications",
      tag: `sync-${alert.source}`,
      dedupeKey: alert.dedupeKey,
      now,
    });
    if (result.status !== "duplicate" && result.status !== "muted") raised++;
  }
  return raised;
}

// ————— The sweep —————

export interface SweepResult {
  reminders: Awaited<ReturnType<typeof deliverDueReminders>>;
  flushed: number;
  alerts: number;
}

/**
 * Everything time-driven, in one pass: due reminders, notifications whose
 * quiet hours have ended, and (when `full`) the pipeline-health check.
 * Safe to call from anywhere, as often as anyone likes.
 */
export async function runNotificationSweep(opts: {
  now?: Date;
  canShowLocally?: boolean;
  /** also run the checks that only need to happen hourly */
  full?: boolean;
} = {}): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const reminders = await deliverDueReminders({ now, canShowLocally: opts.canShowLocally });
  const flushed = await flushHeld(now);
  let alerts = 0;
  if (opts.full) {
    alerts = await checkSyncHealth(now);
    // The log is a record, not an archive: ninety days is plenty to answer
    // "did that reminder go out?".
    await prisma.notificationLog
      .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LOG_KEEP_MS) } } })
      .catch(() => {});
  }
  return { reminders, flushed, alerts };
}

// Vercel's Hobby crons run once a day each, so the scheduled sweep is hourly
// at best (24 entries in vercel.json, each ±59 min). Everything that already
// talks to the server tightens that for free: an open app polls, and the
// watch and the phone companion check in around the clock. This lets any of
// them trigger a sweep, at most once a minute per warm instance.
let lastOpportunisticSweep = 0;

export function sweepSoon(): Promise<void> | void {
  const now = Date.now();
  if (now - lastOpportunisticSweep < 60_000) return;
  lastOpportunisticSweep = now;
  return runNotificationSweep()
    .then(() => undefined)
    .catch((error) => {
      console.warn("Opportunistic notification sweep failed:", (error as Error)?.message);
    });
}
