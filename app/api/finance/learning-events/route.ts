import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "30")));

    const events = await prisma.financeLearningEvent.findMany({
      where: {
        sourceId: sourceId || undefined,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        source: {
          select: {
            id: true,
            label: true,
          },
        },
        rule: {
          select: {
            id: true,
            name: true,
          },
        },
        signal: {
          select: {
            id: true,
            description: true,
            messageSubtype: true,
          },
        },
        transaction: {
          select: {
            id: true,
            description: true,
            amount: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Finance learning events error:", error);
    return NextResponse.json({ error: "Failed to load finance learning events" }, { status: 500 });
  }
}
