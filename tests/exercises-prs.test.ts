import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeExerciseName,
  getExerciseById,
  setCustomExercises,
  findExerciseByExactName,
  slugifyExerciseName,
} from "@/lib/exercises";
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

describe("user-minted exercises in the shared index", () => {
  afterEach(() => setCustomExercises([]));

  const thruster = {
    id: "one-arm-clean-squat-thruster",
    name: "One-Arm Clean Squat Thruster",
    category: "kettlebell" as const,
    aliases: ["ocst"],
  };

  it("customs win over catalog substring matches", () => {
    // Without the custom, the fuzzy pass swallows the flow into a catalog
    // movement (longest substring wins — "thruster").
    expect(normalizeExerciseName("one-arm clean squat thruster")?.id).toBe("kb-thruster");
    setCustomExercises([thruster]);
    expect(normalizeExerciseName("one-arm clean squat thruster")?.id).toBe(
      "one-arm-clean-squat-thruster"
    );
    expect(normalizeExerciseName("ocst")?.id).toBe("one-arm-clean-squat-thruster");
    // catalog resolution is untouched
    expect(normalizeExerciseName("clean and press")?.id).toBe("kb-clean-and-press");
  });

  it("variants tracked separately resolve to themselves, not the base movement", () => {
    setCustomExercises([
      { id: "two-hand-clean", name: "Two-Hand Clean", category: "kettlebell", aliases: [] },
    ]);
    expect(normalizeExerciseName("two-hand clean")?.id).toBe("two-hand-clean");
    expect(normalizeExerciseName("clean")?.id).toBe("kb-clean");
  });

  it("exact-name gate ignores fuzzy matches (the mint decision)", () => {
    expect(findExerciseByExactName("one-arm clean squat thruster")).toBeNull();
    expect(findExerciseByExactName("goblet squats")?.id).toBe("kb-goblet-squat");
    setCustomExercises([thruster]);
    expect(findExerciseByExactName("One-Arm Clean Squat Thruster")?.id).toBe(
      "one-arm-clean-squat-thruster"
    );
  });

  it("slugifies names into stable ids", () => {
    expect(slugifyExerciseName("One-Arm Clean Squat Thruster")).toBe(
      "one-arm-clean-squat-thruster"
    );
    expect(slugifyExerciseName("Curl Martillo (pesado)")).toBe("curl-martillo-pesado");
  });

  it("resolves custom ids and PRs custom movements", () => {
    setCustomExercises([thruster]);
    expect(getExerciseById("one-arm-clean-squat-thruster")?.name).toBe(
      "One-Arm Clean Squat Thruster"
    );
    const candidates = extractPRCandidates([
      { name: "one-arm clean squat thruster", sets: 3, reps: 5, weightKg: 20 },
    ]);
    const weight = candidates.find((c) => c.kind === "weight");
    expect(weight?.exercise).toBe("one-arm-clean-squat-thruster");
    expect(weight?.value).toBe(20);
  });
});
