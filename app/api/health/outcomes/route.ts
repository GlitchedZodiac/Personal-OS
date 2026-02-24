import { NextRequest, NextResponse } from "next/server";
import { addDays, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

type MetricKey = "weightKg" | "bodyFatPct" | "waistCm";

type RegressionResult = {
  slope: number;
  intercept: number;
  r2: number;
};

type Point = { x: number; y: number };

type SettingsLike = {
  bodyGoals?: {
    goalWeightKg?: number | null;
    goalWaistCm?: number | null;
  };
};

function linearRegression(points: Point[]): RegressionResult | null {
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTot = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const ssRes = points.reduce(
    (sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2,
    0
  );
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

function toPoints(
  rows: Array<{ measuredAt: Date } & Partial<Record<MetricKey, number | null>>>,
  metric: MetricKey,
  startDate: Date
) {
  return rows
    .filter((row) => row[metric] != null)
    .map((row) => ({
      x: Math.round((row.measuredAt.getTime() - startDate.getTime()) / 86_400_000),
      y: Number(row[metric]),
    }));
}

function projectValue(
  regression: RegressionResult | null,
  baseX: number,
  daysForward: number
) {
  if (!regression) return null;
  const value = regression.slope * (baseX + daysForward) + regression.intercept;
  return Math.round(value * 10) / 10;
}

function isMetricOnTrack(
  current: number | null,
  projected: number | null,
  goal: number | null
) {
  if (current == null || projected == null || goal == null) return null;
  if (goal === current) return true;
  const desiredDirection = goal - current;
  const projectedDirection = projected - current;
  if (projectedDirection === 0) return false;
  return Math.sign(desiredDirection) === Math.sign(projectedDirection);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const windowDays = Number(searchParams.get("windowDays") ?? 120);
    const projectDays = Number(searchParams.get("projectDays") ?? 30);
    const safeWindowDays = Number.isFinite(windowDays) ? Math.max(30, windowDays) : 120;
    const safeProjectDays = Number.isFinite(projectDays)
      ? Math.max(7, Math.min(projectDays, 120))
      : 30;

    const since = subDays(new Date(), safeWindowDays);

    const [measurements, settingsRow] = await Promise.all([
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: since } },
        orderBy: { measuredAt: "asc" },
        select: {
          measuredAt: true,
          weightKg: true,
          bodyFatPct: true,
          waistCm: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { id: "default" },
        select: { data: true },
      }),
    ]);

    if (measurements.length === 0) {
      return NextResponse.json({
        hasData: false,
        message: "Not enough measurement history for forecasting yet.",
      });
    }

    const startDate = measurements[0].measuredAt;
    const lastRow = measurements[measurements.length - 1];
    const lastX = Math.round(
      (lastRow.measuredAt.getTime() - startDate.getTime()) / 86_400_000
    );
    const projectionDate = addDays(lastRow.measuredAt, safeProjectDays);

    const weightPoints = toPoints(measurements, "weightKg", startDate);
    const bodyFatPoints = toPoints(measurements, "bodyFatPct", startDate);
    const waistPoints = toPoints(measurements, "waistCm", startDate);

    const weightRegression = linearRegression(weightPoints);
    const bodyFatRegression = linearRegression(bodyFatPoints);
    const waistRegression = linearRegression(waistPoints);

    const projectedWeight = projectValue(weightRegression, lastX, safeProjectDays);
    const projectedBodyFat = projectValue(bodyFatRegression, lastX, safeProjectDays);
    const projectedWaist = projectValue(waistRegression, lastX, safeProjectDays);

    const settings = (settingsRow?.data as SettingsLike | null) ?? null;
    const goalWeight = settings?.bodyGoals?.goalWeightKg ?? null;
    const goalWaist = settings?.bodyGoals?.goalWaistCm ?? null;

    const currentWeight = lastRow.weightKg ?? null;
    const currentBodyFat = lastRow.bodyFatPct ?? null;
    const currentWaist = lastRow.waistCm ?? null;

    const weightOnTrack = isMetricOnTrack(currentWeight, projectedWeight, goalWeight);
    const waistOnTrack = isMetricOnTrack(currentWaist, projectedWaist, goalWaist);

    const qualityScore =
      Math.round(
        ((weightPoints.length + bodyFatPoints.length + waistPoints.length) / 3) * 10
      ) / 10;

    const recommendations = [
      weightOnTrack === false
        ? "Weight trend is moving away from goal. Tighten calorie consistency and training frequency."
        : null,
      waistOnTrack === false
        ? "Waist trend is off track. Increase daily movement and tighten late-evening nutrition."
        : null,
      projectedBodyFat != null && currentBodyFat != null && projectedBodyFat > currentBodyFat
        ? "Body-fat projection is rising. Prioritize protein and controlled calorie intake."
        : null,
      "Recheck measurements 2-3 times weekly for stronger forecast confidence.",
    ].filter(Boolean) as string[];

    return NextResponse.json({
      hasData: true,
      windowDays: safeWindowDays,
      projectDays: safeProjectDays,
      projectionDate: projectionDate.toISOString(),
      current: {
        measuredAt: lastRow.measuredAt.toISOString(),
        weightKg: currentWeight,
        bodyFatPct: currentBodyFat,
        waistCm: currentWaist,
      },
      projected: {
        weightKg: projectedWeight,
        bodyFatPct: projectedBodyFat,
        waistCm: projectedWaist,
      },
      goals: {
        weightKg: goalWeight,
        waistCm: goalWaist,
      },
      onTrack: {
        weight: weightOnTrack,
        waist: waistOnTrack,
      },
      confidence: {
        dataPoints: {
          weight: weightPoints.length,
          bodyFat: bodyFatPoints.length,
          waist: waistPoints.length,
        },
        fit: {
          weightR2: weightRegression ? Math.round(weightRegression.r2 * 100) / 100 : null,
          bodyFatR2: bodyFatRegression
            ? Math.round(bodyFatRegression.r2 * 100) / 100
            : null,
          waistR2: waistRegression ? Math.round(waistRegression.r2 * 100) / 100 : null,
        },
        qualityScore,
      },
      recommendations,
    });
  } catch (error) {
    console.error("Outcome forecast error:", error);
    return NextResponse.json(
      { error: "Failed to calculate outcome forecast" },
      { status: 500 }
    );
  }
}
