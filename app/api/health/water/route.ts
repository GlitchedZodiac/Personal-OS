import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { getUtcDayBounds, parseLocalDate } from "@/lib/utils";
import { estimateFluidMlFromFoodLogs } from "@/lib/hydration";

// GET - Get water logs for a date
export async function GET(request: NextRequest) {
  try {
    if (!prisma.waterLog) {
      return NextResponse.json({
        logs: [],
        manualMl: 0,
        inferredFluidMl: 0,
        workoutAdjustmentMl: 0,
        targetMl: 2500,
        totalMl: 0,
        glasses: 0,
      });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const parsedOffset = tzOffsetMinutes !== null ? Number(tzOffsetMinutes) : null;
    const { dayStart, dayEnd } =
      dateStr && parsedOffset !== null && Number.isFinite(parsedOffset)
        ? getUtcDayBounds(dateStr, parsedOffset)
        : { dayStart: startOfDay(date), dayEnd: endOfDay(date) };

    const dateFilter = {
      gte: dayStart,
      lte: dayEnd,
    };

    const [logs, foods, workouts] = await Promise.all([
      prisma.waterLog.findMany({
        where: { loggedAt: dateFilter },
        orderBy: { loggedAt: "desc" },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: dateFilter },
        select: { foodDescription: true, notes: true },
      }),
      prisma.workoutLog.aggregate({
        where: { startedAt: dateFilter },
        _sum: { durationMinutes: true },
      }),
    ]);

    const manualMl = logs.reduce((sum, l) => sum + l.amountMl, 0);
    const inferredFluidMl = estimateFluidMlFromFoodLogs(foods);
    const workoutMinutes = workouts._sum.durationMinutes ?? 0;
    // Add hydration target for sweat loss: ~350ml per 30 min of activity.
    const workoutAdjustmentMl = Math.round((workoutMinutes / 30) * 350);
    const targetMl = 2500 + workoutAdjustmentMl;
    const totalMl = manualMl + inferredFluidMl;
    const glasses = manualMl > 0 ? Math.ceil(manualMl / 250) : 0;

    return NextResponse.json({
      logs,
      manualMl,
      inferredFluidMl,
      workoutAdjustmentMl,
      targetMl,
      totalMl,
      glasses,
    });
  } catch (error) {
    console.error("Water log error:", error);
    // If table doesn't exist, return empty gracefully
    return NextResponse.json({
      logs: [],
      manualMl: 0,
      inferredFluidMl: 0,
      workoutAdjustmentMl: 0,
      targetMl: 2500,
      totalMl: 0,
      glasses: 0,
    });
  }
}

// POST - Log water intake
export async function POST(request: NextRequest) {
  try {
    if (!prisma.waterLog) {
      return NextResponse.json(
        { error: "Water tracking not set up yet. Please run the SQL migration." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const amountMl = body.amountMl || 250;

    const log = await prisma.waterLog.create({
      data: {
        amountMl,
        loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
      },
    });

    return NextResponse.json(log);
  } catch (error) {
    console.error("Water log error:", error);
    return NextResponse.json(
      { error: "Failed to log water. The water_logs table may not exist yet." },
      { status: 500 }
    );
  }
}

// PATCH - Update an existing water entry
export async function PATCH(request: NextRequest) {
  try {
    if (!prisma.waterLog) {
      return NextResponse.json({ error: "Water tracking not set up yet." }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.amountMl !== undefined) updateData.amountMl = body.amountMl;
    if (body.loggedAt !== undefined) updateData.loggedAt = new Date(body.loggedAt);

    const updated = await prisma.waterLog.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Water update error:", error);
    return NextResponse.json(
      { error: "Failed to update water log." },
      { status: 500 }
    );
  }
}

// DELETE - Remove last water log for today
export async function DELETE(request: NextRequest) {
  try {
    if (!prisma.waterLog) {
      return NextResponse.json({ success: true });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      await prisma.waterLog.delete({ where: { id } });
    } else {
      const dateStr = searchParams.get("date");
      const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
      const parsedOffset = tzOffsetMinutes !== null ? Number(tzOffsetMinutes) : null;
      const date = dateStr ? parseLocalDate(dateStr) : new Date();
      const { dayStart, dayEnd } =
        dateStr && parsedOffset !== null && Number.isFinite(parsedOffset)
          ? getUtcDayBounds(dateStr, parsedOffset)
          : { dayStart: startOfDay(date), dayEnd: endOfDay(date) };

      const latest = await prisma.waterLog.findFirst({
        where: {
          loggedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        orderBy: { loggedAt: "desc" },
      });

      if (latest) {
        await prisma.waterLog.delete({ where: { id: latest.id } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Water delete error:", error);
    return NextResponse.json({ success: true });
  }
}
