// Double-submit guard for the NULL-externalId workout paths (2026-08-29).
// The watch and Strava carry idempotency keys; web/chat/voice/MCP rows
// don't — and a Confirm re-tap after a committed-but-unacknowledged POST,
// or an MCP transport retry, wrote a second identical row. The guard: a row
// of the same type, same duration, same content signature, started within
// ±120 s IS the same submit — return it instead of creating a twin.
// (The two Aug 12/14 prod pairs were the watch's PRE-fix race with distinct
// minted ids — repaired separately; this guard covers the paths that can
// still double-fire.)

import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";

const WINDOW_MS = 120_000;

function signature(input: {
  workoutType: string;
  durationMinutes: number;
  description?: string | null;
  exercises?: unknown;
}): string {
  return [
    input.workoutType,
    input.durationMinutes,
    Math.round(sessionVolumeKg(input.exercises ?? null)),
    (input.description ?? "").trim().slice(0, 60),
  ].join("|");
}

export async function findRecentDuplicate(input: {
  startedAt: Date;
  workoutType: string;
  durationMinutes: number;
  description?: string | null;
  exercises?: unknown;
}) {
  const nearby = await prisma.workoutLog.findMany({
    where: {
      startedAt: {
        gte: new Date(input.startedAt.getTime() - WINDOW_MS),
        lte: new Date(input.startedAt.getTime() + WINDOW_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  const sig = signature(input);
  return (
    nearby.find(
      (row) =>
        signature({
          workoutType: row.workoutType,
          durationMinutes: row.durationMinutes,
          description: row.description,
          exercises: row.exercises,
        }) === sig
    ) ?? null
  );
}
