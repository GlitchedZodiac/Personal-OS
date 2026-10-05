// "New weigh-in synced" — the hook every weigh-in source calls after it has
// stored new rows. Today that is the companion's Apple Health push; the
// RENPHO sync (separate work) calls the same function and gets the same
// notification, the same quiet hours, the same log line.
//
// It announces only what is news: the newest row of the batch, and only if
// it was measured in the last 36 hours. A backfill of two hundred historical
// weigh-ins says nothing.

import { notify } from "@/lib/notify";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { prisma } from "@/lib/prisma";
import { isFreshWeighIn, weighInSummary } from "@/lib/quiet-hours";
import { getUserTimeZone } from "@/lib/server-timezone";

export interface NewWeighIn {
  id: string;
  measuredAt: Date;
  weightKg: number | null;
  bodyFatPct?: number | null;
}

export async function announceWeighIn(
  created: readonly NewWeighIn[],
  now: Date = new Date()
): Promise<void> {
  try {
    const newest = [...created]
      .filter((row) => typeof row.weightKg === "number")
      .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())[0];
    if (!newest || newest.weightKg === null) return;
    if (!isFreshWeighIn(newest.measuredAt, now)) return;

    const [previous, settings, prefs] = await Promise.all([
      prisma.bodyMeasurement.findFirst({
        where: { measuredAt: { lt: newest.measuredAt }, weightKg: { not: null } },
        orderBy: { measuredAt: "desc" },
        select: { weightKg: true, measuredAt: true },
      }),
      prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
      getNotificationPrefs(),
    ]);
    const units =
      (settings?.data as { units?: string } | null)?.units === "imperial" ? "imperial" : "metric";
    const timeZone = prefs.timeZone ?? (await getUserTimeZone(null));

    await notify({
      category: "weighIn",
      title: "Weigh-in synced",
      body: weighInSummary({
        weightKg: newest.weightKg,
        bodyFatPct: newest.bodyFatPct,
        previousWeightKg: previous?.weightKg,
        previousAt: previous?.measuredAt,
        measuredAt: newest.measuredAt,
        units,
        timeZone,
      }),
      url: "/health/body",
      tag: "weigh-in",
      dedupeKey: `weighin:${newest.id}`,
      now,
    });
  } catch (error) {
    // A notification must never fail the sync that produced it.
    console.warn("Weigh-in announcement failed:", (error as Error)?.message);
  }
}
