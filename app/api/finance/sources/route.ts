import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sources = await prisma.financeSource.findMany({
      orderBy: [{ documentCount: "desc" }, { lastSeenAt: "desc" }],
      include: {
        merchant: {
          select: { id: true, name: true },
        },
        signals: {
          take: 3,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            description: true,
            amount: true,
            promotionState: true,
            category: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
