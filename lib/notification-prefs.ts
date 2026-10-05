// Sender gates for push (2026-08-28). The standing rule from lib/push.ts
// holds for every sender: a notification is a REMINDER of something he chose,
// never a summons. Each sender checks its gate here, and /settings/
// notifications flips them. Defaults reflect his 2026-08-28 selection — all
// four training senders on, Spirit homework unchanged.
//
// 2026-10-04: two categories he asked for by name (weigh-in synced, system
// alerts), quiet hours, and the device's own timezone — which is what "local"
// means for quiet hours, so they follow him when he moves.

import { prisma } from "@/lib/prisma";
import { DEFAULT_QUIET_END, DEFAULT_QUIET_START, isValidClock } from "@/lib/quiet-hours";
import { isValidTimeZone } from "@/lib/timezone";

/** The on/off switches — one per kind of notification. */
export interface CategoryPrefs {
  spiritHomework: boolean;
  dueReminders: boolean;
  plannedWorkout: boolean;
  prCelebration: boolean;
  weeklyReport: boolean;
  /** "New weigh-in synced" with a one-line summary */
  weighIn: boolean;
  /** a data pipeline has been failing or silent for days */
  systemAlerts: boolean;
}

export interface NotificationPrefs extends CategoryPrefs {
  quietHoursEnabled: boolean;
  /** "HH:MM", in the device's timezone */
  quietStart: string;
  quietEnd: string;
  /**
   * Quiet hours hold what the APP decides to send. A reminder he set for a
   * specific time is a different thing — he picked that minute — so by
   * default it arrives on time. Off = even those wait for morning.
   */
  remindersBreakQuiet: boolean;
  /** IANA zone last reported by a device; null until one has */
  timeZone: string | null;
}

export const CATEGORY_KEYS = [
  "spiritHomework",
  "dueReminders",
  "plannedWorkout",
  "prCelebration",
  "weeklyReport",
  "weighIn",
  "systemAlerts",
] as const satisfies ReadonlyArray<keyof CategoryPrefs>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  spiritHomework: true,
  dueReminders: true,
  plannedWorkout: true,
  prCelebration: true,
  weeklyReport: true,
  weighIn: true,
  systemAlerts: true,
  quietHoursEnabled: true,
  quietStart: DEFAULT_QUIET_START,
  quietEnd: DEFAULT_QUIET_END,
  remindersBreakQuiet: true,
  timeZone: null,
};

const BOOLEAN_KEYS = [
  ...CATEGORY_KEYS,
  "quietHoursEnabled",
  "remindersBreakQuiet",
] as const satisfies ReadonlyArray<keyof NotificationPrefs>;

/** Keep only what is well-formed; anything else falls back to what was there. */
export function sanitizeNotificationPrefs(patch: unknown): Partial<NotificationPrefs> {
  const input = (patch ?? {}) as Record<string, unknown>;
  const out: Partial<NotificationPrefs> = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof input[key] === "boolean") out[key] = input[key] as boolean;
  }
  if (isValidClock(input.quietStart)) out.quietStart = input.quietStart;
  if (isValidClock(input.quietEnd)) out.quietEnd = input.quietEnd;
  if (typeof input.timeZone === "string" && isValidTimeZone(input.timeZone)) {
    out.timeZone = input.timeZone;
  }
  return out;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });
    const data = (row?.data ?? {}) as { notificationPrefs?: unknown };
    return { ...DEFAULT_NOTIFICATION_PREFS, ...sanitizeNotificationPrefs(data.notificationPrefs) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(patch: unknown): Promise<NotificationPrefs> {
  const row = await prisma.userSettings.findUnique({ where: { id: "default" } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  const merged = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...sanitizeNotificationPrefs(data.notificationPrefs),
    ...sanitizeNotificationPrefs(patch),
  };
  const nextData = { ...data, notificationPrefs: merged };
  await prisma.userSettings.upsert({
    where: { id: "default" },
    update: { data: nextData },
    create: { id: "default", data: nextData },
  });
  return merged;
}
