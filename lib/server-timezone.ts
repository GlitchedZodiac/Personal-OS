import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

type SettingsData = Record<string, unknown>;

export async function getUserTimeZone(explicitTimeZone?: string | null) {
  if (explicitTimeZone) {
    return normalizeTimeZone(explicitTimeZone);
  }

  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });

    const data = (row?.data as SettingsData | null) ?? null;
    const candidate =
      (typeof data?.timeZone === "string" && data.timeZone) ||
      (typeof data?.timezone === "string" && data.timezone) ||
      null;

    return normalizeTimeZone(candidate);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
