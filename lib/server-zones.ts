// Server-side zone boundaries (2026-08-29): the bands stopped being a
// compile-time constant — Settings owns them now, with the same age-derived
// defaults. Same read pattern as lib/server-timezone.

import { prisma } from "@/lib/prisma";
import { DEFAULT_HR_ZONE_TOPS } from "@/lib/zones";

export async function getZoneTops(): Promise<number[]> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });
    const tops = (row?.data as { hrZoneTops?: unknown } | null)?.hrZoneTops;
    if (
      Array.isArray(tops) &&
      tops.length === 4 &&
      tops.every((t) => Number.isFinite(t) && t > 40 && t < 230) &&
      tops.every((t, i) => i === 0 || t > (tops[i - 1] as number))
    ) {
      return tops as number[];
    }
  } catch {
    // fall through to the defaults
  }
  return [...DEFAULT_HR_ZONE_TOPS];
}
