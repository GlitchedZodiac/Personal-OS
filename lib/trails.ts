// Named trails (2026-08-28): a Trail names ground he covers repeatedly —
// "el Cerro de las Tres Cruces" — and workouts link to it so a session can be
// compared with the last run of the SAME trail. One create-or-link brain
// shared by the wrist prompt (/api/mobile/trails), web management
// (/api/health/trails), and the chat's name_trail proposal.

import { prisma } from "@/lib/prisma";

export type TrailNear = {
  lat: number;
  lng: number;
  distanceMeters?: number | null;
};

export type TrailLastRun = {
  workoutId: string;
  workoutExternalId: string | null;
  startedAt: string;
  durationMinutes: number;
  distanceMeters: number | null;
  elevationGainM: number | null;
  avgHeartRateBpm: number | null;
};

export type TrailPayload = {
  id: string;
  name: string;
  aliases: string[];
  distanceMeters: number | null;
  elevationGainM: number | null;
  summaryPolyline: string | null;
  startLat: number | null;
  startLng: number | null;
  runCount: number;
  lastRun: TrailLastRun | null;
};

const norm = (value: string) => value.trim().toLowerCase();

export function trailNameMatches(
  trail: { name: string; aliases: string[] },
  name: string
): boolean {
  const n = norm(name);
  if (!n) return false;
  return norm(trail.name) === n || trail.aliases.some((a) => norm(a) === n);
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/// Suggestion score for "save this track?": a trail matches when it STARTS
/// within 300 m; a similar total distance (±20%) strengthens the match.
/// Null = not a candidate.
export function trailMatchScore(
  trail: {
    startLat: number | null;
    startLng: number | null;
    distanceMeters: number | null;
  },
  near: TrailNear
): number | null {
  if (trail.startLat == null || trail.startLng == null) return null;
  const startGap = haversineMeters(trail.startLat, trail.startLng, near.lat, near.lng);
  if (startGap > 300) return null;
  let score = 1 - startGap / 300;
  if (near.distanceMeters && trail.distanceMeters) {
    const rel =
      Math.abs(near.distanceMeters - trail.distanceMeters) / trail.distanceMeters;
    if (rel <= 0.2) score += 1 - rel;
  }
  return score;
}

type StoredRoute = {
  summaryPolyline?: string;
  points?: Array<{ lat?: number; lng?: number }>;
} | null;

export async function listTrails(near?: TrailNear): Promise<TrailPayload[]> {
  const [trails, linked] = await Promise.all([
    prisma.trail.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.workoutLog.findMany({
      where: { trailId: { not: null } },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        trailId: true,
        externalId: true,
        startedAt: true,
        durationMinutes: true,
        distanceMeters: true,
        elevationGainM: true,
        avgHeartRateBpm: true,
      },
    }),
  ]);

  const runCount = new Map<string, number>();
  const lastRun = new Map<string, TrailLastRun>();
  for (const w of linked) {
    if (!w.trailId) continue;
    runCount.set(w.trailId, (runCount.get(w.trailId) ?? 0) + 1);
    if (!lastRun.has(w.trailId)) {
      lastRun.set(w.trailId, {
        workoutId: w.id,
        workoutExternalId: w.externalId,
        startedAt: w.startedAt.toISOString(),
        durationMinutes: w.durationMinutes,
        distanceMeters: w.distanceMeters,
        elevationGainM: w.elevationGainM,
        avgHeartRateBpm: w.avgHeartRateBpm,
      });
    }
  }

  const payload = trails.map((t) => ({
    id: t.id,
    name: t.name,
    aliases: t.aliases,
    distanceMeters: t.distanceMeters,
    elevationGainM: t.elevationGainM,
    summaryPolyline: t.summaryPolyline,
    startLat: t.startLat,
    startLng: t.startLng,
    runCount: runCount.get(t.id) ?? 0,
    lastRun: lastRun.get(t.id) ?? null,
  }));

  if (near) {
    const scored = payload.map((t, index) => ({
      t,
      index,
      score: trailMatchScore(t, near),
    }));
    scored.sort((a, b) => {
      if (a.score != null && b.score != null) return b.score - a.score;
      if (a.score != null) return -1;
      if (b.score != null) return 1;
      return a.index - b.index;
    });
    return scored.map((s) => s.t);
  }
  return payload;
}

export class TrailInputError extends Error {}

/// The one brain: link a workout to an existing trail (by id or by
/// case-insensitive name/alias), or mint the trail from that workout's own
/// recording. Also usable name-only (no workout) for pre-creating a trail.
export async function createOrLinkTrail(input: {
  name?: string;
  trailId?: string;
  workoutId?: string;
  workoutExternalId?: string;
}): Promise<{ trail: { id: string; name: string }; created: boolean; linked: boolean }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!input.trailId && !name) {
    throw new TrailInputError("A trail name (or trailId) is required");
  }

  const workout = input.workoutId
    ? await prisma.workoutLog.findUnique({ where: { id: input.workoutId } })
    : input.workoutExternalId
      ? await prisma.workoutLog.findFirst({
          where: { externalId: input.workoutExternalId },
          orderBy: { createdAt: "desc" },
        })
      : null;
  if ((input.workoutId || input.workoutExternalId) && !workout) {
    throw new TrailInputError("Workout not found");
  }

  let trail: { id: string; name: string } | null = null;
  let created = false;

  if (input.trailId) {
    trail = await prisma.trail.findUnique({
      where: { id: input.trailId },
      select: { id: true, name: true },
    });
    if (!trail) throw new TrailInputError("Trail not found");
  } else {
    const all = await prisma.trail.findMany({
      select: { id: true, name: true, aliases: true },
    });
    trail = all.find((t) => trailNameMatches(t, name)) ?? null;
    if (!trail) {
      const route = (workout?.routeData ?? null) as StoredRoute;
      const first = route?.points?.find(
        (p) => typeof p.lat === "number" && typeof p.lng === "number"
      );
      const createdTrail = await prisma.trail.create({
        data: {
          name,
          distanceMeters: workout?.distanceMeters ?? null,
          elevationGainM: workout?.elevationGainM ?? null,
          summaryPolyline: route?.summaryPolyline ?? null,
          startLat: first?.lat ?? null,
          startLng: first?.lng ?? null,
        },
        select: { id: true, name: true },
      });
      trail = createdTrail;
      created = true;
    }
  }

  let linked = false;
  if (workout && workout.trailId !== trail.id) {
    await prisma.workoutLog.update({
      where: { id: workout.id },
      data: { trailId: trail.id },
    });
    linked = true;
  }

  return { trail, created, linked: linked || Boolean(workout) };
}
