import { describe, expect, it } from "vitest";
import {
  buildMovementHistories,
  movementContext,
  timeUnderLoadSeconds,
  tonnageByMovement,
} from "@/lib/strength-history";

const rows = [
  {
    id: "w1",
    startedAt: "2026-08-01T12:00:00.000Z",
    exercises: [
      { name: "Swing", sets: 5, reps: 10, weightKg: 24 },
      { name: "Goblet Squat", sets: 3, reps: 8, weightKg: 20 },
    ],
  },
  {
    id: "w2",
    startedAt: "2026-08-15T12:00:00.000Z",
    exercises: [
      // Case/plural variant must fold onto the same movement.
      { name: "swings", sets: 5, reps: 10, weightKg: 28 },
      { name: "Plank", sets: 3, seconds: 45 },
    ],
  },
  {
    id: "w3",
    startedAt: "2026-08-28T12:00:00.000Z",
    exercises: [{ name: "Swing", sets: 4, reps: 10, weightKg: 32 }],
  },
];

describe("strength-history", () => {
  it("folds name variants into one movement with best + per-session tops", () => {
    const map = buildMovementHistories(rows);
    const swing = [...map.values()].find((h) => h.name.toLowerCase().includes("swing"))!;
    expect(swing).toBeDefined();
    expect(swing.sessions).toHaveLength(3);
    expect(swing.bestWeightKg).toBe(32);
    expect(swing.sessions[0].workoutId).toBe("w3"); // newest first
    expect(swing.totalVolumeKg).toBe(24 * 50 + 28 * 50 + 32 * 40);
  });

  it("movementContext gives best + last-time BEFORE the session date", () => {
    const map = buildMovementHistories(rows);
    const ctx = movementContext(map, "Swing", "2026-08-28T12:00:00.000Z")!;
    expect(ctx.bestWeightKg).toBe(32);
    expect(ctx.lastTime?.topWeightKg).toBe(28); // w2, not w3 itself
    expect(ctx.timesTrained).toBe(3);
  });

  it("time under load counts seconds-based entries × sets, ignores reps work", () => {
    expect(timeUnderLoadSeconds(rows[1].exercises)).toBe(135); // 3 × 45s
    expect(timeUnderLoadSeconds(rows[0].exercises)).toBe(0);
  });

  it("tonnageByMovement ranks by trailing-window volume", () => {
    const map = buildMovementHistories(rows);
    const top = tonnageByMovement(map, 8, 6, new Date("2026-08-29T00:00:00.000Z"));
    expect(top[0].name.toLowerCase()).toContain("swing");
    expect(top[0].totalKg).toBe(24 * 50 + 28 * 50 + 32 * 40);
    // Plank has no tonnage — it must not appear.
    expect(top.find((t) => t.name.toLowerCase().includes("plank"))).toBeUndefined();
  });
});
