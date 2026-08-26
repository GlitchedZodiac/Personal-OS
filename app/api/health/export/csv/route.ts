import { NextRequest, NextResponse } from "next/server";
import { buildHealthExport } from "@/lib/health-export";
import {
  HEALTH_CSV_DATASETS,
  HEALTH_CSV_KEYS,
  buildHealthCsv,
  healthCsvFilename,
  isHealthCsvDatasetKey,
} from "@/lib/health-csv";
import { withRequestPrisma } from "@/lib/prisma-request";
import { getDateStringInTimeZone } from "@/lib/timezone";

// Sibling of ../route.ts rather than a ?format=csv branch on it: the contract
// genuinely differs — a required dataset with a 400 path, a different content
// type and filename scheme, and photo/route payloads forced off (base64 and GPS
// arrays have no business in a spreadsheet).
//
// Gated by proxy.ts like every other /api route — only /api/auth, /api/cron/*,
// /api/mobile/* and the OAuth callbacks are exempt.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get("dataset");

    if (!isHealthCsvDatasetKey(dataset)) {
      // Doubles as discovery — no separate listing route needed.
      return NextResponse.json(
        {
          error: dataset
            ? `Unknown dataset "${dataset}".`
            : "Missing required ?dataset= parameter.",
          allowed: HEALTH_CSV_KEYS.map((key) => ({
            key,
            label: HEALTH_CSV_DATASETS[key].label,
            description: HEALTH_CSV_DATASETS[key].description,
          })),
        },
        { status: 400 }
      );
    }

    const payload = await withRequestPrisma((db) =>
      buildHealthExport(db, {
        range: searchParams.get("range"),
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        timeZone: searchParams.get("timeZone"),
        includeProgressPhotoData: false,
        includeWorkoutRoutes: false,
      })
    );

    const timeZone = payload.requestedRange.timeZone;
    const { csv, rowCount } = buildHealthCsv(payload, dataset, {
      // es-CO Excel uses ";" as the list separator; Sheets is fine either way.
      delimiter: searchParams.get("delimiter") === "semicolon" ? ";" : ",",
      bom: searchParams.get("bom") !== "false",
    });

    const stamp = getDateStringInTimeZone(new Date(), timeZone);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${healthCsvFilename(dataset, stamp)}"`,
        "X-Row-Count": String(rowCount),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Health CSV export error:", error);
    return NextResponse.json(
      { error: "Failed to build health CSV export" },
      { status: 500 }
    );
  }
}
