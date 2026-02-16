import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fetchStravaActivities,
  mapStravaActivityType,
  buildWorkoutDescription,
  type StravaActivity,
} from "@/lib/strava";

// POST /api/strava/sync — sync activities from Strava
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fullSync = body.fullSync === true; // sync all history vs just recent

    // Check connection
    const token = await prisma.stravaToken.findFirst();
    if (!token) {
      return NextResponse.json({ error: "Strava not connected" }, { status: 400 });
    }

    // Determine the "after" timestamp
    let after: number | undefined;
    if (!fullSync) {
      // Get the most recent Strava workout we already have
      const lastImported = await prisma.workoutLog.findFirst({
        where: { source: "strava" },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      });

      if (lastImported) {
        // Fetch activities after the last imported one (minus 1 hour buffer)
        after = Math.floor(lastImported.startedAt.getTime() / 1000) - 3600;
      }
    }

    // Fetch all pages of activities
    let allActivities: StravaActivity[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const activities = await fetchStravaActivities(page, perPage, after);
      if (activities.length === 0) break;
      allActivities = allActivities.concat(activities);
      if (activities.length < perPage) break; // last page
      page++;

      // Safety: max 10 pages (1000 activities per sync)
      if (page > 10) break;
    }

    if (allActivities.length === 0) {
      return NextResponse.json({
        synced: 0,
        skipped: 0,
        message: "No new activities found on Strava",
      });
    }

    // Get all existing strava activity IDs to avoid duplicates
    const existingIds = new Set(
      (
        await prisma.workoutLog.findMany({
          where: { source: "strava" },
          select: { stravaActivityId: true },
        })
      )
        .map((w) => w.stravaActivityId)
        .filter(Boolean)
    );

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const activity of allActivities) {
      const stravaId = activity.id.toString();

      if (existingIds.has(stravaId)) {
        skipped++;
        continue;
      }

      try {
        const workoutType = mapStravaActivityType(activity.type || activity.sport_type);
        const durationMinutes = Math.round((activity.moving_time || activity.elapsed_time) / 60);
        const description = buildWorkoutDescription(activity);

        // Estimate calories if Strava doesn't provide them
        let calories = activity.calories || null;
        if (!calories && durationMinutes > 0) {
          // Rough estimate: ~5-10 cal/min depending on activity
          const calPerMin: Record<string, number> = {
            run: 10,
            cycling: 8,
            swimming: 9,
            walk: 5,
            strength: 7,
            hiit: 12,
            cardio: 8,
            yoga: 3,
            other: 6,
          };
          calories = durationMinutes * (calPerMin[workoutType] || 6);
        }

        // Build rich exercise data with all Strava metrics
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exerciseData: Record<string, any> = {
          name: activity.name || activity.type,
          stravaType: activity.type,
          sportType: activity.sport_type,
        };

        // Distance & elevation
        if (activity.distance > 0) {
          exerciseData.distance = activity.distance;
          exerciseData.distanceKm = +(activity.distance / 1000).toFixed(2);
          exerciseData.distanceMi = +(activity.distance / 1609.34).toFixed(2);
        }
        if (activity.total_elevation_gain > 0) {
          exerciseData.elevationGain = activity.total_elevation_gain;
        }
        if (activity.elev_high) exerciseData.elevHigh = activity.elev_high;
        if (activity.elev_low) exerciseData.elevLow = activity.elev_low;

        // Heart rate
        if (activity.average_heartrate) exerciseData.avgHeartrate = activity.average_heartrate;
        if (activity.max_heartrate) exerciseData.maxHeartrate = activity.max_heartrate;

        // Speed & pace
        if (activity.average_speed) exerciseData.avgSpeed = activity.average_speed;
        if (activity.max_speed) exerciseData.maxSpeed = activity.max_speed;

        // Power & cadence
        if (activity.average_watts) exerciseData.avgWatts = activity.average_watts;
        if (activity.max_watts) exerciseData.maxWatts = activity.max_watts;
        if (activity.average_cadence) exerciseData.avgCadence = activity.average_cadence;

        // Social & achievements
        if (activity.suffer_score) exerciseData.sufferScore = activity.suffer_score;
        if (activity.achievement_count) exerciseData.achievements = activity.achievement_count;
        if (activity.kudos_count) exerciseData.kudos = activity.kudos_count;
        if (activity.pr_count) exerciseData.prs = activity.pr_count;

        // Route map polyline
        if (activity.map?.summary_polyline) {
          exerciseData.polyline = activity.map.summary_polyline;
        }

        // Time data
        exerciseData.movingTime = activity.moving_time;
        exerciseData.elapsedTime = activity.elapsed_time;

        // Strava's start_date_local is already in local time but may include "Z" suffix.
        // Strip the Z so JavaScript doesn't re-interpret it as UTC.
        const localDateStr = (activity.start_date_local || activity.start_date).replace(/Z$/i, "");

        await prisma.workoutLog.create({
          data: {
            startedAt: new Date(localDateStr),
            durationMinutes,
            workoutType,
            description,
            caloriesBurned: calories,
            stravaActivityId: stravaId,
            source: "strava",
            exercises: [exerciseData] as Prisma.InputJsonValue,
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Activity ${stravaId}: ${msg}`);
      }
    }

    return NextResponse.json({
      synced,
      skipped,
      total: allActivities.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${synced} activities${skipped > 0 ? `, skipped ${skipped} duplicates` : ""}`,
    });
  } catch (err) {
    console.error("Strava sync error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
