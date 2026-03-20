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
        merchantId: body.merchantId !== undefined ? body.merchantId : undefined,
        categoryHint: body.categoryHint !== undefined ? body.categoryHint : undefined,
        subcategoryHint:
          body.subcategoryHint !== undefined ? body.subcategoryHint : undefined,
        countryHint: body.countryHint !== undefined ? body.countryHint : undefined,
        currencyHint: body.currencyHint !== undefined ? body.currencyHint : undefined,
        localeHint: body.localeHint !== undefined ? body.localeHint : undefined,
        isBiller: body.isBiller ?? undefined,
        isIncomeSource: body.isIncomeSource ?? undefined,
        isRecurring: body.isRecurring ?? undefined,
        isPriority: body.isPriority ?? undefined,
        prioritySourceRole:
          body.prioritySourceRole !== undefined ? body.prioritySourceRole : undefined,
        priorityInstitution:
          body.priorityInstitution !== undefined ? body.priorityInstitution : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    console.error("Finance source update error:", error);
    return NextResponse.json({ error: "Failed to update finance source" }, { status: 500 });
  }
}
