import { NextRequest, NextResponse } from "next/server";
import { type SummaryRow, buildBodySummary } from "@/lib/body-summary";
import { BODY_START } from "@/lib/body-view";
import { prisma } from "@/lib/prisma";
import { renphoSyncStatus } from "@/lib/renpho-sync";
import { getUserTimeZone } from "@/lib/server-timezone";

// GET ?tz= — everything the Body screen draws, in one payload: daily series
// for each scale metric since the start, the tape, the latest segmental
// reading, targets, logged milestones and the sync state. The arithmetic the
// cards need (pace, bands, the matrix) is done on the client from these
// series, by lib/body-view.ts.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));

    const [rows, settings, milestones, sync, scaleRow] = await Promise.all([
      prisma.bodyMeasurement.findMany({
        // A day of slack either side of the start so a time-zone edge cannot
        // drop the first reading; the builder filters by local day.
        where: { measuredAt: { gte: new Date(`${BODY_START.day}T00:00:00Z`) } },
        orderBy: { measuredAt: "asc" },
        omit: { rawPayload: true, impedance: true, skinfoldData: true, notes: true },
      }),
      prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
      prisma.bodyMilestone.findMany({ orderBy: { day: "asc" } }),
      renphoSyncStatus(),
      prisma.bodyMeasurement.findFirst({
        where: { externalId: { startsWith: "renpho:" } },
        orderBy: { measuredAt: "desc" },
        select: { rawPayload: true },
      }),
    ]);

    const data = (settings?.data ?? null) as Record<string, unknown> | null;
    const birthYear = typeof data?.birthYear === "number" ? data.birthYear : null;
    const scaleAge = Number((scaleRow?.rawPayload as Record<string, unknown> | null)?.measureAge);

    return NextResponse.json(
      buildBodySummary({
        rows: rows as unknown as SummaryRow[],
        timeZone,
        now: new Date(),
        settingsData: data,
        birthYear,
        scaleAge: Number.isFinite(scaleAge) && scaleAge > 0 ? scaleAge : null,
        loggedMilestones: milestones,
        sync: {
          enabled: sync.enabled,
          lastRunAt: sync.lastRunAt ? sync.lastRunAt.toISOString() : null,
          lastRunOk: sync.lastRunOk,
        },
      })
    );
  } catch (error) {
    console.error("Body summary error:", error);
    return NextResponse.json({ error: "Failed to load the body summary" }, { status: 500 });
  }
}
