import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const source = await prisma.financeSource.update({
      where: { id },
      data: {
        label: body.label ?? undefined,
        trustLevel: body.trustLevel ?? undefined,
        defaultDisposition: body.defaultDisposition ?? undefined,
        merchantId: body.merchantId ?? undefined,
        categoryHint: body.categoryHint ?? undefined,
        subcategoryHint: body.subcategoryHint ?? undefined,
        countryHint: body.countryHint ?? undefined,
        currencyHint: body.currencyHint ?? undefined,
        localeHint: body.localeHint ?? undefined,
        isBiller: body.isBiller ?? undefined,
        isIncomeSource: body.isIncomeSource ?? undefined,
        isRecurring: body.isRecurring ?? undefined,
        notes: body.notes ?? undefined,
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    console.error("Finance source update error:", error);
    return NextResponse.json({ error: "Failed to update finance source" }, { status: 500 });
  }
}
