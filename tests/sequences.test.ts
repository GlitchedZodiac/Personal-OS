import { afterEach, describe, expect, it } from "vitest";
import { formatStepPrescription, validateSequence } from "@/lib/sequences";
import { setCustomExercises } from "@/lib/exercises";

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

  it("carries rounds for circuits ('repeat 3 times') and rejects absurd counts", () => {
    const result = validateSequence({
      name: "Swing/snatch/squat circuit",
      kind: "circuit",
      rounds: 3,
      restSecondsDefault: 60,
      steps: [
        { exerciseName: "kettlebell swings", reps: 20, weightKg: 20 },
        { exerciseName: "snatches", reps: 20, weightKg: 20 },
        { exerciseName: "goblet squats", reps: 20, weightKg: 20 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rounds).toBe(3);
    expect(result.restSecondsDefault).toBe(60);

    expect(
      validateSequence({
        name: "X",
        kind: "circuit",
        rounds: 99,
        steps: [{ exerciseName: "swing", reps: 5 }],
      }).ok
    ).toBe(false);

    const noRounds = validateSequence({
      name: "X",
      kind: "circuit",
      steps: [{ exerciseName: "swing", reps: 5 }],
    });
    expect(noRounds.ok && noRounds.rounds).toBeNull();
  });

  it("coerces rounds from form-input strings", () => {
    const result = validateSequence({
      name: "Circuit",
      kind: "circuit",
      rounds: "4",
      steps: [{ exerciseName: "swing", reps: 10 }],
    });
    expect(result.ok && result.rounds).toBe(4);
  });

  it("resolves user-minted movements once they join the index", () => {
    setCustomExercises([
      {
        id: "one-arm-clean-squat-thruster",
        name: "One-Arm Clean Squat Thruster",
        category: "kettlebell",
        aliases: [],
      },
    ]);
    const result = validateSequence({
      name: "Flow day",
      kind: "circuit",
      rounds: 3,
      steps: [{ exerciseName: "one-arm clean squat thruster", reps: 5, weightKg: 20 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the custom must win over the catalog's substring "clean"
    expect(result.steps[0].exercise).toBe("one-arm-clean-squat-thruster");
    expect(result.steps[0].exerciseName).toBe("One-Arm Clean Squat Thruster");
  });
});

afterEach(() => setCustomExercises([]));

// Added 2026-08-26 after a real proposal on his phone. The assistant tried to
// express "two sets to failure", had no field for it, wrote the words into
// exerciseName, and sent reps: 0 / seconds: 0 — so the card was unsavable AND
// would have minted six junk movements into the catalog.
describe("to-failure sets", () => {
  it("accepts a step prescribed to failure with no reps or seconds", () => {
    const r = validateSequence({
      name: "Dumbbell Upper Body",
      kind: "straight",
      steps: [{ exerciseName: "Bicep Curl", sets: 2, toFailure: true }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].toFailure).toBe(true);
    expect(r.steps[0].sets).toBe(2);
    expect(r.steps[0].reps).toBeUndefined();
    expect(r.steps[0].seconds).toBeUndefined();
  });

  it("still rejects a step with no prescription at all", () => {
    const r = validateSequence({
      name: "Nope",
      kind: "straight",
      steps: [{ exerciseName: "Bicep Curl", sets: 2 }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("to-failure");
  });

  it("pulls a prescription out of the NAME so it never reaches the catalog", () => {
    // This is the exact payload his phone produced.
    const r = validateSequence({
      name: "Dumbbell Upper Body — 2 Sets to Failure",
      kind: "straight",
      steps: [
        { exerciseName: "Bicep Curl — to failure", sets: 2, reps: 0, seconds: 0 },
        { exerciseName: "Dumbbell Row (each side) — to failure", sets: 2, reps: 0 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].exerciseName).not.toContain("failure");
    expect(r.steps[0].toFailure).toBe(true);
    // The per-side qualifier must survive the strip.
    expect(r.steps[1].exerciseName.toLowerCase()).toContain("each side");
    expect(r.steps[1].exerciseName).not.toContain("failure");
    expect(r.steps[1].toFailure).toBe(true);
  });

  it("recognises the other ways he might say it", () => {
    for (const name of [
      "Push-ups to failure",
      "Push-ups (AMRAP)",
      "Push-ups - until failure",
      "Push-ups — max reps",
      "Push-ups: to fail",
    ]) {
      const r = validateSequence({
        name: "x", kind: "straight", steps: [{ exerciseName: name, sets: 1 }],
      });
      expect(r.ok, `"${name}" should be accepted`).toBe(true);
      if (!r.ok) continue;
      expect(r.steps[0].toFailure, `"${name}"`).toBe(true);
      expect(r.steps[0].exerciseName.toLowerCase()).not.toMatch(/failure|amrap|max reps/);
    }
  });

  it("leaves a normal movement name alone", () => {
    const r = validateSequence({
      name: "x", kind: "straight",
      steps: [{ exerciseName: "Turkish Get-Up", sets: 3, reps: 5 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].toFailure).toBeUndefined();
    expect(r.steps[0].reps).toBe(5);
  });

  it("drops a rep count when the step is to failure — a stop condition, not a target", () => {
    const r = validateSequence({
      name: "x", kind: "straight",
      steps: [{ exerciseName: "Bicep Curl", sets: 2, reps: 12, toFailure: true }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps[0].reps).toBeUndefined();
    expect(r.steps[0].toFailure).toBe(true);
  });
});

describe("formatStepPrescription", () => {
  it("reads a to-failure step, with and without a set count", () => {
    expect(formatStepPrescription({ sets: 2, toFailure: true })).toBe("2 × to failure");
    expect(formatStepPrescription({ toFailure: true })).toBe("to failure");
  });

  it("still reads reps and time the way it always did", () => {
    expect(formatStepPrescription({ sets: 5, reps: 10 })).toBe("5 × 10");
    expect(formatStepPrescription({ reps: 12 })).toBe("12 reps");
    expect(formatStepPrescription({ seconds: 45 })).toBe("45s");
  });

  it("returns null when nothing is prescribed, rather than an empty string", () => {
    expect(formatStepPrescription({})).toBeNull();
    // The zero-filled shape the model used to send — must not read as a dose.
    expect(formatStepPrescription({ sets: 2, reps: 0, seconds: 0 })).toBeNull();
  });
});
