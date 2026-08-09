import { prisma } from "@/lib/prisma";
import { downsample, timeInZones, trainingLoad } from "@/lib/zones";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;

// ─── Strava Activity Type → Our Workout Type ──────────────────────────
const ACTIVITY_TYPE_MAP: Record<string, string> = {
  Run: "run",
  Trail_Run: "run",
  VirtualRun: "run",
  Walk: "walk",
  Hike: "hike",
  Ride: "cycling",
  VirtualRide: "cycling",
  MountainBikeRide: "cycling",
  GravelRide: "cycling",
  EBikeRide: "cycling",
  Swim: "swimming",
  WeightTraining: "strength",
  Crossfit: "strength",
  Yoga: "yoga",
  Workout: "other",
  HIIT: "hiit",
  Elliptical: "cardio",
  StairStepper: "cardio",
  Rowing: "cardio",
  Kayaking: "cardio",
  Canoeing: "cardio",
  IceSkate: "cardio",
  RollerSki: "cardio",
  RockClimbing: "strength",
  Soccer: "cardio",
  Tennis: "cardio",
  Badminton: "cardio",
  Pickleball: "cardio",
  Golf: "other",
};

export function mapStravaActivityType(stravaType: string): string {
  return ACTIVITY_TYPE_MAP[stravaType] || "other";
}

// ─── Token Refresh ──────────────────────────────────────────────────
export async function getValidAccessToken(): Promise<string | null> {
  const token = await prisma.stravaToken.findFirst();
  if (!token) return null;

  // If token is still valid (with 5 min buffer), return it
  const now = Math.floor(Date.now() / 1000);
  if (token.expiresAt > now + 300) {
    return token.accessToken;
  }

  // Token expired — refresh it
  try {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("Strava token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();

    // Update stored tokens
    await prisma.stravaToken.update({
      where: { id: token.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
      },
    });

    return data.access_token;
  } catch (err) {
    console.error("Strava token refresh error:", err);
    return null;
  }
}

// ─── Fetch Activities ────────────────────────────────────────────────
export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  elapsed_time: number; // seconds
  moving_time: number; // seconds
  distance: number; // meters
  total_elevation_gain: number; // meters
  calories?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  suffer_score?: number;
  description?: string;
  gear_id?: string;
  achievement_count?: number;
  kudos_count?: number;
  pr_count?: number;
  elev_high?: number;
  elev_low?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  has_heartrate?: boolean;
  map?: {
    summary_polyline?: string;
  };
}

// Polyline decoding moved to lib/polyline.ts (client-safe module).

// ─── Activity Streams (HR / time / altitude) ─────────────────────────
// Powers time-in-zone, training load, and the trail elevation profile.
export interface StravaStreams {
  heartrate?: number[];
  time?: number[];
  altitude?: number[];
}

// Full-resolution streams drive the math; downsampled copies get stored.
export function buildStreamMetrics(
  streams: StravaStreams,
  relativeEffort?: number
) {
  const hr = streams.heartrate ?? [];
  const time = streams.time ?? [];
  const zones = timeInZones(hr, time);
  return {
    hrStream: hr.length ? downsample(hr) : undefined,
    timeStream: time.length ? downsample(time) : undefined,
    altitudeStream: streams.altitude?.length
      ? downsample(streams.altitude)
      : undefined,
    timeInZones: zones ?? undefined,
    loadScore: trainingLoad(zones) ?? undefined,
    relativeEffort,
  };
}

export async function fetchActivityStreams(
  activityId: number | string
): Promise<StravaStreams | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,time,altitude&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      heartrate: data.heartrate?.data,
      time: data.time?.data,
      altitude: data.altitude?.data,
    };
  } catch (err) {
    console.error("Strava streams fetch error:", err);
    return null;
  }
}

export async function fetchStravaActivities(
  page = 1,
  perPage = 30,
  after?: number // unix timestamp
): Promise<StravaActivity[]> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("No valid Strava token");

  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
  });
  if (after) params.set("after", after.toString());

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Strava API error (${res.status}): ${err}`);
  }

  return res.json();
}

// ─── Build Description ───────────────────────────────────────────────
export function buildWorkoutDescription(activity: StravaActivity): string {
  const parts: string[] = [];

  if (activity.name) parts.push(activity.name);

  if (activity.distance > 0) {
    const km = (activity.distance / 1000).toFixed(2);
    const mi = (activity.distance / 1609.34).toFixed(2);
    parts.push(`${km} km (${mi} mi)`);
  }

  if (activity.total_elevation_gain > 0) {
    parts.push(`${Math.round(activity.total_elevation_gain)}m elevation`);
  }

  if (activity.average_heartrate) {
    parts.push(`avg HR ${Math.round(activity.average_heartrate)} bpm`);
  }

  if (activity.average_speed && activity.distance > 0) {
    // Convert m/s to min/km pace for runs/walks
    const type = mapStravaActivityType(activity.type);
    if (type === "run" || type === "walk") {
      const paceMinPerKm = 1000 / 60 / activity.average_speed;
      const paceMin = Math.floor(paceMinPerKm);
      const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
      parts.push(`${paceMin}:${paceSec.toString().padStart(2, "0")} /km pace`);
    } else if (type === "cycling") {
      const speedKmh = activity.average_speed * 3.6;
      parts.push(`${speedKmh.toFixed(1)} km/h avg`);
    }
  }

  return parts.join(" • ");
}
