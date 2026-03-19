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
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            messageSubtype: true,
            settlementStatus: true,
            description: true,
            amount: true,
            sourceAmount: true,
            sourceCurrency: true,
            fxRate: true,
            requiresCurrencyReview: true,
            promotionState: true,
            category: true,
            createdAt: true,
            document: {
              select: {
                subject: true,
                sender: true,
              },
            },
          },
        },
        rules: {
          where: { isActive: true },
          take: 8,
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            ruleType: true,
            priority: true,
            isActive: true,
            conditions: true,
            actions: true,
          },
        },
      },
    });

    return NextResponse.json({
      sources: sources.map((source) => ({
        ...source,
        exampleSubtypes: [...new Set(source.signals.map((signal) => signal.messageSubtype))].filter(Boolean),
      })),
    });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
