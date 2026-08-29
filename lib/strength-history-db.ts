// DB half of strength-history (2026-08-29, speed round): the activity
// detail was fetching 400 rows of exercises JSON on EVERY strength view and
// the train page rebuilt histories per request. One bounded, strength-only
// query behind a 60 s module memo — single-user, so a process-wide memo is
// simply correct. Kept out of lib/strength-history.ts so that module stays
// pure (unit tests import it without a prisma client).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMovementHistories, type MovementHistory } from "@/lib/strength-history";

let memo: { at: number; map: Map<string, MovementHistory> } | null = null;
const TTL_MS = 60_000;

export async function getMovementHistoriesCached(): Promise<Map<string, MovementHistory>> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.map;
  const rows = await prisma.workoutLog.findMany({
    where: {
      exercises: { not: Prisma.DbNull },
      // Strava rows stuff a summary object into exercises — not movements.
      NOT: { externalSource: "strava" },
    },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: { id: true, startedAt: true, exercises: true },
  });
  const map = buildMovementHistories(rows);
  memo = { at: Date.now(), map };
  return map;
}

/// A write that changes movements (log/edit/delete) should drop the memo so
/// the next view reflects it immediately.
export function invalidateMovementHistories(): void {
  memo = null;
}
