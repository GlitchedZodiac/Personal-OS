import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPocketDashboardData } from "@/lib/finance/planning";

export async function GET() {
  try {
    const snapshot = await getPocketDashboardData();
    return NextResponse.json({
      pockets: snapshot.pockets,
      pendingRuns: snapshot.pendingRuns,
      primaryAccount: snapshot.primaryAccount,
      primaryCashBalance: snapshot.primaryCashBalance,
      totalPocketBalance: snapshot.totalPocketBalance,
      unassignedCash: snapshot.unassignedCash,
      allocationPercentTotal: snapshot.allocationPercentTotal,
      rulesComplete: snapshot.allocationPercentTotal === 100,
    });
  } catch (error) {
    console.error("Finance pockets error:", error);
    return NextResponse.json({ error: "Failed to load pockets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => null);
    return NextResponse.json(
      { error: "Custom pockets are disabled in curated cash mode. Update the canonical pockets instead." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Finance pocket create error:", error);
    return NextResponse.json({ error: "Failed to create pocket" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Pocket id is required" }, { status: 400 });
    }

    const pocket = await prisma.fundPocket.update({
      where: { id: body.id },
      data: {
        name: body.name ?? undefined,
        description: body.description ?? undefined,
        icon: body.icon ?? undefined,
        color: body.color ?? undefined,
        currentBalance: body.currentBalance ?? undefined,
        targetAmount: body.targetAmount ?? undefined,
        active: body.active ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
    });
    return NextResponse.json(pocket);
  } catch (error) {
    console.error("Finance pocket update error:", error);
    return NextResponse.json({ error: "Failed to update pocket" }, { status: 500 });
  }
}
