import { afterEach, describe, expect, it } from "vitest";

// The 2026-11-12 quick wins from the Pitaya gap review: the guarded name
// matcher (#1), bodyweight load in PRs (#4), the label check (#13) and the
// single-workout streams (#15).

import {
  leftoverChangesMovement,
  looseExerciseMatch,
  matchExerciseName,
  normalizeExerciseName,
  setCustomExercises,
} from "@/lib/exercises";
import { countedLoad, extractPRCandidates, sessionVolumeKg } from "@/lib/prs";
import { kcalFromMacros, macroMismatchWarning } from "@/lib/macro-check";
import { downsample, hrBuckets, workoutDetail, MAX_POINTS } from "@/lib/workout-detail";

describe("guarded name matching (gap #1)", () => {
  afterEach(() => setCustomExercises([]));

  it.each<[string, string | null]>([
    // The mismaps from the review — each was polluting a barbell history.
    ["Seated Dumbbell Shoulder Press", null],
    ["Bodyweight Squat", null],
    ["2-Pump Burpee", null],
    ["Double Thrust-Jerk", null],
    // Single-arm swing has its own entry; it was only missing the alias.
    ["Single-Arm Kettlebell Swing", "kb-one-arm-swing"],
    ["one arm kb swing", "kb-one-arm-swing"],
    // Descriptive filler still matches.
    ["5 rounds of kettlebell swings", "kb-swing"],
    ["heavy goblet squat work", "kb-goblet-squat"],
    ["Kettlebell swings x20", "kb-swing"],
    ["Double kettlebell front squat", "kb-front-squat"],
    // Exact names and aliases are untouched.
    ["shoulder press", "overhead-press"],
    ["Burpees", "burpee"],
    ["clean and press", "kb-clean-and-press"],
  ])("%s → %s", (name, id) => {
    expect(normalizeExerciseName(name)?.id ?? null).toBe(id);
  });

  it("a custom movement still wins by exact name", () => {
    setCustomExercises([
      { id: "jerk", name: "Jerk", category: "kettlebell", aliases: [], isCustom: true },
    ]);
    expect(normalizeExerciseName("Jerk")?.id).toBe("jerk");
    expect(normalizeExerciseName("Thrust Jerk")).toBeNull();
  });

  it("says how it matched", () => {
    expect(matchExerciseName("Kettlebell Swing")?.how).toBe("exact");
    expect(matchExerciseName("10 kettlebell swings")?.how).toBe("contains");
    expect(matchExerciseName("seated dumbbell shoulder press")).toBeNull();
  });

  it("equipment that agrees with the movement is harmless; equipment that doesn't is not", () => {
    const kbSwing = normalizeExerciseName("Kettlebell Swing")!;
    expect(leftoverChangesMovement(["kettlebell"], kbSwing)).toBe(false);
    expect(leftoverChangesMovement(["dumbbell"], kbSwing)).toBe(true);
    expect(leftoverChangesMovement(["heavy", "5"], kbSwing)).toBe(false);
  });

  it("the loose matcher keeps the old reach for review-only callers", () => {
    expect(looseExerciseMatch("Seated Dumbbell Shoulder Press")?.id).toBe("overhead-press");
  });
});

describe("bodyweight load (gap #4)", () => {
  afterEach(() => setCustomExercises([]));

  it("bells used as push-up handles set no weight or volume record", () => {
    const candidates = extractPRCandidates([
      { name: "Push-up", sets: 4, reps: 5, weightKg: 24, implements: 2 },
    ]);
    expect(candidates).toEqual([]);
  });

  it("a worn vest is the load on a bodyweight movement", () => {
    const candidates = extractPRCandidates([
      { name: "Push-up", sets: 3, reps: 10, load: { type: "vest", kg: 10 } },
    ]);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exercise: "push-up", kind: "weight", value: 10 }),
        expect.objectContaining({ exercise: "push-up", kind: "volume", value: 300 }),
      ])
    );
  });

  it("a custom movement marked load: bodyweight ignores its implement", () => {
    setCustomExercises([
      { id: "atomic-push-up", name: "Atomic Push Up", category: "kettlebell", load: "bodyweight", aliases: [], isCustom: true },
    ]);
    expect(extractPRCandidates([{ name: "Atomic Push Up", sets: 4, reps: 5, weightKg: 24 }])).toEqual([]);
    expect(sessionVolumeKg([{ name: "Atomic Push Up", sets: 4, reps: 5, weightKg: 24 }])).toBe(0);
  });

  it("external-load movements are unchanged, pairs included", () => {
    const def = normalizeExerciseName("Kettlebell Swing");
    expect(countedLoad({ weightKg: 16, implements: 2 } as never, def)).toEqual({ kg: 16, implementsCount: 2 });
    expect(sessionVolumeKg([{ name: "Kettlebell Swing", sets: 1, reps: 10, weightKg: 16 }])).toBe(160);
  });
});

describe("label check (gap #13)", () => {
  it("computes Atwater calories", () => {
    expect(kcalFromMacros({ proteinG: 25, carbsG: 5, fatG: 2 })).toBe(138);
  });

  it("warns past 10%, stays quiet within it and for tiny items", () => {
    expect(macroMismatchWarning({ calories: 176, proteinG: 25, carbsG: 5, fatG: 2 })).toContain("22% apart");
    expect(macroMismatchWarning({ calories: 145, proteinG: 25, carbsG: 5, fatG: 2 })).toBeNull();
    expect(macroMismatchWarning({ calories: 5, proteinG: 0, carbsG: 3, fatG: 0 })).toBeNull();
  });
});

describe("one workout's streams (gap #15)", () => {
  it("downsamples long series to the cap and leaves short ones alone", () => {
    const long = Array.from({ length: 460 }, (_, i) => i);
    const out = downsample(long)!;
    expect(out.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(out[0]).toBeLessThan(out[out.length - 1]);
    expect(downsample([1, 2, 3])).toEqual([1, 2, 3]);
    expect(downsample("nope")).toBeNull();
  });

  it("buckets HR by time, a minute per point for a 38-minute walk", () => {
    const t = Array.from({ length: 456 }, (_, i) => i * 5); // 38 min at 5 s
    const hr = t.map((s) => 90 + Math.floor(s / 600));
    const out = hrBuckets(hr, t)!;
    expect(out.bucketSeconds).toBe(60);
    expect(out.bpm.length).toBe(38);
    expect(out.bpm[0]).toBe(90);
    expect(out.bpm[out.bpm.length - 1]).toBe(93);
  });

  it("builds the detail block from metricsData", () => {
    const detail = workoutDetail({
      hrStream: [100, 110, 120],
      timeStream: [0, 60, 120],
      routeAnalytics: { velocitySeries: [1.2, 1.5], gradeSeries: [0, 2], splits: [{ km: 1 }] },
    })!;
    expect(detail.heartRate).toBeTruthy();
    expect(detail.speedMps).toEqual([1.2, 1.5]);
    expect(detail.gradePct).toEqual([0, 2]);
    expect(detail.splits).toEqual([{ km: 1 }]);
    expect(workoutDetail(null)).toBeNull();
  });
});
