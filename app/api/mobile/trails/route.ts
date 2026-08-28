// Wrist surface for named trails (§Trails, 2026-08-28). GET lists trails —
// optionally ranked by proximity to a just-finished track's start — and POST
// is the "save this track?" action: create-or-link by name, or link straight
// to a suggested trailId. Bearer-authed like every /api/mobile/* route.

import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { createOrLinkTrail, listTrails, TrailInputError } from "@/lib/trails";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get("nearLat"));
  const lng = Number(sp.get("nearLng"));
  const dist = Number(sp.get("distanceMeters"));
  const near =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, distanceMeters: Number.isFinite(dist) ? dist : null }
      : undefined;

  const trails = await listTrails(near);
  return NextResponse.json({ trails, updatedAt: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createOrLinkTrail({
      name: typeof body.name === "string" ? body.name : undefined,
      trailId: typeof body.trailId === "string" ? body.trailId : undefined,
      workoutExternalId:
        typeof body.workoutExternalId === "string"
          ? body.workoutExternalId
          : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrailInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Mobile trail save error:", error);
    return NextResponse.json({ error: "Failed to save trail" }, { status: 500 });
  }
}
