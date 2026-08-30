import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory prisma double for the trails brain: enough of trail +
// workoutLog for create-or-link and the list's run stats.

type TrailRow = {
  id: string;
  name: string;
  aliases: string[];
  distanceMeters: number | null;
  elevationGainM: number | null;
  summaryPolyline: string | null;
  startLat: number | null;
  startLng: number | null;
  updatedAt: Date;
};
type WorkoutRow = {
  id: string;
  externalId: string | null;
  trailId: string | null;
  startedAt: Date;
  createdAt: Date;
  durationMinutes: number;
  distanceMeters: number | null;
  elevationGainM: number | null;
  avgHeartRateBpm: number | null;
  routeData: unknown;
};

const trails: TrailRow[] = [];
const workouts: WorkoutRow[] = [];
let seq = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trail: {
      findMany: vi.fn(async () => [...trails]),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        trails.find((t) => t.id === where.id) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Partial<TrailRow> }) => {
        const row: TrailRow = {
          id: `t${++seq}`,
          name: data.name as string,
          aliases: (data.aliases as string[]) ?? [],
          distanceMeters: data.distanceMeters ?? null,
          elevationGainM: data.elevationGainM ?? null,
          summaryPolyline: data.summaryPolyline ?? null,
          startLat: data.startLat ?? null,
          startLng: data.startLng ?? null,
          updatedAt: new Date(),
        };
        trails.push(row);
        return row;
      }),
    },
    workoutLog: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        workouts.find((w) => w.id === where.id) ?? null
      ),
      findFirst: vi.fn(async ({ where }: { where: { externalId: string } }) =>
        workouts.find((w) => w.externalId === where.externalId) ?? null
      ),
      findMany: vi.fn(async () =>
        workouts
          .filter((w) => w.trailId != null)
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { trailId: string } }) => {
          const row = workouts.find((w) => w.id === where.id);
          if (!row) throw new Error("not found");
          Object.assign(row, data);
          return row;
        }
      ),
    },
  },
}));

import {
  createOrLinkTrail,
  haversineMeters,
  listTrails,
  trailMatchScore,
  trailNameMatches,
} from "@/lib/trails";

function addWorkout(input: Partial<WorkoutRow>): WorkoutRow {
  const row: WorkoutRow = {
    id: `w${++seq}`,
    externalId: null,
    trailId: null,
    startedAt: new Date("2026-08-27T18:00:00Z"),
    createdAt: new Date(),
    durationMinutes: 60,
    distanceMeters: 2300,
    elevationGainM: 390,
    avgHeartRateBpm: 149,
    routeData: {
      summaryPolyline: "poly",
      points: [
        { lat: 3.42, lng: -76.55, t: 0 },
        { lat: 3.43, lng: -76.56, t: 5 },
      ],
    },
    ...input,
  };
  workouts.push(row);
  return row;
}

beforeEach(() => {
  trails.length = 0;
  workouts.length = 0;
  seq = 0;
});

describe("trail matching", () => {
  it("matches name and aliases case-insensitively", () => {
    const trail = { name: "El Cerro de las Tres Cruces", aliases: ["tres cruces"] };
    expect(trailNameMatches(trail, "el cerro de las tres cruces")).toBe(true);
    expect(trailNameMatches(trail, "  Tres Cruces ")).toBe(true);
    expect(trailNameMatches(trail, "otro cerro")).toBe(false);
  });

  it("haversine is sane at city scale", () => {
    // ~111 m per 0.001° of latitude.
    const d = haversineMeters(3.42, -76.55, 3.421, -76.55);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it("scores nearby same-length trails and rejects far starts", () => {
    const trail = { startLat: 3.42, startLng: -76.55, distanceMeters: 2300 };
    const strong = trailMatchScore(trail, { lat: 3.4201, lng: -76.5501, distanceMeters: 2350 });
    expect(strong).not.toBeNull();
    expect(strong!).toBeGreaterThan(1);
    // Start 5+ km away: not the same trailhead.
    expect(trailMatchScore(trail, { lat: 3.47, lng: -76.55, distanceMeters: 2300 })).toBeNull();
    // No stored start: never suggested.
    expect(
      trailMatchScore({ startLat: null, startLng: null, distanceMeters: 2300 }, { lat: 3.42, lng: -76.55 })
    ).toBeNull();
  });
});

describe("createOrLinkTrail", () => {
  it("mints a trail seeded from the workout's recording and links it", async () => {
    const workout = addWorkout({ externalId: "ext-hike" });
    const result = await createOrLinkTrail({
      name: "El Cerro de las Tres Cruces",
      workoutExternalId: "ext-hike",
    });
    expect(result.created).toBe(true);
    expect(result.linked).toBe(true);
    expect(workout.trailId).toBe(result.trail.id);
    const stored = trails[0];
    expect(stored.startLat).toBe(3.42);
    expect(stored.distanceMeters).toBe(2300);
    expect(stored.summaryPolyline).toBe("poly");
  });

  it("the same name again links instead of duplicating", async () => {
    addWorkout({ externalId: "run-1" });
    const second = addWorkout({ externalId: "run-2", startedAt: new Date("2026-08-28T18:00:00Z") });
    await createOrLinkTrail({ name: "Tres Cruces", workoutExternalId: "run-1" });
    const result = await createOrLinkTrail({
      name: "  tres cruces ",
      workoutExternalId: "run-2",
    });
    expect(result.created).toBe(false);
    expect(trails).toHaveLength(1);
    expect(second.trailId).toBe(trails[0].id);
  });

  it("rejects a nameless request and an unknown workout", async () => {
    await expect(createOrLinkTrail({})).rejects.toThrow(/name/i);
    await expect(
      createOrLinkTrail({ name: "X", workoutExternalId: "missing" })
    ).rejects.toThrow(/workout/i);
  });
});

describe("listTrails", () => {
  it("carries run counts and the latest run, ranked by proximity when asked", async () => {
    const w1 = addWorkout({ externalId: "a" });
    const w2 = addWorkout({
      externalId: "b",
      startedAt: new Date("2026-08-28T18:00:00Z"),
      durationMinutes: 55,
    });
    await createOrLinkTrail({ name: "Tres Cruces", workoutExternalId: "a" });
    await createOrLinkTrail({ name: "Tres Cruces", workoutExternalId: "b" });
    const far = addWorkout({
      externalId: "c",
      routeData: { summaryPolyline: "p2", points: [{ lat: 4.7, lng: -74.05, t: 0 }] },
    });
    await createOrLinkTrail({ name: "Monserrate", workoutExternalId: "c" });
    void w1;
    void far;

    const ranked = await listTrails({ lat: 3.4201, lng: -76.5501, distanceMeters: 2300 });
    expect(ranked[0].name).toBe("Tres Cruces");
    expect(ranked[0].runCount).toBe(2);
    expect(ranked[0].lastRun?.workoutId).toBe(w2.id);
    expect(ranked[0].lastRun?.durationMinutes).toBe(55);
    expect(ranked[1].name).toBe("Monserrate");
  });
});
