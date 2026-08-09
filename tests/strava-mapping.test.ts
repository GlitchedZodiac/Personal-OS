import { describe, expect, it } from "vitest";
import { mapStravaActivityType } from "@/lib/strava";
import { decodePolyline } from "@/lib/polyline";

describe("mapStravaActivityType", () => {
  it("maps common activities to app workout types", () => {
    expect(mapStravaActivityType("Run")).toBe("run");
    expect(mapStravaActivityType("WeightTraining")).toBe("strength");
    expect(mapStravaActivityType("Ride")).toBe("cycling");
    expect(mapStravaActivityType("Hike")).toBe("hike");
  });

  it("falls back to 'other' for unknown types", () => {
    expect(mapStravaActivityType("UnderwaterBasketWeaving")).toBe("other");
  });
});

describe("decodePolyline", () => {
  it("decodes the canonical Google example", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    const [[aLat, aLng], [bLat, bLng], [cLat, cLng]] = points;
    expect(aLat).toBeCloseTo(38.5, 5);
    expect(aLng).toBeCloseTo(-120.2, 5);
    expect(bLat).toBeCloseTo(40.7, 5);
    expect(bLng).toBeCloseTo(-120.95, 5);
    expect(cLat).toBeCloseTo(43.252, 5);
    expect(cLng).toBeCloseTo(-126.453, 5);
  });

  it("returns [] for an empty polyline", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
