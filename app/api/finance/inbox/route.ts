import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyReviewAction } from "@/lib/finance/ingestion";
import type { ReviewAction } from "@/lib/finance/constants";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = Number(searchParams.get("limit") || "50");

    const items = await prisma.financeReviewItem.findMany({
      where: status === "all" ? undefined : { status },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        transaction: {
          include: {
            account: { select: { name: true, icon: true } },
            merchantRef: { select: { id: true, name: true, normalizedName: true } },
          },
        },
        document: true,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Finance inbox error:", error);
    return NextResponse.json({ error: "Failed to load finance inbox" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { reviewId, action, payload } = body as {
      reviewId: string;
      action: ReviewAction;
      payload?: Record<string, unknown>;
    };

    if (!reviewId || !action) {
      return NextResponse.json({ error: "reviewId and action are required" }, { status: 400 });
    }

    const result = await applyReviewAction(reviewId, action, payload);
    return NextResponse.json({ success: true, item: result });
  } catch (error) {
    console.error("Finance inbox action error:", error);
    return NextResponse.json({ error: "Failed to apply inbox action" }, { status: 500 });
  }
}
