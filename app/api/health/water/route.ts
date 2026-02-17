import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/utils";

// GET - Get water logs for a date
export async function GET(request: NextRequest) {
  try {
    if (!prisma.waterLog) {
      return NextResponse.json({ logs: [], totalMl: 0, glasses: 0 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const logs = await prisma.waterLog.findMany({
      where: {
        loggedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      orderBy: { loggedAt: "desc" },
    });

    const totalMl = logs.reduce((sum, l) => sum + l.amountMl, 0);

    return NextResponse.json({
      logs,
      totalMl,
      glasses: logs.length,
    });
  } catch (error) {
    console.error("Water log error:", error);
    // If table doesn't exist, return empty gracefully
    return NextResponse.json({ logs: [], totalMl: 0, glasses: 0 });
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
      data: { amountMl },
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
      const dayStart = startOfDay(new Date());
      const dayEnd = endOfDay(new Date());

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
