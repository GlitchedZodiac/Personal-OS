import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mirrorLegacyFromTargets } from "@/lib/settings-patch";

// GET /api/settings — fetch stored settings
export async function GET() {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return NextResponse.json({ data: null });
    }
    return NextResponse.json({ data: row.data });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ data: null });
  }
}

// Keys in the settings blob that the SERVER owns. The client saves its whole
// local copy of the settings on every change, and that copy can be older
// than these (notification switches are flipped on another screen through
// /api/push/prefs; the device's timezone is written by the heartbeat). A
// blind replace would let any unrelated settings save — units, language —
// silently turn switches back on or move quiet hours to a stale timezone.
// (The Claude connector's finance switch is not in this blob at all — it has
// its own row, lib/mcp-settings.ts.)
// `targets` (2026-11-12, MCP v2): calorie/macro targets are set from the
// Claude connector (update_settings); the app has no targets editor, so a
// whole-blob save from an older local copy must not clobber them — and the
// legacy calorieTarget/*Pct keys are re-derived from them on every save.
const SERVER_OWNED_KEYS = ["notificationPrefs", "targets"] as const;

// PUT /api/settings — save settings
export async function PUT(request: NextRequest) {
  try {
    const incoming = (await request.json()) as Record<string, unknown>;
    const existing = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });
    const current = (existing?.data ?? {}) as Record<string, unknown>;
    let body: Record<string, unknown> = { ...incoming };
    for (const key of SERVER_OWNED_KEYS) {
      if (key in current) body[key] = current[key];
      else delete body[key];
    }
    body = mirrorLegacyFromTargets(body);
    const row = await prisma.userSettings.upsert({
      where: { id: "default" },
      create: { id: "default", data: body as object },
      update: { data: body as object },
    });
    return NextResponse.json({ success: true, data: row.data });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
