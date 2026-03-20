import { NextRequest, NextResponse } from "next/server";
import { buildHealthExport } from "@/lib/health-export";
import { withRequestPrisma } from "@/lib/prisma-request";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const timeZone = searchParams.get("timeZone");
    const includeProgressPhotoData =
      searchParams.get("includeProgressPhotoData") === "true";
    const includeWorkoutRoutes =
      searchParams.get("includeWorkoutRoutes") === "true";
    const download = searchParams.get("download") === "true";

    const payload = await withRequestPrisma((db) =>
      buildHealthExport(db, {
        range,
        from,
        to,
        timeZone,
        includeProgressPhotoData,
        includeWorkoutRoutes,
      })
    );

    if (download) {
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="personal-os-health-export.json"',
        },
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Health export error:", error);
    return NextResponse.json(
      { error: "Failed to build health export" },
      { status: 500 }
    );
  }
}
