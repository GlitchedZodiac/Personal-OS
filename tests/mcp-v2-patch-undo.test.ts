import { beforeEach, describe, expect, it, vi } from "vitest";

// MCP v2 Phase A (2026-11-12): patch_record, record_changes, undo_change, and
// corrections surviving a watch re-send.

type Row = Record<string, unknown> & { id: string };
const tables: Record<string, Row[]> = {};
let seq = 0;

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  const match = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(row[k]);
      return row[k] === v;
    });
  return {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows().find((r) => match(r, where)) ?? null),
    findMany: vi.fn(async ({ where = {} }: { where?: Record<string, unknown> } = {}) => rows().filter((r) => match(r, where))),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows().find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, JSON.parse(JSON.stringify(data, (_k, v) => (v && typeof v === "object" && v.constructor && v.constructor !== Object && !Array.isArray(v) && !(v instanceof Date) ? null : v))));
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows().filter((r) => match(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const d of data) {
        const clean = JSON.parse(JSON.stringify(d, (_k, v) => (v && typeof v === "object" && v.constructor && v.constructor !== Object && !Array.isArray(v) && !(v instanceof Date) ? null : v)));
        rows().push({ id: `chg-${++seq}`, createdAt: new Date(Date.now() + seq), undoneAt: null, ...clean });
      }
      return { count: data.length };
    }),
    upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => {
      const r = rows()[0];
      if (r) Object.assign(r, update);
      else rows().push({ id: "default", ...update });
      return rows()[0];
    }),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => (target[prop] ??= model(prop)),
  }),
}));
vi.mock("@/lib/prs", () => ({
  rebuildPersonalRecords: vi.fn(async () => null),
  detectAndRecordPRs: vi.fn(async () => []),
  sessionVolumeKg: () => 0,
}));

import { patchRecord, checkValue, WRITE_SPECS } from "@/lib/patch-record";
import { undoChanges, sameValue } from "@/lib/record-changes";
import { mergeResync, protectedColumns } from "@/lib/workout-resync";
import { V2_TOOLS } from "@/lib/mcp/tools-v2";

const walk = (): Row => ({
  id: "w1",
  workoutType: "walk",
  startedAt: new Date("2026-11-11T22:00:00Z"),
  durationMinutes: 38,
  distanceMeters: 2493,
  stepCount: 2855,
  caloriesBurned: 180,
  description: null,
  exercises: null,
  metricsData: { avgCadenceSpm: 111, hrStream: [100, 101] },
});

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.workoutLog = [walk()];
  tables.foodLog = [{ id: "f1", loggedAt: new Date("2026-11-11T18:00:00Z"), mealType: "lunch", foodDescription: "Rice", calories: 260, proteinG: 5, carbsG: 56, fatG: 1, notes: null }];
  tables.sequence = [{ id: "seq-1", name: "Lebe Stark 35-min" }];
  tables.recordChange = [];
});

