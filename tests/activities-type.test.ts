import { describe, expect, it } from "vitest";
import { activityTypeOf, routeDataAllowed } from "@/lib/activities";

// The 2026-08-28 freestyle-integrity rules: stationary session types never
// become outdoor cards on the distance heuristic (HealthKit estimates indoor
// distance, and the stale-GPS leak stamped real kilometres onto them), and
// GPS trails are only legitimate on in-motion types.

describe("activityTypeOf", () => {
  it("freestyle with leaked distance is never an outdoor card", () => {
    expect(
      activityTypeOf({ workoutType: "freestyle", distanceMeters: 3185, metricsData: null })
    ).toBe("kb");
  });

  it("strength with leaked distance stays a kettlebell card", () => {
    expect(
      activityTypeOf({ workoutType: "strength", distanceMeters: 913, metricsData: null })
    ).toBe("kb");
  });

  it("freestyle with rounds reads as a circuit card", () => {
    expect(
      activityTypeOf({
        workoutType: "freestyle",
        distanceMeters: 2600,
        metricsData: { roundsCompleted: 3 },
      })
    ).toBe("cir");
  });

  it("outdoor types are outdoor regardless of distance", () => {
    expect(
      activityTypeOf({ workoutType: "walk", distanceMeters: null, metricsData: null })
    ).toBe("out");
    expect(
      activityTypeOf({ workoutType: "treadmill_walk", distanceMeters: 4023, metricsData: null })
    ).toBe("out");
  });

  it("untyped/legacy rows with distance still read as outdoor work", () => {
    expect(
      activityTypeOf({ workoutType: "cardio", distanceMeters: 5000, metricsData: null })
    ).toBe("out");
  });
});

describe("routeDataAllowed", () => {
  it("allows trails only on in-motion GPS types", () => {
    for (const type of ["walk", "run", "hike", "trail_run", "cycling", "ride"]) {
      expect(routeDataAllowed(type)).toBe(true);
    }
    for (const type of ["freestyle", "strength", "other", "treadmill_walk", "treadmill_run"]) {
      expect(routeDataAllowed(type)).toBe(false);
    }
  });
});
