import { NextResponse } from "next/server";
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

        await prisma.workoutLog.create({
          data: {
            startedAt: new Date(activity.start_date_local || activity.start_date),
            durationMinutes,
            workoutType,
            description,
            caloriesBurned: calories,
            stravaActivityId: stravaId,
            source: "strava",
            exercises: activity.distance > 0
              ? [
                  {
                    name: activity.name || activity.type,
                    distance: activity.distance,
                    elevationGain: activity.total_elevation_gain,
                    avgHeartrate: activity.average_heartrate,
                    maxHeartrate: activity.max_heartrate,
                    avgSpeed: activity.average_speed,
                    maxSpeed: activity.max_speed,
                    sufferScore: activity.suffer_score,
                  },
                ]
              : null,
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
