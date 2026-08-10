import { describe, it, expect } from "vitest";
import { normalizeExerciseName, EXERCISE_CATALOG, weightPresetsFor, getExerciseById } from "@/lib/exercises";

describe("catalog covers Michael's movements", () => {
  const spoken: [string, string][] = [
    ["halos", "kb-halo"], ["snatches", "kb-snatch"], ["cleans", "kb-clean"],
    ["kettlebell swings", "kb-swing"], ["deadlifts", "kb-deadlift"],
    ["renegade rows", "kb-renegade-row"], ["windmills", "kb-windmill"],
    ["turkish get ups", "kb-turkish-get-up"], ["jerks", "kb-jerk"],
    ["gorilla rows", "kb-gorilla-row"], ["goblet squats", "kb-goblet-squat"],
    ["bicep curls", "bicep-curl"], ["chest press", "db-chest-press"],
    ["shoulder press", "db-shoulder-press"], ["incline shoulder press", "db-incline-press"],
    ["bent over rows", "db-row"], ["tricep extensions", "tricep-extension"],
    ["lateral raises", "lateral-raise"], ["reverse lunges", "kb-reverse-lunge"],
    ["clamshells", "clamshell"], ["reverse planks", "reverse-plank"],
    ["walking", "walk"], ["hiking", "hike"], ["running", "run"],
  ];
  for (const [said, id] of spoken) {
    it(`"${said}" → ${id}`, () => {
      expect(normalizeExerciseName(said)?.id).toBe(id);
    });
  }
  it("kettlebell presets are his ladder", () => {
    expect(weightPresetsFor(getExerciseById("kb-swing"))).toEqual([16, 20, 24, 32]);
    expect(weightPresetsFor(getExerciseById("bicep-curl"))).toEqual([17.5]);
  });
  it("slow technical lifts are excluded from EMOM randomisation", () => {
    expect(getExerciseById("kb-turkish-get-up")?.emomSuitable).toBe(false);
    expect(getExerciseById("kb-windmill")?.emomSuitable).toBe(false);
  });
  it("every emom-suitable movement carries reps", () => {
    for (const e of EXERCISE_CATALOG.filter((x) => x.emomSuitable)) {
      expect(e.emomReps, e.id).toBeGreaterThan(0);
    }
  });
});