describe("patch_record", () => {
  it("corrects a treadmill walk and remembers what it was", async () => {
    const out = await patchRecord({
      entity: "workout",
      id: "w1",
      set: { distanceMeters: 3600, stepCount: 4200, workoutType: "treadmill_walk" },
      reason: "Watch undercounted on the treadmill",
    });
    if ("error" in out) throw new Error(out.error);
    expect(out.changes).toEqual([
      { field: "distanceMeters", before: 2493, after: 3600 },
      { field: "stepCount", before: 2855, after: 4200 },
      { field: "workoutType", before: "walk", after: "treadmill_walk" },
    ]);
    const row = tables.workoutLog[0];
    expect(row.distanceMeters).toBe(3600);
    const corrected = (row.metricsData as { correctedFields: Record<string, string> }).correctedFields;
    expect(Object.keys(corrected).sort()).toEqual(["distanceMeters", "stepCount", "workoutType"]);
    expect(tables.recordChange).toHaveLength(3);
    expect(tables.recordChange[0]).toMatchObject({ entity: "workout", recordId: "w1", reason: "Watch undercounted on the treadmill", via: "mcp", batchId: out.batchId });
  });

  it("a dry run writes nothing", async () => {
    const out = await patchRecord({ entity: "workout", id: "w1", set: { stepCount: 4200 }, reason: "check", dryRun: true });
    expect("changes" in out && out.changes).toHaveLength(1);
    expect(tables.workoutLog[0].stepCount).toBe(2855);
    expect(tables.recordChange).toHaveLength(0);
  });

  it("refuses fields it does not own and values out of range", async () => {
    expect(await patchRecord({ entity: "workout", id: "w1", set: { externalId: "x" }, reason: "r" })).toHaveProperty("error");
    expect(await patchRecord({ entity: "workout", id: "w1", set: { metricsData: {} }, reason: "r" })).toHaveProperty("error");
    expect(await patchRecord({ entity: "workout", id: "w1", set: { stepCount: -5 }, reason: "r" })).toHaveProperty("error");
    expect(await patchRecord({ entity: "food", id: "f1", set: { calories: null }, reason: "r" })).toHaveProperty("error");
    expect(await patchRecord({ entity: "finance" as never, id: "f1", set: {}, reason: "r" })).toHaveProperty("error");
    expect(await patchRecord({ entity: "workout", id: "nope", set: { stepCount: 1 }, reason: "r" })).toHaveProperty("error");
    // A strength session has no distance unless the type changes with it.
    tables.workoutLog[0].workoutType = "strength";
    expect(await patchRecord({ entity: "workout", id: "w1", set: { distanceMeters: 100 }, reason: "r" })).toHaveProperty("error");
  });

  it("names a watch session after a saved routine", async () => {
    const out = await patchRecord({ entity: "workout", id: "w1", set: { routineId: "seq-1", description: "Lebe Stark 35-min" }, reason: "It was the video" });
    expect("changes" in out && out.changes.map((c) => c.field)).toEqual(["routineId", "description"]);
    expect(tables.workoutLog[0].metricsData).toMatchObject({ sequenceId: "seq-1", sequenceName: "Lebe Stark 35-min" });
    expect(await patchRecord({ entity: "workout", id: "w1", set: { routineId: "nope" }, reason: "r" })).toHaveProperty("error");
  });

  it("fixes a jump-rope EMOM stored as one continuous set", async () => {
    tables.workoutLog = [
      {
        id: "r1",
        workoutType: "jump_rope",
        durationMinutes: 11,
        exercises: [{ name: "Jump Rope", exercise: "jump-rope", sets: 1, seconds: 652 }],
        metricsData: { intervals: { mode: "continuous", roundsCompleted: 1, jumpSeconds: 652, restSecondsTotal: 8, source: "measured" } },
      },
    ];
    const out = await patchRecord({ entity: "workout", id: "r1", rope: { workSeconds: 60, restSeconds: 60, rounds: 5 }, reason: "It was a 5-round EMOM" });
    if ("error" in out) throw new Error(out.error);
    expect(out.changes.map((c) => c.field)).toEqual(["rope", "exercises"]);
    const row = tables.workoutLog[0];
    expect(row.exercises).toEqual([{ name: "Jump Rope", exercise: "jump-rope", sets: 5, seconds: 60 }]);
    expect(row.metricsData).toMatchObject({
      intervals: { mode: "interval", workSeconds: 60, restSeconds: 60, roundsCompleted: 5, jumpSeconds: 300, source: "declared" },
    });
    expect((row.metricsData as Record<string, unknown>).exercisesEditedAt).toBeTruthy();
    expect(out.rebuilt).toEqual(["personal_records"]);
  });

  it("checks values by rule", () => {
    expect(checkValue("x", WRITE_SPECS.workout.fields.stepCount, "4200")).toEqual({ value: 4200 });
    expect(checkValue("x", WRITE_SPECS.workout.fields.workoutType, "Treadmill Walk")).toHaveProperty("error");
    expect(checkValue("x", WRITE_SPECS.food.fields.mealType, "brunch")).toHaveProperty("error");
    expect(checkValue("x", { type: "datetime" }, "2099-01-01T00:00:00Z")).toHaveProperty("error");
  });
});

