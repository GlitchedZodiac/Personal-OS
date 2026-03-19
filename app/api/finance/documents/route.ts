import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const classification = searchParams.get("classification");
    const status = searchParams.get("status");
    const sourceId = searchParams.get("sourceId");

    const documents = await prisma.financeDocument.findMany({
      where: {
        classification: classification || undefined,
        status: status || undefined,
        sourceId: sourceId || undefined,
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        sourceRef: {
          select: {
            id: true,
            label: true,
            defaultDisposition: true,
            trustLevel: true,
          },
        },
        signals: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            kind: true,
            messageSubtype: true,
            settlementStatus: true,
            amount: true,
            sourceAmount: true,
            sourceCurrency: true,
            promotionState: true,
            description: true,
          },
        },
      },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Finance documents error:", error);
    return NextResponse.json({ error: "Failed to load finance documents" }, { status: 500 });
  }
}
