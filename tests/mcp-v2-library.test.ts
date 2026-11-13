import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MCP v2 Phase C (2026-11-12): the exercise library Claude curates — profiles
// that explain a movement, overlays on built-ins, merges, re-matching.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let seq = 0;
const clean = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v ?? null, (_k, x) =>
      x && typeof x === "object" && x.constructor && x.constructor !== Object && !Array.isArray(x) ? null : x
    )
  );
const keyOf = (where: Row) => (where.slug !== undefined ? ["slug", where.slug] : ["id", where.id]) as [string, unknown];

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  const find = (where: Row) => {
    const [k, v] = keyOf(where);
    return rows().find((r) => r[k] === v) ?? null;
  };
  return {
    findUnique: vi.fn(async ({ where }: { where: Row }) => find(where)),
    // Honours plain equality filters (batchId, id); richer ones are ignored.
    findMany: vi.fn(async ({ where = {} }: { where?: Row } = {}) =>
      rows().filter((r) =>
        Object.entries(where).every(([k, v]) => (v === null || typeof v !== "object" ? r[k] === v : true))
      )
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...clean(data) };
      rows().push(row);
      return row;
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) rows().push({ id: `chg-${++seq}`, createdAt: new Date(Date.now() + seq), undoneAt: null, ...clean(d) });
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = find(where);
      if (!row) throw new Error(`${name} not found`);
      Object.assign(row, clean(data));
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
      for (const r of rows()) if (where.id.in.includes(r.id as string)) Object.assign(r, data);
      return { count: 0 };
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const row = find(where);
      if (row) {
        Object.assign(row, clean(update));
        return row;
      }
      const fresh = { id: `${name}-${++seq}`, createdAt: new Date(Date.now() + seq), ...clean(create) };
      rows().push(fresh);
      return fresh;
    }),
    delete: vi.fn(async ({ where }: { where: Row }) => {
      const row = find(where);
      if (!row) throw new Error(`${name} not found`);
      tables[name] = rows().filter((r) => r !== row);
      return row;
    }),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => (target[prop] ??= model(prop)),
  }),
}));
const rebuild = vi.fn(async () => null);
vi.mock("@/lib/prs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prs")>()),
  rebuildPersonalRecords: () => rebuild(),
}));

import { validateProfile } from "@/lib/exercise-profile";
import {
  catalogExercises,
  getExerciseById,
  guessCategory,
  normalizeExerciseName,
  setCustomExercises,
} from "@/lib/exercises";
import { mapForLog, mergeExercises, remapExercises, renormalizeHistory, upsertExercise, listExercises, profileGaps } from "@/lib/exercise-library";
import { invalidateUserExercises } from "@/lib/user-exercises";
import { undoChanges } from "@/lib/record-changes";

const PROFILE = {
  description: "A kettlebell jerk driven from a front-squat thrust: dip, drive, punch the bell overhead and catch it locked out.",
  pattern: "push-vertical",
  primaryMuscles: ["front-delts", "quads", "triceps"],
  secondaryMuscles: ["glutes", "core", "triceps"],
  equipment: ["kettlebell"],
  unilateral: false,
  variantOf: "jerk",
  cues: ["Thrust from the legs", "Lock out overhead"],
  sourceUrl: "https://www.youtube.com/watch?v=example",
};

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.userExercise = [
    { id: "ue-1", slug: "jerk", name: "Jerk", category: "kettlebell", aliases: [], load: null, profile: null, createdAt: new Date(1) },
    { id: "ue-2", slug: "single-hand-swing", name: "Single-Hand Swing", category: "kettlebell", aliases: [], load: null, profile: null, createdAt: new Date(2) },
    { id: "ue-3", slug: "atomic-push-up", name: "Atomic Push Up", category: "kettlebell", aliases: [], load: null, profile: null, createdAt: new Date(3) },
  ];
  tables.workoutLog = [
    {
      id: "w1",
      startedAt: new Date("2026-11-09T17:00:00Z"),
      exercises: [
        { name: "Single-Hand Swing", exercise: "single-hand-swing", sets: 3, reps: 15, weightKg: 16 },
        { name: "Atomic Push Up", exercise: "atomic-push-up", sets: 4, reps: 5, weightKg: 24, implements: 2 },
      ],
      metricsData: null,
    },
    {
      id: "w2",
      startedAt: new Date("2026-11-07T17:00:00Z"),
      exercises: [{ name: "Bodyweight Squat", exercise: "back-squat", sets: 3, reps: 20 }],
      metricsData: null,
    },
  ];
  tables.sequence = [
    { id: "s1", name: "Swings", steps: [{ exercise: "single-hand-swing", exerciseName: "Single-Hand Swing", reps: 15 }] },
  ];
  tables.recordChange = [];
  invalidateUserExercises();
  rebuild.mockClear();
});
afterEach(() => setCustomExercises([]));

