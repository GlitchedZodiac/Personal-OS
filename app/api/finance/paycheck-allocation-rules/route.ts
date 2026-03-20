import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCanonicalCashSetup } from "@/lib/finance/planning";

export async function GET() {
  try {
    await ensureCanonicalCashSetup();
    const rules = await prisma.paycheckAllocationRule.findMany({
      where: { pocket: { isCanonical: true } },
      orderBy: [{ active: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
      include: {
        pocket: {
          select: {
            id: true,
            name: true,
            slug: true,
            active: true,
            isCanonical: true,
            currentBalance: true,
          },
        },
      },
    });

    const percentTotal = Math.round(
      rules
        .filter((rule) => rule.active)
        .reduce((sum, rule) => sum + Number(rule.percentOfIncome || 0), 0) * 100
    ) / 100;

    return NextResponse.json({ rules, percentTotal, rulesComplete: percentTotal === 100 });
  } catch (error) {
    console.error("Finance paycheck allocation rules error:", error);
    return NextResponse.json({ error: "Failed to load paycheck allocation rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await ensureCanonicalCashSetup();
    const existing = await prisma.paycheckAllocationRule.findFirst({
      where: {
        pocketId: body.pocketId,
        pocket: { isCanonical: true },
      },
      orderBy: { createdAt: "asc" },
    });

    const rule = existing
      ? await prisma.paycheckAllocationRule.update({
          where: { id: existing.id },
          data: {
            name: body.name ?? existing.name ?? null,
            percentOfIncome: Number(body.percentOfIncome),
            priority: body.priority ?? existing.priority,
            active: body.active ?? true,
            notes: body.notes ?? existing.notes ?? null,
          },
          include: {
            pocket: {
              select: {
                id: true,
                name: true,
                slug: true,
                active: true,
                isCanonical: true,
                currentBalance: true,
              },
            },
          },
        })
      : await prisma.paycheckAllocationRule.create({
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
                slug: true,
                active: true,
                isCanonical: true,
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
    await ensureCanonicalCashSetup();
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
            slug: true,
            active: true,
            isCanonical: true,
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