describe("undo_change", () => {
  it("restores a whole batch and records the undo", async () => {
    const out = await patchRecord({ entity: "workout", id: "w1", set: { stepCount: 4200, distanceMeters: 3600 }, reason: "fix" });
    const batchId = "batchId" in out ? out.batchId! : "";
    const undone = await undoChanges({ batchId });
    if ("error" in undone) throw new Error(undone.error);
    expect(undone.restored.map((r) => r.field).sort()).toEqual(["distanceMeters", "stepCount"]);
    expect(tables.workoutLog[0].stepCount).toBe(2855);
    expect(tables.workoutLog[0].distanceMeters).toBe(2493);
    // The fields go back to the watch.
    expect((tables.workoutLog[0].metricsData as { correctedFields: object }).correctedFields).toEqual({});
    expect(tables.recordChange.filter((r) => r.via === "undo")).toHaveLength(2);
    expect(tables.recordChange.filter((r) => r.batchId === batchId).every((r) => r.undoneAt)).toBe(true);
    const twice = await undoChanges({ batchId });
    expect("restored" in twice && twice.restored).toHaveLength(0);
  });

  it("leaves a field alone that changed again since", async () => {
    const out = await patchRecord({ entity: "food", id: "f1", set: { calories: 300 }, reason: "fix" });
    tables.foodLog[0].calories = 320; // edited again in the app
    const undone = await undoChanges({ batchId: "batchId" in out ? out.batchId! : "" });
    expect("skipped" in undone && undone.skipped[0].why).toContain("changed again");
    expect(tables.foodLog[0].calories).toBe(320);
  });

  it("undoes settings key by key", async () => {
    tables.userSettings = [{ id: "default", data: { calorieTarget: 2200, proteinPct: 30, carbsPct: 40, fatPct: 30 } }];
    const tool = V2_TOOLS.find((t) => t.def.name === "update_settings")!;
    const out = (await tool.handler({ patch: { targets: { rest: { kcal: 2000, proteinG: 160, fatG: 65, carbsG: 205 } } }, reason: "new" })) as { batchId: string };
    expect((tables.userSettings[0].data as Record<string, unknown>).calorieTarget).toBe(2000);
    const undo = V2_TOOLS.find((t) => t.def.name === "undo_change")!;
    await undo.handler({ batchId: out.batchId });
    const data = tables.userSettings[0].data as Record<string, unknown>;
    expect(data.calorieTarget).toBe(2200);
    expect(data.targets).toBeUndefined();
  });

  it("needs something to undo", async () => {
    expect(await undoChanges({})).toHaveProperty("error");
    expect(await undoChanges({ batchId: "missing" })).toHaveProperty("error");
  });
});

describe("corrections survive a watch re-send", () => {
  it("protected columns and metrics are carried over", () => {
    const before = {
      correctedFields: { distanceMeters: "2026-11-12T10:00:00Z", routineId: "2026-11-12T10:00:00Z", description: "2026-11-12T10:00:00Z" },
      sequenceId: "seq-1",
      sequenceName: "Lebe Stark 35-min",
    };
    const merged = mergeResync(
      { exercises: null, metricsData: before, description: "Lebe Stark 35-min" },
      { exercises: null, metricsData: { hrStream: [1, 2, 3] }, description: "Walk" }
    );
    expect(merged.protectedColumns).toEqual(["description", "distanceMeters"]);
    expect(merged.metricsData).toMatchObject({ hrStream: [1, 2, 3], sequenceId: "seq-1", correctedFields: before.correctedFields });
    expect(merged.description).toBe("Lebe Stark 35-min");
    expect(protectedColumns({})).toEqual([]);
  });

  it("an uncorrected row behaves exactly as before", () => {
    const merged = mergeResync(
      { exercises: null, metricsData: { a: 1 }, description: null },
      { exercises: null, metricsData: { hrStream: [1] }, description: null }
    );
    expect(merged.protectedColumns).toEqual([]);
    expect(merged.metricsData).toEqual({ hrStream: [1] });
  });
});

describe("sameValue", () => {
  it("ignores key order and treats undefined as null", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(1, "1")).toBe(false);
  });
});
