import { describe, expect, it } from "vitest";
import { validateSequence } from "@/lib/sequences";

describe("validateSequence", () => {
  it("accepts a straight-sets routine and normalizes exercise names", () => {
    const result = validateSequence({
      name: "KB Block A",
      kind: "straight",
      steps: [
        { exerciseName: "two hand swings", sets: 5, reps: 10, weightKg: 24 },
        { exerciseName: "clean and press", sets: 5, reps: 5, weightKg: 28 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].exercise).toBe("kb-swing");
    expect(result.steps[0].exerciseName).toBe("Kettlebell Swing");
    expect(result.steps[0].sets).toBe(5);
    expect(result.steps[1].exercise).toBe("kb-clean-and-press");
  });

  it("accepts Spanish aliases through the catalog", () => {
    const result = validateSequence({
      name: "Bloque",
      kind: "circuit",
      steps: [{ exerciseName: "sentadilla goblet", reps: 8, weightKg: 24 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].exercise).toBe("kb-goblet-squat");
  });

  it("keeps free-form movements it does not recognize", () => {
    const result = validateSequence({
      name: "Odd lifts",
      kind: "straight",
      steps: [{ exerciseName: "Sandbag over shoulder", reps: 6 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].exercise).toBe("sandbag over shoulder");
    expect(result.steps[0].exerciseName).toBe("Sandbag over shoulder");
  });

  it("carries durationMinutes for EMOMs (Michael's 20-minute protocol)", () => {
    const result = validateSequence({
      name: "EMOM 20 — swings/squats/snatch",
      kind: "emom",
      durationMinutes: 20,
      steps: [
        { exerciseName: "kettlebell swings", reps: 20, weightKg: 24 },
        { exerciseName: "goblet squats", reps: 15, weightKg: 24 },
        { exerciseName: "Snatch (each side)", reps: 5, weightKg: 20 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.durationMinutes).toBe(20);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].exercise).toBe("kb-swing");
    expect(result.steps[1].exercise).toBe("kb-goblet-squat");
    // the per-side qualifier survives catalog normalization
    expect(result.steps[2].exercise).toBe("kb-snatch");
    expect(result.steps[2].exerciseName).toBe("Kettlebell Snatch (each side)");
  });

  it("rejects absurd durations and defaults absent ones to null", () => {
    expect(
      validateSequence({
        name: "X",
        kind: "emom",
        durationMinutes: 500,
        steps: [{ exerciseName: "swing", reps: 5 }],
      }).ok
    ).toBe(false);
    const noDuration = validateSequence({
      name: "X",
      kind: "straight",
      steps: [{ exerciseName: "swing", reps: 5 }],
    });
    expect(noDuration.ok && noDuration.durationMinutes).toBeNull();
  });

  it("accepts timed steps without reps (tabata)", () => {
    const result = validateSequence({
      name: "Tabata swings",
      kind: "tabata",
      restSecondsDefault: 10,
      steps: [{ exerciseName: "two-hand swing", seconds: 20, weightKg: 16 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.restSecondsDefault).toBe(10);
    expect(result.steps[0].seconds).toBe(20);
  });

  it("coerces numeric strings from form inputs", () => {
    const result = validateSequence({
      name: "EMOM 20",
      kind: "emom",
      steps: [{ exerciseName: "kettlebell clean", sets: "10", reps: "6", weightKg: "20" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].sets).toBe(10);
    expect(result.steps[0].reps).toBe(6);
    expect(result.steps[0].weightKg).toBe(20);
  });

  it("rejects a step with neither reps nor seconds", () => {
    const result = validateSequence({
      name: "Broken",
      kind: "straight",
      steps: [{ exerciseName: "goblet squat", weightKg: 24 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("goblet squat");
  });

  it("rejects unknown kinds, empty names, and empty step lists", () => {
    expect(
      validateSequence({ name: "X", kind: "pyramid", steps: [{ exerciseName: "swing", reps: 5 }] }).ok
    ).toBe(false);
    expect(validateSequence({ name: "  ", kind: "straight", steps: [] }).ok).toBe(false);
    expect(validateSequence({ name: "X", kind: "straight", steps: [] }).ok).toBe(false);
  });

  it("rejects oversized routines", () => {
    const result = validateSequence({
      name: "Too long",
      kind: "circuit",
      steps: Array.from({ length: 41 }, () => ({ exerciseName: "swing", reps: 5 })),
    });
    expect(result.ok).toBe(false);
  });
});
