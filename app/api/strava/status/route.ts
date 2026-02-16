import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/strava/status — check if Strava is connected
export async function GET() {
  try {
    const token = await prisma.stravaToken.findFirst();

    if (!token) {
      return NextResponse.json({ connected: false });
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = token.expiresAt <= now;

    // Count synced workouts
    const syncedCount = await prisma.workoutLog.count({
      where: { source: "strava" },
    });

    // Get last sync time
    const lastSynced = await prisma.workoutLog.findFirst({
      where: { source: "strava" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return NextResponse.json({
      connected: true,
      athleteId: token.athleteId,
      athleteName: token.athleteName,
      athletePhoto: token.athletePhoto,
      scope: token.scope,
      tokenExpired: isExpired,
      syncedWorkouts: syncedCount,
      lastSyncedAt: lastSynced?.createdAt || null,
    });
  } catch (err) {
    console.error("Strava status error:", err);
    return NextResponse.json({ connected: false, error: "Failed to check status" });
  }
}

// DELETE /api/strava/status — disconnect Strava
export async function DELETE() {
  try {
    // Deauthorize on Strava's side
    const token = await prisma.stravaToken.findFirst();
    if (token) {
      try {
        await fetch("https://www.strava.com/oauth/deauthorize", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `access_token=${token.accessToken}`,
        });
      } catch {
        // Non-critical — still delete locally
      }

      await prisma.stravaToken.delete({ where: { id: token.id } });
    }

    return NextResponse.json({ disconnected: true });
  } catch (err) {
    console.error("Strava disconnect error:", err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
