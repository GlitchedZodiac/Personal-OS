import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse as parseDate } from "date-fns";

/**
 * VeSync Smart Scale CSV Import
 *
 * Accepts CSV text (multipart form-data with file, or raw text body)
 * from VeSync app export and imports body composition measurements.
 *
 * CSV columns:
 * Time, Weight, BMI, Body Fat, Fat-Free Body Weight, Subcutaneous Fat,
 * Visceral Fat, Body Water, Skeletal Muscles, Muscle Mass, Bone Mass,
 * Protein, BMR, Metabolic Age, Heart Rate
 */

interface VeSyncRow {
  time: string;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  fatFreeWeightKg: number | null;
  subcutaneousFatPct: number | null;
  visceralFat: number | null;
  bodyWaterPct: number | null;
  skeletalMusclePct: number | null;
  muscleMassKg: number | null;
  boneMassKg: number | null;
  proteinPct: number | null;
  bmrKcal: number | null;
  metabolicAge: number | null;
  heartRateBpm: number | null;
}

function parseVeSyncValue(raw: string): number | null {
  if (!raw || raw.trim() === "--" || raw.trim() === "") return null;
  // Remove units like kg, %, kcal, bpm
  const cleaned = raw.replace(/kg|%|kcal|bpm/gi, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseVeSyncTime(timeStr: string): Date | null {
  // Format: "15/02/2026, 7:41 AM" (DD/MM/YYYY, h:mm AM/PM)
  // Remove surrounding quotes if present
  // VeSync uses U+202F (narrow no-break space) before AM/PM — normalize to regular space
  const cleaned = timeStr
    .replace(/^"|"$/g, "")
    .replace(/[\u00A0\u202F\u2009\u200A]/g, " ") // normalize special whitespace
    .trim();
  try {
    const result = parseDate(cleaned, "d/MM/yyyy, h:mm a", new Date());
    if (isNaN(result.getTime())) throw new Error("Invalid date");
    return result;
  } catch {
    try {
      const result = parseDate(cleaned, "dd/MM/yyyy, h:mm a", new Date());
      if (isNaN(result.getTime())) throw new Error("Invalid date");
      return result;
    } catch {
      console.warn(`[VeSync] Could not parse time: "${cleaned}"`);
      return null;
    }
  }
}

function parseCSV(csvText: string): VeSyncRow[] {
  // Normalize special whitespace characters (VeSync uses U+202F narrow no-break space)
  const normalized = csvText.replace(/[\u00A0\u202F\u2009\u200A]/g, " ");
  const lines = normalized.trim().split("\n");
  if (lines.length < 2) return [];

  // Skip header row
  const rows: VeSyncRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV has quoted time field with comma inside, so we need careful parsing
    // Pattern: "DD/MM/YYYY, H:MM AM",value,value,...
    const match = line.match(/^"([^"]+)",(.+)$/);
    if (!match) continue;

    const timeStr = match[1];
    const rest = match[2].split(",").map((s) => s.trim());

    if (rest.length < 14) continue;

    rows.push({
      time: timeStr,
      weightKg: parseVeSyncValue(rest[0]),
      bmi: parseVeSyncValue(rest[1]),
      bodyFatPct: parseVeSyncValue(rest[2]),
      fatFreeWeightKg: parseVeSyncValue(rest[3]),
      subcutaneousFatPct: parseVeSyncValue(rest[4]),
      visceralFat: parseVeSyncValue(rest[5]),
      bodyWaterPct: parseVeSyncValue(rest[6]),
      skeletalMusclePct: parseVeSyncValue(rest[7]),
      muscleMassKg: parseVeSyncValue(rest[8]),
      boneMassKg: parseVeSyncValue(rest[9]),
      proteinPct: parseVeSyncValue(rest[10]),
      bmrKcal: parseVeSyncValue(rest[11]),
      metabolicAge: parseVeSyncValue(rest[12]),
      heartRateBpm: parseVeSyncValue(rest[13]),
    });
  }

  return rows;
}

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

    // Check for existing measurements to avoid duplicates
    // Get the date range from the CSV
    const parsedDates = rows
      .map((r) => parseVeSyncTime(r.time))
      .filter((d): d is Date => d !== null);

    if (parsedDates.length === 0) {
      return NextResponse.json(
        { error: "Could not parse any dates from CSV" },
        { status: 400 }
      );
    }

    const minDate = new Date(Math.min(...parsedDates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...parsedDates.map((d) => d.getTime())));

    // Find existing measurements in this date range
    const existing = await prisma.bodyMeasurement.findMany({
      where: {
        measuredAt: {
          gte: new Date(minDate.getTime() - 60000), // 1 min tolerance
          lte: new Date(maxDate.getTime() + 60000),
        },
        source: "vesync",
      },
      select: { measuredAt: true },
    });

    const existingTimes = new Set(
      existing.map((e) => Math.floor(e.measuredAt.getTime() / 60000)) // minute precision
    );

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    const now = new Date();

    for (const row of rows) {
      const measuredAt = parseVeSyncTime(row.time);
      if (!measuredAt) {
        errors++;
        errorMessages.push(`Could not parse time: "${row.time}"`);
        continue;
      }

      // Skip if we already have a measurement at this time
      const timeKey = Math.floor(measuredAt.getTime() / 60000);
      if (existingTimes.has(timeKey)) {
        skipped++;
        continue;
      }

      // Skip rows with zero useful data (just weight with no composition)
      const hasData = row.weightKg !== null;
      if (!hasData) {
        skipped++;
        continue;
      }

      try {
        await prisma.bodyMeasurement.create({
          data: {
            measuredAt,
            weightKg: row.weightKg,
            bmi: row.bmi,
            bodyFatPct: row.bodyFatPct,
            fatFreeWeightKg: row.fatFreeWeightKg,
            subcutaneousFatPct: row.subcutaneousFatPct,
            visceralFat: row.visceralFat != null ? Math.round(row.visceralFat) : null,
            bodyWaterPct: row.bodyWaterPct,
            skeletalMusclePct: row.skeletalMusclePct,
            muscleMassKg: row.muscleMassKg,
            boneMassKg: row.boneMassKg,
            proteinPct: row.proteinPct,
            bmrKcal: row.bmrKcal != null ? Math.round(row.bmrKcal) : null,
            metabolicAge: row.metabolicAge != null ? Math.round(row.metabolicAge) : null,
            heartRateBpm: row.heartRateBpm != null ? Math.round(row.heartRateBpm) : null,
            source: "vesync",
            updatedAt: now,
          },
        });
        imported++;
        existingTimes.add(timeKey); // Prevent intra-batch duplicates
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
      skipped,
      errors,
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
