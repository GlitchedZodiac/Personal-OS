import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const document = await prisma.financeDocument.update({
      where: { id },
      data: {
        classification: body.classification ?? undefined,
        messageSubtype: body.messageSubtype ?? undefined,
        processingStage: body.processingStage ?? undefined,
        status: body.status ?? undefined,
        sourceId: body.sourceId ?? undefined,
        groupKey: body.groupKey ?? undefined,
        orderRef: body.orderRef ?? undefined,
        chargeRef: body.chargeRef ?? undefined,
        parseError: body.parseError ?? undefined,
      },
      include: {
        sourceRef: true,
        signals: true,
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Finance document update error:", error);
    return NextResponse.json({ error: "Failed to update finance document" }, { status: 500 });
  }
}
