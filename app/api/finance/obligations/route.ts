import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncScheduledObligationOccurrences } from "@/lib/finance/planning";

export async function GET() {
  try {
    await syncScheduledObligationOccurrences();

    const [obligations, occurrences] = await Promise.all([
      prisma.scheduledObligation.findMany({
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
        include: {
          defaultAccount: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.scheduledObligationOccurrence.findMany({
        where: {
          dueDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        include: {
          obligation: {
            select: {
              id: true,
              name: true,
              category: true,
              subcategory: true,
              currency: true,
            },
          },
          transaction: {
            select: { id: true, amount: true, transactedAt: true },
          },
        },
      }),
    ]);

    return NextResponse.json({ obligations, occurrences });
  } catch (error) {
    console.error("Finance obligations error:", error);
    return NextResponse.json({ error: "Failed to load obligations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nextOccurrenceAt = body.nextOccurrenceAt
      ? new Date(body.nextOccurrenceAt)
      : body.dueDay
      ? new Date(new Date().getFullYear(), new Date().getMonth(), Number(body.dueDay))
      : new Date();

    const obligation = await prisma.scheduledObligation.create({
      data: {
        name: body.name,
        amount: Number(body.amount),
        currency: body.currency || "COP",
        category: body.category || "other",
        subcategory: body.subcategory ?? null,
        frequency: body.frequency || "monthly",
        dueDay: body.dueDay ?? null,
        nextOccurrenceAt,
        defaultAccountId: body.defaultAccountId ?? null,
        notes: body.notes ?? null,
        active: body.active ?? true,
      },
    });

    await syncScheduledObligationOccurrences();
    return NextResponse.json(obligation, { status: 201 });
  } catch (error) {
    console.error("Finance obligation create error:", error);
    return NextResponse.json({ error: "Failed to create obligation" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Obligation id is required" }, { status: 400 });
    }

    const obligation = await prisma.scheduledObligation.update({
      where: { id: body.id },
      data: {
        name: body.name ?? undefined,
        amount: body.amount !== undefined ? Number(body.amount) : undefined,
        currency: body.currency ?? undefined,
        category: body.category ?? undefined,
        subcategory: body.subcategory ?? undefined,
        frequency: body.frequency ?? undefined,
        dueDay: body.dueDay ?? undefined,
        nextOccurrenceAt: body.nextOccurrenceAt ? new Date(body.nextOccurrenceAt) : undefined,
        defaultAccountId: body.defaultAccountId ?? undefined,
        notes: body.notes ?? undefined,
        active: body.active ?? undefined,
      },
    });

    await syncScheduledObligationOccurrences();
    return NextResponse.json(obligation);
  } catch (error) {
    console.error("Finance obligation update error:", error);
    return NextResponse.json({ error: "Failed to update obligation" }, { status: 500 });
  }
}
