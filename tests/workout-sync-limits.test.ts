import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  downsampleEvenly,
  isItemDataError,
  sanitizeSyncItem,
  stripNul,
  SYNC_LIMITS,
} from "@/lib/workout-sync-limits";

// The pure half of the sync bounds (audit 2026-10, SEC-024).

describe("downsampleEvenly", () => {
  it("leaves short arrays alone and keeps first + last when trimming", () => {
    expect(downsampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const big = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsampleEvenly(big, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBe(999);
    expect([...out].sort((a, b) => a - b)).toEqual(out); // order kept
  });
  it("is deterministic in (length, max), so parallel streams stay aligned", () => {
    const hr = Array.from({ length: 70_000 }, (_, i) => i);
    const time = Array.from({ length: 70_000 }, (_, i) => i * 10);
    const a = downsampleEvenly(hr, 60_000);
    const b = downsampleEvenly(time, 60_000);
    expect(a.map((v) => v * 10)).toEqual(b);
  });
});

describe("sanitizeSyncItem", () => {
  it("passes a normal watch item through untouched, with no notes", () => {
    const out = sanitizeSyncItem({
      externalId: "ext-1", externalSource: "app_watch", startedAt: "2026-08-28T12:00:00.000Z",
      durationMinutes: 41, workoutType: "walk", caloriesBurned: 166, stepCount: 4000,
      routeData: { points: [{ lat: 1, lng: 2, t: 0 }] }, metricsData: { hrStream: [100, 110], timeStream: [0, 5] },
    })!;
    expect(out.notes).toEqual([]);
    expect(out.startedAt.toISOString()).toBe("2026-08-28T12:00:00.000Z");
    expect(out.metricsData).toEqual({ hrStream: [100, 110], timeStream: [0, 5] });
  });
  it("defaults what it cannot read instead of rejecting the item", () => {
    const out = sanitizeSyncItem({
      externalId: "x", startedAt: "garbage", endedAt: "2026-08-28T13:00:00Z",
      durationMinutes: "abc", stepCount: 1e15, avgHeartRateBpm: "NaN", workoutType: "walk",
    })!;
    expect(out.startedAt.toISOString()).toBe("2026-08-28T13:00:00.000Z"); // fell back to endedAt
    expect(out.durationMinutes).toBe(0);
    expect(out.stepCount).toBeNull();
    expect(out.avgHeartRateBpm).toBeNull();
    expect(out.notes).toEqual(expect.arrayContaining(["startedAt:invalid", "durationMinutes:invalid", "stepCount:out_of_range", "avgHeartRateBpm:invalid"]));
  });
  it("downsamples an over-cap route and records the trim in metricsData.syncTrimmed", () => {
    const points = Array.from({ length: SYNC_LIMITS.maxRoutePoints + 10_000 }, (_, i) => ({ lat: 1, lng: 2, t: i }));
    const out = sanitizeSyncItem({ externalId: "big", workoutType: "hike", routeData: { summaryPolyline: "p", points } })!;
    const kept = (out.routeData as { points: { t: number }[]; summaryPolyline: string }).points;
    expect(kept).toHaveLength(SYNC_LIMITS.maxRoutePoints);
    expect(kept[0].t).toBe(0);
    expect(kept.at(-1)!.t).toBe(points.length - 1);
    expect((out.routeData as { summaryPolyline: string }).summaryPolyline).toBe("p");
    expect((out.metricsData as { syncTrimmed: unknown }).syncTrimmed).toEqual({
      routePoints: { from: points.length, to: SYNC_LIMITS.maxRoutePoints },
    });
  });
  it("drops the diagnostic trace first when metricsData is over budget", () => {
    const out = sanitizeSyncItem({
      externalId: "rope", workoutType: "jump_rope",
      metricsData: { intervals: { mode: "interval", trace: { b64: "A".repeat(SYNC_LIMITS.maxMetricsBytes + 10) } }, keep: 1 },
    })!;
    const m = out.metricsData as Record<string, unknown>;
    expect((m.intervals as Record<string, unknown>).trace).toBeUndefined();
    expect((m.intervals as Record<string, unknown>).mode).toBe("interval");
    expect(m.keep).toBe(1);
    expect((m.syncTrimmed as { droppedKeys: string[] }).droppedKeys).toEqual(["intervals.trace"]);
  });
  it("truncates over-long strings and caps exercises", () => {
    const out = sanitizeSyncItem({
      externalId: "e".repeat(500), workoutType: "w".repeat(200), description: "d".repeat(20_000),
      exercises: Array.from({ length: 900 }, () => ({ name: "Swing" })),
    })!;
    expect(out.externalId).toHaveLength(SYNC_LIMITS.strings.externalId);
    expect(out.workoutType).toHaveLength(SYNC_LIMITS.strings.workoutType);
    expect(out.description).toHaveLength(SYNC_LIMITS.maxDescription);
    expect(out.exercises).toHaveLength(SYNC_LIMITS.maxExercises);
  });
  it("removes NUL characters Postgres would refuse, everywhere", () => {
    const out = sanitizeSyncItem({ externalId: "n", description: "a\u0000b", exercises: [{ name: "Sw\u0000ing" }] })!;
    expect(out.description).toBe("ab");
    expect(out.exercises).toEqual([{ name: "Swing" }]);
    expect(out.notes).toContain("nul_removed");
    expect(stripNul({ "k\u0000": ["\u0000"] })).toEqual({ k: [""] });
  });
  it("returns null only for something that is not an item at all", () => {
    expect(sanitizeSyncItem(null)).toBeNull();
    expect(sanitizeSyncItem("x")).toBeNull();
    expect(sanitizeSyncItem([1])).toBeNull();
  });
});

describe("isItemDataError", () => {
  it("treats validation and data codes as item-level, connectivity as systemic", () => {
    expect(isItemDataError(new Prisma.PrismaClientValidationError("bad", { clientVersion: "7.0.0" }))).toBe(true);
    expect(isItemDataError(new Prisma.PrismaClientKnownRequestError("too long", { code: "P2000", clientVersion: "7.0.0" }))).toBe(true);
    expect(isItemDataError(new Prisma.PrismaClientKnownRequestError("down", { code: "P1001", clientVersion: "7.0.0" }))).toBe(false);
    expect(isItemDataError(new Error("anything else"))).toBe(false);
  });
});