describe("validateProfile", () => {
  const exists = (id: string) => id === "jerk";
  it("accepts a full explanation and stamps it", () => {
    const r = validateProfile(PROFILE, { exists, selfId: "thrust-jerk", now: new Date("2026-11-12T00:00:00Z") });
    if ("error" in r) throw new Error(r.error);
    expect(r.profile.describedAt).toBe("2026-11-12T00:00:00.000Z");
    // A muscle can't be both primary and secondary.
    expect(r.profile.secondaryMuscles).toEqual(["glutes", "core"]);
  });
  it.each<[string, Record<string, unknown>]>([
    ["too short", { description: "Jerk" }],
    ["bad pattern", { pattern: "jumping" }],
    ["unknown muscle", { primaryMuscles: ["biceps-femoris"] }],
    ["no equipment", { equipment: [] }],
    ["not https", { sourceUrl: "http://example.com" }],
    ["variant of nothing", { variantOf: "nope" }],
    ["too many cues", { cues: ["a", "b", "c", "d", "e", "f"] }],
  ])("refuses %s", (_label, over) => {
    expect(validateProfile({ ...PROFILE, ...over }, { exists, selfId: "thrust-jerk" })).toHaveProperty("error");
  });
  it("a movement can't be a variant of itself", () => {
    expect(validateProfile(PROFILE, { exists, selfId: "jerk" })).toHaveProperty("error");
  });
});

describe("built-in overlays", () => {
  it("add aliases, load and a profile without making a second movement", () => {
    setCustomExercises([
      { id: "kb-swing", name: "Kettlebell Swing", category: "kettlebell", aliases: ["hardstyle swing"], load: "external" },
    ]);
    const swing = getExerciseById("kb-swing")!;
    expect(swing.aliases).toContain("hardstyle swing");
    expect(swing.isCustom).toBeUndefined();
    expect(normalizeExerciseName("hardstyle swing")?.id).toBe("kb-swing");
    expect(catalogExercises().filter((e) => e.id === "kb-swing")).toHaveLength(1);
  });
  it("guess a new movement's category from its name", () => {
    expect(guessCategory("Seated Dumbbell Shoulder Press")).toBe("dumbbell");
    expect(guessCategory("Bodyweight Squat")).toBe("bodyweight");
    expect(guessCategory("Thrust Jerk")).toBe("other");
  });
});

describe("mapForLog", () => {
  it("says exactly what each name became, and mints the unknown with needsProfile", async () => {
    const known = await mapForLog("Kettlebell Swing");
    expect(known.mapped).toMatchObject({ how: "exact", to: { id: "kb-swing" } });
    expect(known.mapped.needsProfile).toBeUndefined();
    const custom = await mapForLog("Jerk");
    expect(custom.mapped).toMatchObject({ how: "exact", to: { id: "jerk" }, needsProfile: true });
    const fresh = await mapForLog("Seated Dumbbell Shoulder Press");
    expect(fresh.mapped).toMatchObject({ how: "minted", to: { id: "seated-dumbbell-shoulder-press", category: "dumbbell" }, needsProfile: true });
    expect(tables.userExercise.some((r) => r.slug === "seated-dumbbell-shoulder-press")).toBe(true);
  });
});

describe("upsert_exercise", () => {
  it("explains a new movement and records it", async () => {
    const out = (await upsertExercise({ name: "Thrust Jerk", category: "kettlebell", profile: PROFILE, reason: "New in the Lebe Stark video" })) as Record<string, unknown>;
    expect(out.created).toBe(true);
    expect((out.exercise as { profile: { variantOf: string } }).profile.variantOf).toBe("jerk");
    expect(out.needsProfile).toBeUndefined();
    expect(tables.recordChange.map((c) => c.field)).toEqual(expect.arrayContaining(["_row", "profile"]));
  });

  it("marks handle-bell push-ups as bodyweight and rebuilds PRs", async () => {
    const out = (await upsertExercise({ id: "atomic-push-up", load: "bodyweight", reason: "Bells are handles" })) as Record<string, unknown>;
    expect(out.changes).toEqual([{ field: "load", before: null, after: "bodyweight" }]);
    expect(out.rebuilt).toEqual(["personal_records"]);
    expect(getExerciseById("atomic-push-up")?.load).toBe("bodyweight");
  });

  it("adds an alias to a built-in, refusing one that already means another movement", async () => {
    const ok = (await upsertExercise({ id: "kb-one-arm-swing", aliases: { add: ["suitcase swing"] }, reason: "His word for it" })) as Record<string, unknown>;
    expect((ok.exercise as { aliases: string[] }).aliases).toContain("suitcase swing");
    expect(tables.userExercise.find((r) => r.slug === "kb-one-arm-swing")).toBeTruthy();
    const clash = await upsertExercise({ id: "kb-one-arm-swing", aliases: { add: ["Jerk"] }, reason: "x" });
    expect(clash).toHaveProperty("error");
    expect(await upsertExercise({ id: "kb-swing", name: "Swingy", reason: "x" })).toHaveProperty("error");
    expect(await upsertExercise({ id: "kb-swing", category: "dumbbell", reason: "x" })).toHaveProperty("error");
  });

  it("renames a custom movement and keeps the old name resolving", async () => {
    // "One-Hand Swing" is already the built-in one-arm swing's alias — refused.
    expect(await upsertExercise({ id: "single-hand-swing", name: "One-Hand Swing", reason: "x" })).toHaveProperty("error");
    await upsertExercise({ id: "single-hand-swing", name: "Hand-Switch Swing", reason: "His name for it" });
    expect(getExerciseById("single-hand-swing")?.name).toBe("Hand-Switch Swing");
    expect(normalizeExerciseName("Single-Hand Swing")?.id).toBe("single-hand-swing");
  });

  it("undoes as one batch", async () => {
    const out = (await upsertExercise({ id: "jerk", load: "external", profile: { ...PROFILE, variantOf: undefined }, reason: "x" })) as { batchId: string };
    await undoChanges({ batchId: out.batchId });
    const row = tables.userExercise.find((r) => r.slug === "jerk")!;
    expect(row.load).toBeNull();
    expect(row.profile).toBeNull();
  });
});

