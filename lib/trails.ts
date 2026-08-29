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
  /// Direction awareness (2026-08-29): where the candidate track ENDED.
  /// A descent starts at the ascent's trailhead-adjacent summit lot and
  /// still passed the old start-only check — the end point disambiguates.
  endLat?: number | null;
  endLng?: number | null;
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
  endLat: number | null;
  endLng: number | null;
  runCount: number;
  lastRun: TrailLastRun | null;
  /// Round 3 §05 — present only on near-ranked queries ("94% match").
  matchPct: number | null;
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
/// within 300 m AND — when both end points are known — ENDS within 300 m of
/// the trail's end (direction-aware since 2026-08-29: the Tres Cruces
/// DESCENT began near the ascent trailhead and start-only matching linked
/// it, poisoning "vs your last run"). A similar total distance (±20%)
/// strengthens the match. Null = not a candidate.
export function trailMatchScore(
  trail: {
    startLat: number | null;
    startLng: number | null;
    endLat?: number | null;
    endLng?: number | null;
    distanceMeters: number | null;
  },
  near: TrailNear
): number | null {
  if (trail.startLat == null || trail.startLng == null) return null;
  const startGap = haversineMeters(trail.startLat, trail.startLng, near.lat, near.lng);
  if (startGap > 300) return null;
  if (
    trail.endLat != null &&
    trail.endLng != null &&
    near.endLat != null &&
    near.endLng != null
  ) {
    const endGap = haversineMeters(trail.endLat, trail.endLng, near.endLat, near.endLng);
    if (endGap > 300) return null;
  }
  let score = 1 - startGap / 300;
  if (near.distanceMeters && trail.distanceMeters) {
    const rel =
      Math.abs(near.distanceMeters - trail.distanceMeters) / trail.distanceMeters;
    if (rel <= 0.2) score += 1 - rel;
  }
  return score;
}

/// Does a linked run actually traverse the trail's direction? Used to keep
/// direction-mismatched links (descents, reversed out-and-backs) out of
/// lastRun/prevRun comparisons without unlinking history.
export function runMatchesTrailDirection(
  trail: { endLat?: number | null; endLng?: number | null },
  runEnd: { lat: number; lng: number } | null
): boolean {
  if (trail.endLat == null || trail.endLng == null || runEnd == null) return true;
  return haversineMeters(trail.endLat, trail.endLng, runEnd.lat, runEnd.lng) <= 300;
}

/// Cheap column-only direction proxy for comparison surfaces that don't
/// load routes: a climb trail's genuine run carries most of its gain; a
/// descent (positive-only barometric accumulation) carries almost none.
export function runProfileMatchesTrail(
  trailGainM: number | null | undefined,
  runGainM: number | null | undefined
): boolean {
  if (trailGainM == null || trailGainM < 100) return true;
  return (runGainM ?? 0) >= trailGainM * 0.25;
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

  const gainById = new Map(trails.map((t) => [t.id, t.elevationGainM]));
  const runCount = new Map<string, number>();
  const lastRun = new Map<string, TrailLastRun>();
  for (const w of linked) {
    if (!w.trailId) continue;
    runCount.set(w.trailId, (runCount.get(w.trailId) ?? 0) + 1);
    if (!lastRun.has(w.trailId) && runProfileMatchesTrail(gainById.get(w.trailId), w.elevationGainM)) {
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

  const payload: TrailPayload[] = trails.map((t) => ({
    id: t.id,
    name: t.name,
    aliases: t.aliases,
    distanceMeters: t.distanceMeters,
    elevationGainM: t.elevationGainM,
    summaryPolyline: t.summaryPolyline,
    startLat: t.startLat,
    startLng: t.startLng,
    endLat: t.endLat,
    endLng: t.endLng,
    runCount: runCount.get(t.id) ?? 0,
    lastRun: lastRun.get(t.id) ?? null,
    matchPct: null,
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
    // §05 "94% match": score spans ~0–2 → clamp to a 50–99% display band
    // (the wrist's local ranking uses the same formula).
    return scored.map((s) => ({
      ...s.t,
      matchPct:
        s.score != null
          ? Math.max(50, Math.min(99, Math.round((s.score / 2) * 100)))
          : null,
    }));
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
      const valid = (p: { lat?: number; lng?: number }) =>
        typeof p.lat === "number" && typeof p.lng === "number";
      const first = route?.points?.find(valid);
      // Direction awareness: the founding run's END becomes the trail's end.
      const last = route?.points ? [...route.points].reverse().find(valid) : undefined;
      const createdTrail = await prisma.trail.create({
        data: {
          name,
          distanceMeters: workout?.distanceMeters ?? null,
          elevationGainM: workout?.elevationGainM ?? null,
          summaryPolyline: route?.summaryPolyline ?? null,
          startLat: first?.lat ?? null,
          startLng: first?.lng ?? null,
          endLat: last?.lat ?? null,
          endLng: last?.lng ?? null,
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
