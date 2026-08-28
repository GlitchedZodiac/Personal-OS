// Sender gates for web push (2026-08-28). The standing rule from lib/push.ts
// holds for every sender: a notification is a REMINDER of something he chose,
// never a summons. Each sender checks its gate here, and /settings/
// notifications flips them. Defaults reflect his 2026-08-28 selection — all
// four training senders on, Spirit homework unchanged.

import { prisma } from "@/lib/prisma";

export interface NotificationPrefs {
  spiritHomework: boolean;
  dueReminders: boolean;
  plannedWorkout: boolean;
  prCelebration: boolean;
  weeklyReport: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  spiritHomework: true,
  dueReminders: true,
  plannedWorkout: true,
  prCelebration: true,
  weeklyReport: true,
};

const PREF_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFS) as Array<
  keyof NotificationPrefs
>;

function sanitize(patch: Partial<NotificationPrefs>): Partial<NotificationPrefs> {
  const out: Partial<NotificationPrefs> = {};
  for (const key of PREF_KEYS) {
    if (typeof patch[key] === "boolean") out[key] = patch[key];
  }
  return out;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });
    const data = (row?.data ?? {}) as {
      notificationPrefs?: Partial<NotificationPrefs>;
    };
    return { ...DEFAULT_NOTIFICATION_PREFS, ...sanitize(data.notificationPrefs ?? {}) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const row = await prisma.userSettings.findUnique({ where: { id: "default" } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  const current = sanitize(
    (data.notificationPrefs as Partial<NotificationPrefs>) ?? {}
  );
  const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...current, ...sanitize(patch) };
  const nextData = { ...data, notificationPrefs: merged };
  await prisma.userSettings.upsert({
    where: { id: "default" },
    update: { data: nextData },
    create: { id: "default", data: nextData },
  });
  return merged;
}