describe("merge_exercises", () => {
  it("shows what would move, then moves history and routines and keeps the name resolving", async () => {
    const dry = (await mergeExercises({ from: "single-hand-swing", into: "kb-one-arm-swing", dryRun: true, reason: "dupe" })) as Record<string, unknown>;
    expect(dry).toMatchObject({ dryRun: true, workouts: [{ id: "w1", rows: 1 }], routines: [{ id: "s1", steps: 1 }] });
    expect(tables.recordChange).toHaveLength(0);

    const out = (await mergeExercises({ from: "single-hand-swing", into: "kb-one-arm-swing", reason: "dupe" })) as { batchId: string };
    const w1 = (tables.workoutLog[0].exercises as Row[])[0];
    expect(w1).toMatchObject({ exercise: "kb-one-arm-swing", name: "One-Arm Kettlebell Swing", rawName: "Single-Hand Swing" });
    expect((tables.sequence[0].steps as Row[])[0]).toEqual({ exercise: "kb-one-arm-swing", exerciseName: "One-Arm Kettlebell Swing", reps: 15 });
    expect(tables.userExercise.some((r) => r.slug === "single-hand-swing")).toBe(false);
    expect(normalizeExerciseName("Single-Hand Swing")?.id).toBe("kb-one-arm-swing");
    expect(rebuild).toHaveBeenCalled();

    const undone = await undoChanges({ batchId: out.batchId });
    expect(undone).toMatchObject({ skipped: [] });
    expect((tables.workoutLog[0].exercises as Row[])[0]).toMatchObject({ exercise: "single-hand-swing" });
    expect(tables.userExercise.some((r) => r.slug === "single-hand-swing")).toBe(true);
  });

  it("refuses built-ins and nonsense", async () => {
    expect(await mergeExercises({ from: "kb-swing", into: "jerk", reason: "x" })).toHaveProperty("error");
    expect(await mergeExercises({ from: "jerk", into: "jerk", reason: "x" })).toHaveProperty("error");
    expect(await mergeExercises({ from: "nope", into: "jerk", reason: "x" })).toHaveProperty("error");
  });

  it("rewrites a movement list but leaves other rows alone", () => {
    const into = getExerciseById("kb-one-arm-swing")!;
    const out = remapExercises([{ name: "Kettlebell Swing", exercise: "kb-swing" }, { name: "Single-Hand Swing", exercise: "single-hand-swing" }], "single-hand-swing", into);
    expect(out?.touched).toBe(1);
    expect(out?.list[0]).toEqual({ name: "Kettlebell Swing", exercise: "kb-swing" });
    expect(remapExercises([{ name: "x" }], "single-hand-swing", into)).toBeNull();
  });
});

describe("renormalize_history", () => {
  it("dry-runs by default and finds the old mismap", async () => {
    const out = (await renormalizeHistory({ reason: "new rules" })) as Record<string, unknown>;
    expect(out.dryRun).toBe(true);
    expect(out.proposals).toEqual([{ workoutId: "w2", date: "2026-11-07", name: "Bodyweight Squat", from: "back-squat", to: null }]);
    expect(out.unmatched).toEqual(["Bodyweight Squat"]);
    expect((tables.workoutLog[1].exercises as Row[])[0].exercise).toBe("back-squat");
  });

  it("applies when asked, skipping lists fixed by hand", async () => {
    tables.workoutLog[0].metricsData = { exercisesEditedAt: "2026-11-10T00:00:00Z" };
    const out = (await renormalizeHistory({ dryRun: false, reason: "new rules" })) as Record<string, unknown>;
    expect(out.workoutsChanged).toBe(1);
    expect((tables.workoutLog[1].exercises as Row[])[0].exercise).toBeUndefined();
  });
});

describe("reading the library", () => {
  it("lists movements with use counts and what's missing", async () => {
    const all = (await listExercises({})) as { exercises: Row[] };
    const atomic = all.exercises.find((e) => e.id === "atomic-push-up")!;
    expect(atomic).toMatchObject({ timesLogged: 1, profileMissing: true, builtin: false });
    const one = (await listExercises({ id: "jerk" })) as { exercises: Row[] };
    expect(one.exercises[0]).toHaveProperty("profile", null);
    const gaps = await profileGaps();
    expect(gaps.count).toBe(3);
  });
});
