// Web management for named trails: list, create-or-link (the chat's
// name_trail proposal confirms into POST), rename/alias, delete (workouts
// survive via SetNull). Cookie-gated by proxy.ts like every /api/health/*.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrLinkTrail, listTrails, TrailInputError } from "@/lib/trails";

export async function GET() {
  const trails = await listTrails();
  return NextResponse.json({ trails });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createOrLinkTrail({
      name: typeof body.name === "string" ? body.name : undefined,
      trailId: typeof body.trailId === "string" ? body.trailId : undefined,
      workoutId: typeof body.workoutId === "string" ? body.workoutId : undefined,
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
    console.error("Trail save error:", error);
    return NextResponse.json({ error: "Failed to save trail" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const data: { name?: string; aliases?: string[] } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (Array.isArray(body.aliases)) {
      data.aliases = body.aliases
        .filter((a: unknown): a is string => typeof a === "string")
        .map((a: string) => a.trim())
        .filter(Boolean);
    }
    const trail = await prisma.trail.update({ where: { id }, data });
    return NextResponse.json({ trail: { id: trail.id, name: trail.name, aliases: trail.aliases } });
  } catch (error) {
    console.error("Trail update error:", error);
    return NextResponse.json({ error: "Failed to update trail" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await prisma.trail.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Trail delete error:", error);
    return NextResponse.json({ error: "Failed to delete trail" }, { status: 500 });
  }
}
