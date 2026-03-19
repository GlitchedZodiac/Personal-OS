import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rules = await prisma.paycheckAllocationRule.findMany({
      orderBy: [{ active: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
      include: {
        pocket: {
          select: {
            id: true,
            name: true,
            active: true,
            currentBalance: true,
          },
        },
      },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Finance paycheck allocation rules error:", error);
    return NextResponse.json({ error: "Failed to load paycheck allocation rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rule = await prisma.paycheckAllocationRule.create({
      data: {
        pocketId: body.pocketId,
        name: body.name ?? null,
        percentOfIncome: Number(body.percentOfIncome),
        priority: body.priority ?? 0,
        active: body.active ?? true,
        notes: body.notes ?? null,
      },
      include: {
        pocket: {
          select: {
            id: true,
            name: true,
            active: true,
            currentBalance: true,
          },
        },
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Finance paycheck allocation rule create error:", error);
    return NextResponse.json({ error: "Failed to create paycheck allocation rule" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
    }

    const rule = await prisma.paycheckAllocationRule.update({
      where: { id: body.id },
      data: {
        pocketId: body.pocketId ?? undefined,
        name: body.name ?? undefined,
        percentOfIncome:
          body.percentOfIncome !== undefined ? Number(body.percentOfIncome) : undefined,
        priority: body.priority ?? undefined,
        active: body.active ?? undefined,
        notes: body.notes ?? undefined,
      },
      include: {
        pocket: {
          select: {
            id: true,
            name: true,
            active: true,
            currentBalance: true,
          },
        },
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Finance paycheck allocation rule update error:", error);
    return NextResponse.json({ error: "Failed to update paycheck allocation rule" }, { status: 500 });
  }
}
