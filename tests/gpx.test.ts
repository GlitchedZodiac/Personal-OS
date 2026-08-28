import { describe, expect, it } from "vitest";
import { buildGpx } from "@/lib/gpx";

describe("buildGpx", () => {
  const start = "2026-08-27T22:46:45.000Z";

  it("full-res points carry elevation and absolute timestamps", () => {
    const { gpx, trackCount } = buildGpx([
      {
        startedAt: start,
        workoutType: "hike",
        description: "El Cerro de las Tres Cruces",
        routeData: {
          summaryPolyline: "abc",
          points: [
            { lat: 3.4548, lng: -76.5605, alt: 1002.4, t: 0 },
            { lat: 3.4552, lng: -76.561, alt: 1010.1, t: 5 },
            { lat: 3.4556, lng: -76.5615, t: 10 }, // no alt — omit <ele>
          ],
        },
      },
    ]);
    expect(trackCount).toBe(1);
    expect(gpx).toContain('<gpx version="1.1" creator="Pitaya"');
    expect(gpx).toContain("<name>El Cerro de las Tres Cruces</name>");
    expect(gpx).toContain("<type>hike</type>");
    expect(gpx).toContain('<trkpt lat="3.4548" lon="-76.5605">');
    expect(gpx).toContain("<ele>1002.4</ele>");
    expect(gpx).toContain("<time>2026-08-27T22:46:45.000Z</time>");
    expect(gpx).toContain("<time>2026-08-27T22:46:50.000Z</time>"); // start + 5 s
    // The altitude-less point still emits, without an <ele>.
    expect(gpx).toContain('<trkpt lat="3.4556" lon="-76.5615"><time>');
  });

  it("polyline-only rows fall back to coordinate-only trackpoints", () => {
    // Google's canonical example polyline: (38.5,-120.2) → (40.7,-120.95) → …
    const polyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
    const { gpx, trackCount } = buildGpx([
      { startedAt: start, workoutType: "walk", description: null, routeData: { summaryPolyline: polyline } },
    ]);
    expect(trackCount).toBe(1);
    expect(gpx).not.toContain("<ele>");
    expect(gpx).not.toContain("<time>");
    expect(gpx).toContain('lat="38.5" lon="-120.2"');
  });

  it("multiple workouts become multiple tracks; routeless rows are skipped", () => {
    const points = [
      { lat: 3.45, lng: -76.55, t: 0 },
      { lat: 3.451, lng: -76.551, t: 5 },
    ];
    const { gpx, trackCount } = buildGpx([
      { startedAt: start, workoutType: "walk", description: "A & B <walk>", routeData: { points } },
      { startedAt: start, workoutType: "hike", description: null, routeData: { points } },
      { startedAt: start, workoutType: "walk", description: null, routeData: null },
    ]);
    expect(trackCount).toBe(2);
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    // XML-escaped name.
    expect(gpx).toContain("<name>A &amp; B &lt;walk&gt;</name>");
  });
});
