import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const categories = await prisma.budgetCategory.findMany({
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Finance budget categories error:", error);
    return NextResponse.json({ error: "Failed to load budget categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const maxSortOrder = await prisma.budgetCategory.aggregate({
      _max: { sortOrder: true },
    });

    const category = await prisma.budgetCategory.create({
      data: {
        name: body.name,
        icon: body.icon ?? null,
        color: body.color ?? null,
        type: body.type ?? "expense",
        parentId: body.parentId ?? null,
        isTaxRelevant: body.isTaxRelevant ?? false,
        sortOrder: body.sortOrder ?? (maxSortOrder._max.sortOrder || 0) + 1,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Finance budget category create error:", error);
    return NextResponse.json({ error: "Failed to create budget category" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Budget category id is required" }, { status: 400 });
    }

    const category = await prisma.budgetCategory.update({
      where: { id: body.id },
      data: {
        name: body.name ?? undefined,
        icon: body.icon ?? undefined,
        color: body.color ?? undefined,
        type: body.type ?? undefined,
        parentId: body.parentId ?? undefined,
        isTaxRelevant: body.isTaxRelevant ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error("Finance budget category update error:", error);
    return NextResponse.json({ error: "Failed to update budget category" }, { status: 500 });
  }
}
