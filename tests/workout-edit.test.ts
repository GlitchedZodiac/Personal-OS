import { describe, expect, it } from "vitest";
import { applyEntryEdit, findEntryIndex } from "@/lib/workout-edit";

// The post-hoc single-line correction: "the windmills I just did were 8 kg,
// not 20" targets exactly one entry of a saved workout's exercises array.

const exercises = [
  { name: "Kettlebell Swing", sets: 3, reps: 20, weightKg: 20 },
  { name: "Kettlebell Windmill", sets: 3, reps: 5, weightKg: 20 },
  { name: "Goblet Squat", sets: 3, reps: 10, weightKg: 24 },
];

describe("findEntryIndex", () => {
  it("finds by catalog-normalized name — 'windmills' hits Kettlebell Windmill", () => {
    expect(findEntryIndex(exercises, { name: "windmills" })).toBe(1);
    expect(findEntryIndex(exercises, { name: "molino" })).toBe(1);
    expect(findEntryIndex(exercises, { name: "swings" })).toBe(0);
  });

  it("prefers a valid index over the name", () => {
    expect(findEntryIndex(exercises, { index: 2, name: "windmills" })).toBe(2);
    // out-of-range index falls back to name matching
    expect(findEntryIndex(exercises, { index: 9, name: "windmills" })).toBe(1);
  });

  it("falls back to folded-name equality for unknown movements", () => {
    const odd = [{ name: "Sandbag over shoulder", sets: 3, reps: 6 }];
    expect(findEntryIndex(odd, { name: "sandbag over shoulder" })).toBe(0);
  });

  it("returns -1 when nothing matches", () => {
    expect(findEntryIndex(exercises, { name: "bench press" })).toBe(-1);
    expect(findEntryIndex(exercises, {})).toBe(-1);
    expect(findEntryIndex(null, { name: "swings" })).toBe(-1);
  });
});

describe("applyEntryEdit", () => {
  it("changes only the named fields of the one entry", () => {
    const result = applyEntryEdit(exercises, 1, { weightKg: 8 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.exercises as typeof exercises;
    expect(rows[1].weightKg).toBe(8);
    expect(rows[1].reps).toBe(5); // untouched
    expect(rows[0].weightKg).toBe(20); // neighbors untouched
    expect(result.changed).toEqual(["weightKg"]);
    // the original array is not mutated
    expect(exercises[1].weightKg).toBe(20);
  });

  it("accepts multiple fields and string numbers", () => {
    const result = applyEntryEdit(exercises, 0, { reps: "25", weightKg: 24 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.exercises as typeof exercises;
    expect(rows[0].reps).toBe(25);
    expect(rows[0].weightKg).toBe(24);
  });

  it("rejects invalid values, empty sets, and bad indexes", () => {
    expect(applyEntryEdit(exercises, 1, { weightKg: -5 }).ok).toBe(false);
    expect(applyEntryEdit(exercises, 1, {}).ok).toBe(false);
    expect(applyEntryEdit(exercises, 7, { weightKg: 8 }).ok).toBe(false);
    expect(applyEntryEdit(null, 0, { weightKg: 8 }).ok).toBe(false);
  });
});
