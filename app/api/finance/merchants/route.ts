import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const merchants = await prisma.merchant.findMany({
      orderBy: [{ totalSpent: "desc" }, { transactionCount: "desc" }],
      take: 50,
      include: {
        transactions: {
          where: {
            status: { notIn: ["duplicate", "ignored"] },
          },
          take: 5,
          orderBy: { transactedAt: "desc" },
          select: {
            id: true,
            description: true,
            amount: true,
            category: true,
            transactedAt: true,
          },
        },
      },
    });

    return NextResponse.json({ merchants });
  } catch (error) {
    console.error("Finance merchants error:", error);
    return NextResponse.json({ error: "Failed to load merchants" }, { status: 500 });
  }
}
