import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  COMPOSITION_FIELDS,
  NEAR_KG,
  NEAR_MS,
  detectDateFormat,
  parseCSV,
  parseVeSyncTime,
  roundIfInt,
  type VeSyncRow,
} from "@/lib/vesync";

export const maxDuration = 60;

// VeSync Smart Scale CSV import — POST a CSV (multipart file or raw
// {csvText}). All parsing/format/merge decisions live in lib/vesync.ts;
// this route owns the DB writes: create new readings as source "vesync",
// fill-merge composition onto near-minute twins (manual voice-logs of the
// same weigh-in), never overwrite a stored value.

export async function POST(request: NextRequest) {
  try {
    let csvText: string;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      const body = await request.json();
      csvText = body.csvText;
    }

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json({ error: "No CSV data provided" }, { status: 400 });
    }

    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV. Expected VeSync export format." },
        { status: 400 }
      );
    }

    const format = detectDateFormat(rows.map((r) => r.time));
    if (format === "conflict") {
      return NextResponse.json(
        { error: "Ambiguous dates: file mixes MM/DD and DD/MM rows" },
        { status: 400 }
      );
    }

    const timeZone = await getUserTimeZone(null);

    const parsed = rows
      .map((row) => ({ row, measuredAt: parseVeSyncTime(row.time, format, timeZone) }))
      .filter((p): p is { row: VeSyncRow; measuredAt: Date } => p.measuredAt !== null);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Could not parse any dates from CSV" },
        { status: 400 }
      );
    }

    const minDate = new Date(Math.min(...parsed.map((p) => p.measuredAt.getTime())));
    const maxDate = new Date(Math.max(...parsed.map((p) => p.measuredAt.getTime())));

    // Every stored weigh-in near the CSV's range, ANY source — manual rows
    // logged off this same scale must not re-import as duplicates.
    const existing = await prisma.bodyMeasurement.findMany({
      where: {
        measuredAt: {
          gte: new Date(minDate.getTime() - NEAR_MS),
          lte: new Date(maxDate.getTime() + NEAR_MS),
        },
        weightKg: { not: null },
      },
    });

    let imported = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Oldest first so intra-batch near-duplicate collapsing is deterministic.
    parsed.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());

    type Stored = {
      id: string;
      measuredAt: Date;
      weightKg: number | null;
      fields: Partial<Record<(typeof COMPOSITION_FIELDS)[number], number | null>>;
    };
    const stored: Stored[] = existing.map((e) => ({
      id: e.id,
      measuredAt: e.measuredAt,
      weightKg: e.weightKg,
      fields: Object.fromEntries(COMPOSITION_FIELDS.map((f) => [f, e[f]])),
    }));

    for (const { row, measuredAt } of parsed) {
      if (row.weightKg == null) {
        skipped++;
        continue;
      }

      const twin = stored.find(
        (s) =>
          s.weightKg != null &&
          Math.abs(s.measuredAt.getTime() - measuredAt.getTime()) <= NEAR_MS &&
          Math.abs(s.weightKg - row.weightKg!) <= NEAR_KG
      );

      try {
        if (twin) {
          // Same weigh-in already recorded — fill any composition fields it
          // lacks (never overwrite a stored value), create nothing.
          const fill: Record<string, number> = {};
          for (const field of COMPOSITION_FIELDS) {
            const incoming = roundIfInt(field, row[field]);
            if (incoming != null && twin.fields[field] == null) {
              fill[field] = incoming;
              twin.fields[field] = incoming;
            }
          }
          if (Object.keys(fill).length > 0) {
            await prisma.bodyMeasurement.update({ where: { id: twin.id }, data: fill });
            merged++;
          } else {
            skipped++;
          }
          continue;
        }

        const created = await prisma.bodyMeasurement.create({
          data: {
            measuredAt,
            weightKg: row.weightKg,
            ...Object.fromEntries(
              COMPOSITION_FIELDS.map((f) => [f, roundIfInt(f, row[f])])
            ),
            source: "vesync",
          },
        });
        stored.push({
          id: created.id,
          measuredAt,
          weightKg: row.weightKg,
          fields: Object.fromEntries(
            COMPOSITION_FIELDS.map((f) => [f, roundIfInt(f, row[f])])
          ),
        });
        imported++;
      } catch (err: unknown) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorMessages.push(`Row "${row.time}": ${msg.slice(0, 200)}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      imported,
      merged,
      skipped,
      errors,
      dateFormat: format,
      timeZone,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      dateRange: {
        from: minDate.toISOString(),
        to: maxDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("VeSync import error:", error);
    return NextResponse.json(
      { error: "Failed to import VeSync data" },
      { status: 500 }
    );
  }
}
