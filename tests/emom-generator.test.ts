import { describe, it, expect } from "vitest";
import { generateEmom } from "@/lib/emom-generator";
import { getExerciseById } from "@/lib/exercises";

// Deterministic pseudo-random so the invariants are checked across many
// draws, not one lucky one.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("randomised EMOM", () => {
  it("returns a runnable emom routine", () => {
    const r = generateEmom({ random: seeded(1) });
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("emom");
    expect(r!.durationMinutes).toBe(20);
    expect(r!.steps.length).toBe(4);
    for (const step of r!.steps) {
      expect(step.exercise).toBeTruthy();
      expect(step.reps ?? step.seconds).toBeGreaterThan(0);
    }
  });

  it("never schedules a movement unfit for a clock", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = generateEmom({ random: seeded(seed) })!;
      for (const step of r.steps) {
        expect(getExerciseById(step.exercise)?.emomSuitable, step.exercise).toBe(
          true
        );
      }
    }
  });

  it("never puts two grip-heavy movements back to back, wrap included", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = generateEmom({ random: seeded(seed) })!;
      const grips = r.steps.map(
        (s) => getExerciseById(s.exercise)?.grip ?? "low"
      );
      for (let i = 0; i < grips.length; i++) {
        const next = grips[(i + 1) % grips.length];
        if (grips[i] === "high" && next === "high") {
          throw new Error(
            `adjacent grip-heavy movements at seed ${seed}: ${r.steps.map((s) => s.exerciseName).join(", ")}`
          );
        }
      }
    }
  });

  it("picks distinct movements", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = generateEmom({ random: seeded(seed) })!;
      const ids = r.steps.map((s) => s.exercise);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("labels unilateral work per side", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = generateEmom({ random: seeded(seed) })!;
      for (const step of r.steps) {
        const def = getExerciseById(step.exercise)!;
        if (def.laterality === "unilateral") {
          expect(step.exerciseName).toMatch(/each side/i);
        }
      }
    }
  });

  it("loads kettlebells from his ladder and dumbbells at 17.5", () => {
    const kb = generateEmom({ equipment: "kettlebell", kettlebellKg: 24, random: seeded(7) })!;
    for (const step of kb.steps) expect(step.weightKg).toBe(24);

    const db = generateEmom({ equipment: "dumbbell", random: seeded(7) })!;
    for (const step of db.steps) expect(step.weightKg).toBe(17.5);
  });

  it("varies between draws", () => {
    const a = generateEmom({ random: seeded(3) })!;
    const b = generateEmom({ random: seeded(99) })!;
    expect(a.steps.map((s) => s.exercise).join()).not.toBe(
      b.steps.map((s) => s.exercise).join()
    );
  });
});
