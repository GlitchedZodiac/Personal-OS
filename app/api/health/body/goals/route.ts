import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { readGoals } from "@/lib/body-summary";
import { prisma } from "@/lib/prisma";

// PUT { weightKg, bodyFatPct, byDate } — the Body screen's targets.
//
// Stored inside user_settings.data.healthGoals, but written by merging on the
// server rather than through PUT /api/settings: that route replaces the whole
// settings object with whatever the device has cached, and a device holding a
// stale copy would silently erase everything else.

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const goals = readGoals({ healthGoals: body });
    if (goals.weightKg < 40 || goals.weightKg > 200 || goals.bodyFatPct < 3 || goals.bodyFatPct > 60) {
      return NextResponse.json({ error: "Target out of range" }, { status: 400 });
    }

    const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
    const data = {
      ...((row?.data as Prisma.JsonObject | null) ?? {}),
      healthGoals: { ...goals },
    } satisfies Prisma.InputJsonObject;
    await prisma.userSettings.upsert({
      where: { id: "default" },
      create: { id: "default", data },
      update: { data },
    });
    return NextResponse.json({ goals });
  } catch (error) {
    console.error("Body goals save error:", error);
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 });
  }
}
