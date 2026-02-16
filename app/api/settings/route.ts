import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// PUT /api/settings — save settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const row = await prisma.userSettings.upsert({
      where: { id: "default" },
      create: { id: "default", data: body },
      update: { data: body },
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
