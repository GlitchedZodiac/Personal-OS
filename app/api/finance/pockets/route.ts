import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [pockets, pendingRuns] = await Promise.all([
      prisma.fundPocket.findMany({
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          allocationRules: {
            where: { active: true },
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          },
          entries: {
            orderBy: { occurredAt: "desc" },
            take: 5,
          },
        },
      }),
      prisma.paycheckAllocationRun.findMany({
        where: { status: "pending" },
        orderBy: { promptedAt: "desc" },
        include: {
          sourceTransaction: {
            select: {
              id: true,
              description: true,
              amount: true,
              transactedAt: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({ pockets, pendingRuns });
  } catch (error) {
    console.error("Finance pockets error:", error);
    return NextResponse.json({ error: "Failed to load pockets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pocket = await prisma.fundPocket.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        icon: body.icon ?? null,
        color: body.color ?? null,
        currentBalance: body.currentBalance ?? 0,
        targetAmount: body.targetAmount ?? null,
        active: body.active ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return NextResponse.json(pocket, { status: 201 });
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
