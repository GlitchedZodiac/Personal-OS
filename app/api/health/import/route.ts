import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Bulk Import API
 *
 * Accepts a JSON body with arrays of historical data:
 * {
 *   foodLogs?: Array<{ loggedAt, mealType, foodDescription, calories, proteinG, carbsG, fatG, notes? }>
 *   workouts?: Array<{ startedAt, durationMinutes, workoutType, description?, caloriesBurned?, exercises? }>
 *   measurements?: Array<{ measuredAt, weightKg?, bodyFatPct?, waistCm?, chestCm?, armsCm?, legsCm?, hipsCm?, shouldersCm?, neckCm?, forearmsCm?, calvesCm?, skinfoldData?, notes? }>
 *   waterLogs?: Array<{ loggedAt, amountMl }>
 * }
 *
 * All date fields accept ISO 8601 strings (e.g. "2025-12-15T08:30:00Z" or "2025-12-15").
 * Returns counts of successfully imported records.
 */

// Retry a function up to `retries` times with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isConnectionError =
        err instanceof Error && (err.message.includes("P1001") || err.message.includes("Can't reach database"));
      if (!isConnectionError || attempt === retries - 1) throw err;
      console.warn(`DB connection failed (attempt ${attempt + 1}/${retries}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

// Helper: try createMany first, fall back to individual creates on failure
async function batchCreateWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createMany: (data: any[]) => Promise<{ count: number }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createOne: (data: any) => Promise<unknown>,
): Promise<{ imported: number; errors: number; errorMessages: string[] }> {
  try {
    // Try batch first for performance (with retry for transient DB issues)
    const result = await withRetry(() => createMany(items));
    return { imported: result.count, errors: 0, errorMessages: [] };
  } catch (batchErr) {
    console.warn("Batch insert failed, falling back to individual inserts:", batchErr);

    // Fall back to one-by-one inserts so only truly bad records fail
    let imported = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        await withRetry(() => createOne(items[i]));
        imported++;
      } catch (err: unknown) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorMessages.push(`Entry ${i + 1}: ${msg.slice(0, 200)}`);
      }
    }

    return { imported, errors, errorMessages };
  }
}

type NumericLike = number | string;

interface ImportFoodEntry {
  loggedAt?: string;
  mealType?: string;
  foodDescription?: string;
  name?: string;
  food?: string;
  calories?: NumericLike;
  proteinG?: NumericLike;
  protein?: NumericLike;
  carbsG?: NumericLike;
  carbs?: NumericLike;
  fatG?: NumericLike;
  fat?: NumericLike;
  notes?: string | null;
}

interface ImportWorkoutEntry {
  startedAt?: string;
  durationMinutes?: NumericLike;
  duration?: NumericLike;
  workoutType?: string;
  type?: string;
  description?: string | null;
  name?: string;
  caloriesBurned?: NumericLike | null;
  exercises?: unknown;
}

interface ImportMeasurementEntry {
  measuredAt?: string;
  weightKg?: NumericLike | null;
  bodyFatPct?: NumericLike | null;
  waistCm?: NumericLike | null;
  chestCm?: NumericLike | null;
  armsCm?: NumericLike | null;
  legsCm?: NumericLike | null;
  hipsCm?: NumericLike | null;
  shouldersCm?: NumericLike | null;
  neckCm?: NumericLike | null;
  forearmsCm?: NumericLike | null;
  calvesCm?: NumericLike | null;
  skinfoldData?: unknown;
  notes?: string | null;
  bmi?: NumericLike | null;
  fatFreeWeightKg?: NumericLike | null;
  subcutaneousFatPct?: NumericLike | null;
  visceralFat?: NumericLike | null;
  bodyWaterPct?: NumericLike | null;
  skeletalMusclePct?: NumericLike | null;
  muscleMassKg?: NumericLike | null;
  boneMassKg?: NumericLike | null;
  proteinPct?: NumericLike | null;
  bmrKcal?: NumericLike | null;
  metabolicAge?: NumericLike | null;
  heartRateBpm?: NumericLike | null;
  source?: string;
}

interface ImportWaterEntry {
  loggedAt?: string;
  amountMl?: NumericLike;
  amount?: NumericLike;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const results: Record<string, { imported: number; errors: number; errorMessages?: string[] }> = {};

    // ─── Food Logs ──────────────────────────────────────────────
    if (Array.isArray(body.foodLogs) && body.foodLogs.length > 0) {
      const now = new Date();
      const mapped = (body.foodLogs as ImportFoodEntry[]).map((entry) => ({
        loggedAt: entry.loggedAt ? new Date(entry.loggedAt) : new Date(),
        mealType: entry.mealType || "snack",
        foodDescription: entry.foodDescription || entry.name || entry.food || "Unknown food",
        calories: Number(entry.calories) || 0,
        proteinG: Number(entry.proteinG ?? entry.protein) || 0,
        carbsG: Number(entry.carbsG ?? entry.carbs) || 0,
        fatG: Number(entry.fatG ?? entry.fat) || 0,
        notes: entry.notes || null,
        source: "import",
        updatedAt: now,
      }));

      const result = await batchCreateWithFallback(
        mapped,
        (data) => prisma.foodLog.createMany({ data }),
        (data) => prisma.foodLog.create({ data }),
      );

      results.foodLogs = result;
    }

    // ─── Workouts ───────────────────────────────────────────────
    if (Array.isArray(body.workouts) && body.workouts.length > 0) {
      const now = new Date();
      const mapped = (body.workouts as ImportWorkoutEntry[]).map((entry) => ({
        startedAt: entry.startedAt ? new Date(entry.startedAt) : new Date(),
        durationMinutes: Number(entry.durationMinutes ?? entry.duration) || 0,
        workoutType: entry.workoutType || entry.type || "strength",
        description: entry.description || entry.name || null,
        caloriesBurned: entry.caloriesBurned != null ? Number(entry.caloriesBurned) : null,
        exercises: entry.exercises || null,
        source: "import",
        updatedAt: now,
      }));

      const result = await batchCreateWithFallback(
        mapped,
        (data) => prisma.workoutLog.createMany({ data }),
        (data) => prisma.workoutLog.create({ data }),
      );

      results.workouts = result;
    }

    // ─── Body Measurements ──────────────────────────────────────
    if (Array.isArray(body.measurements) && body.measurements.length > 0) {
      const now = new Date();
      const mapped = (body.measurements as ImportMeasurementEntry[]).map((entry) => ({
        measuredAt: entry.measuredAt ? new Date(entry.measuredAt) : new Date(),
        weightKg: entry.weightKg != null ? Number(entry.weightKg) : null,
        bodyFatPct: entry.bodyFatPct != null ? Number(entry.bodyFatPct) : null,
        waistCm: entry.waistCm != null ? Number(entry.waistCm) : null,
        chestCm: entry.chestCm != null ? Number(entry.chestCm) : null,
        armsCm: entry.armsCm != null ? Number(entry.armsCm) : null,
        legsCm: entry.legsCm != null ? Number(entry.legsCm) : null,
        hipsCm: entry.hipsCm != null ? Number(entry.hipsCm) : null,
        shouldersCm: entry.shouldersCm != null ? Number(entry.shouldersCm) : null,
        neckCm: entry.neckCm != null ? Number(entry.neckCm) : null,
        forearmsCm: entry.forearmsCm != null ? Number(entry.forearmsCm) : null,
        calvesCm: entry.calvesCm != null ? Number(entry.calvesCm) : null,
        skinfoldData: entry.skinfoldData || null,
        notes: entry.notes || null,
        // Smart scale / body composition fields
        bmi: entry.bmi != null ? Number(entry.bmi) : null,
        fatFreeWeightKg: entry.fatFreeWeightKg != null ? Number(entry.fatFreeWeightKg) : null,
        subcutaneousFatPct: entry.subcutaneousFatPct != null ? Number(entry.subcutaneousFatPct) : null,
        visceralFat: entry.visceralFat != null ? Number(entry.visceralFat) : null,
        bodyWaterPct: entry.bodyWaterPct != null ? Number(entry.bodyWaterPct) : null,
        skeletalMusclePct: entry.skeletalMusclePct != null ? Number(entry.skeletalMusclePct) : null,
        muscleMassKg: entry.muscleMassKg != null ? Number(entry.muscleMassKg) : null,
        boneMassKg: entry.boneMassKg != null ? Number(entry.boneMassKg) : null,
        proteinPct: entry.proteinPct != null ? Number(entry.proteinPct) : null,
        bmrKcal: entry.bmrKcal != null ? Number(entry.bmrKcal) : null,
        metabolicAge: entry.metabolicAge != null ? Number(entry.metabolicAge) : null,
        heartRateBpm: entry.heartRateBpm != null ? Number(entry.heartRateBpm) : null,
        source: entry.source || "import",
        updatedAt: now,
      }));

      const result = await batchCreateWithFallback(
        mapped,
        (data) => prisma.bodyMeasurement.createMany({ data }),
        (data) => prisma.bodyMeasurement.create({ data }),
      );

      results.measurements = result;
    }

    // ─── Water Logs ─────────────────────────────────────────────
    if (Array.isArray(body.waterLogs) && body.waterLogs.length > 0) {
      const mapped = (body.waterLogs as ImportWaterEntry[]).map((entry) => ({
        loggedAt: entry.loggedAt ? new Date(entry.loggedAt) : new Date(),
        amountMl: Number(entry.amountMl ?? entry.amount) || 250,
      }));

      const result = await batchCreateWithFallback(
        mapped,
        (data) => prisma.waterLog.createMany({ data }),
        (data) => prisma.waterLog.create({ data }),
      );

      results.waterLogs = result;
    }

    const totalImported = Object.values(results).reduce((sum, r) => sum + r.imported, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

    // Collect any error messages to return
    const allErrorMessages: string[] = [];
    for (const [section, r] of Object.entries(results)) {
      if (r.errorMessages && r.errorMessages.length > 0) {
        allErrorMessages.push(`${section}:`, ...r.errorMessages.slice(0, 10));
      }
    }

    return NextResponse.json({
      success: totalErrors === 0,
      totalImported,
      totalErrors,
      details: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, { imported: v.imported, errors: v.errors }])
      ),
      ...(allErrorMessages.length > 0 ? { errorMessages: allErrorMessages } : {}),
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return NextResponse.json(
      { error: "Failed to process bulk import", details: String(error) },
      { status: 500 }
    );
  }
}
