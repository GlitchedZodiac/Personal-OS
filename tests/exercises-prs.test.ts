import { describe, expect, it } from "vitest";
import { normalizeExerciseName, getExerciseById } from "@/lib/exercises";
import { extractPRCandidates } from "@/lib/prs";

describe("normalizeExerciseName", () => {
  it("maps kettlebell vocabulary from voice transcripts", () => {
    expect(normalizeExerciseName("Kettlebell swings")?.id).toBe("kb-swing");
    expect(normalizeExerciseName("goblet squats")?.id).toBe("kb-goblet-squat");
    expect(normalizeExerciseName("Turkish get-ups")?.id).toBe("kb-turkish-get-up");
    expect(normalizeExerciseName("TGU")?.id).toBe("kb-turkish-get-up");
    expect(normalizeExerciseName("clean and press")?.id).toBe("kb-clean-and-press");
  });

  it("prefers the longest match — clean and press is not clean", () => {
    expect(normalizeExerciseName("Clean and Press")?.id).toBe("kb-clean-and-press");
    expect(normalizeExerciseName("cleans")?.id).toBe("kb-clean");
  });

  it("understands Spanish aliases with accents", () => {
    expect(normalizeExerciseName("sentadilla goblet")?.id).toBe("kb-goblet-squat");
    expect(normalizeExerciseName("peso muerto")?.id).toBe("deadlift");
    expect(normalizeExerciseName("dominadas")?.id).toBe("pull-up");
    expect(normalizeExerciseName("press militar")?.id).toBe("kb-press");
  });

  it("matches inside descriptive phrases", () => {
    expect(normalizeExerciseName("5 rounds of kettlebell swings")?.id).toBe("kb-swing");
    expect(normalizeExerciseName("heavy goblet squat work")?.id).toBe("kb-goblet-squat");
  });

  it("returns null for unknown movements", () => {
    expect(normalizeExerciseName("underwater basket weaving")).toBeNull();
    expect(normalizeExerciseName("")).toBeNull();
  });

  it("resolves canonical ids", () => {
    expect(getExerciseById("kb-swing")?.name).toBe("Kettlebell Swing");
    expect(getExerciseById("nope")).toBeNull();
  });
});

describe("extractPRCandidates", () => {
  it("produces weight and volume candidates per canonical exercise", () => {
    const candidates = extractPRCandidates([
      { name: "Kettlebell swings", sets: 5, reps: 20, weightKg: 24 },
      { name: "Goblet squats", sets: 3, reps: 8, weightKg: 24 },
    ]);
    const swingWeight = candidates.find(
      (c) => c.exercise === "kb-swing" && c.kind === "weight"
    );
    const swingVolume = candidates.find(
      (c) => c.exercise === "kb-swing" && c.kind === "volume"
    );
    expect(swingWeight?.value).toBe(24);
    expect(swingVolume?.value).toBe(5 * 20 * 24);
    expect(candidates.filter((c) => c.exercise === "kb-goblet-squat")).toHaveLength(2);
  });

  it("keeps the best set when an exercise repeats", () => {
    const candidates = extractPRCandidates([
      { name: "swings", sets: 3, reps: 10, weightKg: 20 },
      { name: "kettlebell swing", sets: 2, reps: 10, weightKg: 28 },
    ]);
    const weight = candidates.find((c) => c.kind === "weight");
    expect(weight?.value).toBe(28);
  });

  it("skips bodyweight entries and unknown names", () => {
    const candidates = extractPRCandidates([
      { name: "Push-ups", sets: 3, reps: 20 }, // no weight → no PR
      { name: "mystery move", sets: 3, reps: 8, weightKg: 50 },
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("tolerates string numbers and garbage", () => {
    const candidates = extractPRCandidates([
      { name: "deadlift", sets: "3", reps: "5", weightKg: "100" },
      null,
      42,
      { name: "squat", weightKg: -10 },
    ]);
    expect(candidates.find((c) => c.exercise === "deadlift" && c.kind === "volume")?.value).toBe(1500);
    expect(candidates.filter((c) => c.exercise === "back-squat")).toHaveLength(0);
  });
});
