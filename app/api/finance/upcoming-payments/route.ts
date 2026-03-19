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
    const obligations = await prisma.scheduledObligationOccurrence.findMany({
      where: {
        dueDate: { gte: now, lte: endDate },
        status: { in: ["due", "overdue"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        obligation: true,
      },
    });

    return NextResponse.json({
      payments,
      obligations: obligations.map((occurrence) => ({
        id: occurrence.id,
        description: occurrence.obligation.name,
        amount: occurrence.expectedAmount,
        dueDate: occurrence.dueDate,
        status: occurrence.status,
        currency: occurrence.obligation.currency,
        category: occurrence.obligation.category,
        source: "scheduled_obligation",
      })),
    });
  } catch (error) {
    console.error("Upcoming payments error:", error);
    return NextResponse.json({ error: "Failed to load upcoming payments" }, { status: 500 });
  }
}
