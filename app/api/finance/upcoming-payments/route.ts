import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") || "45");
    const now = new Date();
    const endDate = addDays(now, days);

    const payments = await prisma.upcomingPayment.findMany({
      where: {
        dueDate: { gte: now, lte: endDate },
        status: { in: ["detected", "confirmed"] },
      },
      orderBy: { dueDate: "asc" },
      include: { merchant: true, sourceDocument: true },
    });

    return NextResponse.json({ payments });
  } catch (error) {
    console.error("Upcoming payments error:", error);
    return NextResponse.json({ error: "Failed to load upcoming payments" }, { status: 500 });
  }
}
