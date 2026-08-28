// GPX 1.1 export (2026-08-28): the standard interchange for GPS tracks, so a
// recorded hike opens in any mapping tool. Watch-recorded rows carry full-res
// points (lat/lng/alt/elapsed-s) and emit <ele>/<time>; polyline-only rows
// (Strava imports) emit coordinate-only trackpoints. Multiple <trk> per file
// is valid GPX, so the bulk export is one file, no zip dependency.

import { decodePolyline } from "@/lib/polyline";

export interface GpxWorkout {
  startedAt: string | Date;
  workoutType?: string | null;
  description?: string | null;
  routeData: {
    summaryPolyline?: string | null;
    points?: Array<{ lat?: number; lng?: number; alt?: number | null; t?: number }> | null;
  } | null;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trackFor(workout: GpxWorkout): string | null {
  const startedAt = new Date(workout.startedAt);
  const startMs = startedAt.getTime();
  const name =
    workout.description?.trim() ||
    `${workout.workoutType ?? "workout"} · ${
      Number.isFinite(startMs) ? startedAt.toISOString().slice(0, 10) : ""
    }`.trim();

  const points = Array.isArray(workout.routeData?.points)
    ? workout.routeData.points.filter(
        (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)
      )
    : [];

  let body = "";
  if (points.length >= 2) {
    body = points
      .map((p) => {
        const ele =
          typeof p.alt === "number" && Number.isFinite(p.alt)
            ? `<ele>${p.alt.toFixed(1)}</ele>`
            : "";
        const time =
          Number.isFinite(startMs) && typeof p.t === "number"
            ? `<time>${new Date(startMs + p.t * 1000).toISOString()}</time>`
            : "";
        return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}${time}</trkpt>`;
      })
      .join("\n");
  } else if (workout.routeData?.summaryPolyline) {
    let decoded: [number, number][] = [];
    try {
      decoded = decodePolyline(workout.routeData.summaryPolyline);
    } catch {
      decoded = [];
    }
    if (decoded.length < 2) return null;
    body = decoded
      .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
      .join("\n");
  } else {
    return null;
  }

  const type = workout.workoutType ? `\n    <type>${esc(workout.workoutType)}</type>` : "";
  return `  <trk>\n    <name>${esc(name)}</name>${type}\n    <trkseg>\n${body}\n    </trkseg>\n  </trk>`;
}

export function buildGpx(workouts: GpxWorkout[]): { gpx: string; trackCount: number } {
  const tracks = workouts
    .map(trackFor)
    .filter((t): t is string => t != null);
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pitaya" xmlns="http://www.topografix.com/GPX/1/1">
${tracks.join("\n")}
</gpx>
`;
  return { gpx, trackCount: tracks.length };
}
