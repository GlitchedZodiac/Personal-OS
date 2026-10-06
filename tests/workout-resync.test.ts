import { afterEach, describe, expect, it } from "vitest";
import { setCustomExercises } from "@/lib/exercises";
import {
  exercisesWereEdited,
  mergeResync,
  stampExercisesEdited,
  withCanonicalIds,
} from "@/lib/workout-resync";

const wristList = [{ name: "Kettlebell Swing", sets: 2, reps: 10, weightKg: 24 }];
const fixedList = [{ name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10, weightKg: 32 }];

describe("mergeResync — a re-send from the watch", () => {
  it("writes through when nothing was edited on the phone", () => {
    const merged = mergeResync(
      { exercises: wristList, metricsData: { hrStream: [1, 2] }, description: null },
      { exercises: wristList, metricsData: { hrStream: [1, 2], hrrDelta: 30 }, description: null }
    );
    expect(merged.keptEditedExercises).toBe(false);
    expect(merged.exercises).toEqual(wristList);
    expect((merged.metricsData as { hrrDelta: number }).hrrDelta).toBe(30);
  });

  it("keeps his corrected movement list when the HRR re-send arrives", () => {
    const merged = mergeResync(
      { exercises: fixedList, metricsData: stampExercisesEdited({ hrStream: [1, 2] }), description: null },
      { exercises: wristList, metricsData: { hrStream: [1, 2], hrrDelta: 30 }, description: null }
    );
    expect(merged.keptEditedExercises).toBe(true);
    expect(merged.exercises).toEqual(fixedList);
    // …while the watch's own numbers still land
    const m = merged.metricsData as { hrrDelta: number; exercisesEditedAt: string };
    expect(m.hrrDelta).toBe(30);
    expect(typeof m.exercisesEditedAt).toBe("string");
  });

  it("never wipes a described session with the wrist's empty list", () => {
    const merged = mergeResync(
      { exercises: fixedList, metricsData: stampExercisesEdited(null), description: null },
      { exercises: null, metricsData: { hrrDelta: 12 }, description: null }
    );
    expect(merged.exercises).toEqual(fixedList);
  });

  it("flags a voice entry that arrived after the edit instead of dropping it", () => {
    const before = stampExercisesEdited({ setLog: [{ id: "a", name: "Push-Up" }] });
    const merged = mergeResync(
      { exercises: fixedList, metricsData: before, description: null },
      {
        exercises: wristList,
        metricsData: { setLog: [{ id: "a", name: "Push-Up" }, { id: "b", name: "Burpee" }] },
        description: null,
      }
    );
    expect(merged.lateEntryIds).toEqual(["b"]);
    expect((merged.metricsData as { lateEntryIds: string[] }).lateEntryIds).toEqual(["b"]);
  });

  it("a late entry stays late across further re-sends until he deals with it", () => {
    const before = {
      ...stampExercisesEdited({ setLog: [{ id: "a" }, { id: "b" }] }),
      lateEntryIds: ["b"],
    };
    const merged = mergeResync(
      { exercises: fixedList, metricsData: before, description: null },
      { exercises: wristList, metricsData: { setLog: [{ id: "a" }, { id: "b" }] }, description: null }
    );
    expect(merged.lateEntryIds).toEqual(["b"]);
  });

  it("a jump count entered on the phone survives a re-send without one", () => {
    const merged = mergeResync(
      {
        exercises: null,
        metricsData: { intervals: { mode: "interval", jumps: { source: "manual", total: 900 } } },
        description: null,
      },
      { exercises: null, metricsData: { intervals: { mode: "interval" }, hrrDelta: 20 }, description: null }
    );
    const m = merged.metricsData as { intervals: { jumps?: { total: number } } };
    expect(m.intervals.jumps?.total).toBe(900);
  });

  it("a late re-send built before the HRR landed does not erase it", () => {
    const merged = mergeResync(
      { exercises: wristList, metricsData: { hrrDelta: 31, hrrSeconds: 60 }, description: null },
      { exercises: wristList, metricsData: { setLog: [{ id: "a" }] }, description: null }
    );
    const m = merged.metricsData as { hrrDelta: number; hrrSeconds: number };
    expect(m.hrrDelta).toBe(31);
    expect(m.hrrSeconds).toBe(60);
  });

  it("keeps a description the phone added", () => {
    const merged = mergeResync(
      { exercises: null, metricsData: null, description: "Follow-along video" },
      { exercises: null, metricsData: { hrrDelta: 9 }, description: null }
    );
    expect(merged.description).toBe("Follow-along video");
  });
});

describe("stampExercisesEdited", () => {
  it("marks the list as edited and keeps everything else", () => {
    const stamped = stampExercisesEdited({ hrrDelta: 7 }, new Date("2026-10-05T12:00:00Z"));
    expect(stamped).toEqual({ hrrDelta: 7, exercisesEditedAt: "2026-10-05T12:00:00.000Z" });
    expect(exercisesWereEdited(stamped)).toBe(true);
    expect(exercisesWereEdited({ hrrDelta: 7 })).toBe(false);
    expect(exercisesWereEdited(null)).toBe(false);
  });
});

describe("withCanonicalIds", () => {
  afterEach(() => setCustomExercises([]));

  it("adds the id to rows that resolve and leaves the name as sent", () => {
    const out = withCanonicalIds([
      { name: "Kettlebell Swing", reps: 10 },
      { name: "Bear Crawl", reps: 10 },
      { name: "Push-Up", exercise: "push-up", reps: 10 },
    ]) as Array<Record<string, unknown>>;
    expect(out[0]).toEqual({ name: "Kettlebell Swing", reps: 10, exercise: "kb-swing" });
    expect(out[1]).toEqual({ name: "Bear Crawl", reps: 10 });
    expect(out[2]).toEqual({ name: "Push-Up", exercise: "push-up", reps: 10 });
  });

  it("resolves custom movements once they are loaded", () => {
    setCustomExercises([
      { id: "bear-crawl", name: "Bear Crawl", category: "bodyweight", aliases: [] },
    ]);
    const out = withCanonicalIds([{ name: "Bear Crawl", reps: 10 }]) as Array<Record<string, unknown>>;
    expect(out[0].exercise).toBe("bear-crawl");
  });

  it("passes non-lists through", () => {
    expect(withCanonicalIds(null)).toBeNull();
    expect(withCanonicalIds(undefined)).toBeUndefined();
  });
});
