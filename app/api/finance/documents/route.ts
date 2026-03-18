import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classification = searchParams.get("classification");
    const processingStage = searchParams.get("processingStage");
    const limit = Number(searchParams.get("limit") || 100);

    const documents = await prisma.financeDocument.findMany({
      where: {
        classification: classification || undefined,
        processingStage: processingStage || undefined,
      },
      take: Math.max(1, Math.min(limit, 200)),
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      include: {
        sourceRef: {
          select: {
            id: true,
            label: true,
            trustLevel: true,
            defaultDisposition: true,
          },
        },
        signals: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            description: true,
            amount: true,
            promotionState: true,
            confidence: true,
            category: true,
            type: true,
            dueDate: true,
            transactionId: true,
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
