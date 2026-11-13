import { prisma } from "@/lib/prisma";

// Small security state that must be shared by every instance (audit 2026-10):
// the known-device marker generation. Its own user_settings row, like the
// connector's switch, so no read-modify-write of the shared blob can touch it.

const ROW_ID = "security";

async function read(): Promise<Record<string, unknown>> {
  const row = await prisma.userSettings.findUnique({ where: { id: ROW_ID }, select: { data: true } });
  return (row?.data as Record<string, unknown> | null) ?? {};
}

/** Markers carry this number; bumping it forgets every known device at once. */
export async function getMarkerGeneration(): Promise<number> {
  const g = (await read()).markerGeneration;
  return typeof g === "number" && Number.isInteger(g) ? g : 0;
}

export async function bumpMarkerGeneration(): Promise<number> {
  const next = (await getMarkerGeneration()) + 1;
  const data = { ...(await read()), markerGeneration: next };
  await prisma.userSettings.upsert({ where: { id: ROW_ID }, create: { id: ROW_ID, data }, update: { data } });
  return next;
}
