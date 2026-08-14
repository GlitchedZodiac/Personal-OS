import { describe, expect, it } from "vitest";
import {
  analyzeProgression,
  applyChanges,
  type ProgressionRun,
  type ProgressionSequence,
} from "@/lib/progression";

// His approved spec: bump only after 3 consistent completions, never
// twice in a row, 4 kg denominations, deload after 2 abandoned runs.

const seq = (over: Partial<ProgressionSequence> = {}): ProgressionSequence => ({
  id: "s1",
  name: "Armor Complex",
  kind: "circuit",
  rounds: 5,
  steps: [
    { exercise: "kb-clean", weightKg: 20 },
    { exercise: "kb-press", weightKg: 16 },
    { exercise: "plank", seconds: 45 },
  ],
  ...over,
});

const run = (daysAgo: number, roundsCompleted: number, totalRounds = 5): ProgressionRun => ({
  startedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  roundsCompleted,
  totalRounds,
});

describe("analyzeProgression", () => {
  it("suggests a 4 kg raise after 3 clean runs", () => {
    const s = analyzeProgression(seq(), [run(1, 5), run(3, 5), run(5, 5)]);
    expect(s?.type).toBe("raise");
    expect(s?.changes.find((c) => c.exercise === "kb-clean")?.toKg).toBe(24);
    expect(s?.changes.find((c) => c.exercise === "kb-press")?.toKg).toBe(20);
    expect(s?.changes.find((c) => c.exercise === "plank")?.toSeconds).toBe(50);
  });

  it("holds after a raise until three NEW clean runs exist", () => {
    const raisedYesterday = seq({
      progression: { lastRaiseAt: new Date(Date.now() - 1 * 86_400_000).toISOString() },
    });
    // 3 clean runs, but the raise happened after the oldest of them
    expect(analyzeProgression(raisedYesterday, [run(0, 5), run(2, 5), run(4, 5)])).toBeNull();
    // an OLD raise (before all basis runs) doesn't block
    const raisedLongAgo = seq({
      progression: { lastRaiseAt: new Date(Date.now() - 30 * 86_400_000).toISOString() },
    });
    expect(analyzeProgression(raisedLongAgo, [run(1, 5), run(3, 5), run(5, 5)])?.type).toBe("raise");
  });

  it("does not raise on two clean runs or a missed run in the window", () => {
    expect(analyzeProgression(seq(), [run(1, 5), run(3, 5)])).toBeNull();
    expect(analyzeProgression(seq(), [run(1, 5), run(3, 3), run(5, 5)])).toBeNull();
  });

  it("suggests a deload after 2 abandoned runs", () => {
    const s = analyzeProgression(seq(), [run(1, 2), run(3, 3)]);
    expect(s?.type).toBe("deload");
    expect(s?.changes.find((c) => c.exercise === "kb-clean")?.toKg).toBe(16);
    // 16 kg press deloads to 12; nothing ever below one bell (4 kg)
    expect(s?.changes.find((c) => c.exercise === "kb-press")?.toKg).toBe(12);
  });

  it("counts rounds-less runs as completed (missing telemetry never punishes)", () => {
    const bare: ProgressionRun[] = [1, 3, 5].map((d) => ({
      startedAt: new Date(Date.now() - d * 86_400_000).toISOString(),
    }));
    expect(analyzeProgression(seq(), bare)?.type).toBe("raise");
  });

  it("applyChanges rewrites only the suggested steps", () => {
    const s = analyzeProgression(seq(), [run(1, 5), run(3, 5), run(5, 5)])!;
    const next = applyChanges(seq().steps, s.changes);
    expect(next[0].weightKg).toBe(24);
    expect(next[2].seconds).toBe(50);
    expect(next[1].exercise).toBe("kb-press");
  });
});
