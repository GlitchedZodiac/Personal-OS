import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rules = await prisma.financeRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { merchant: true, source: true },
    });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Finance rules error:", error);
    return NextResponse.json({ error: "Failed to load finance rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rule = await prisma.financeRule.create({
      data: {
        name: body.name,
        ruleType: body.ruleType || "merchant",
        isActive: body.isActive ?? true,
        priority: body.priority ?? 0,
        learned: body.learned ?? false,
        merchantId: body.merchantId ?? null,
        sourceId: body.sourceId ?? null,
        conditions: body.conditions as Prisma.InputJsonValue,
        actions: body.actions as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Finance rule create error:", error);
    return NextResponse.json({ error: "Failed to create finance rule" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
    }

    const rule = await prisma.financeRule.update({
      where: { id },
      data: {
        ...updates,
        conditions: updates.conditions as Prisma.InputJsonValue | undefined,
        actions: updates.actions as Prisma.InputJsonValue | undefined,
      },
    });
    return NextResponse.json(rule);
  } catch (error) {
    console.error("Finance rule update error:", error);
    return NextResponse.json({ error: "Failed to update finance rule" }, { status: 500 });
  }
}
