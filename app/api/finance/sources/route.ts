import { NextResponse } from "next/server";
import { withRequestPrisma } from "@/lib/prisma-request";

export async function GET() {
  try {
    return await withRequestPrisma(async (prisma) => {
      const sources = await prisma.financeSource.findMany({
        orderBy: [{ documentCount: "desc" }, { lastSeenAt: "desc" }],
        take: 24,
        select: {
          id: true,
          label: true,
          senderEmail: true,
          senderDomain: true,
          trustLevel: true,
          defaultDisposition: true,
          categoryHint: true,
          subcategoryHint: true,
          countryHint: true,
          currencyHint: true,
          localeHint: true,
          documentCount: true,
          signalCount: true,
          confirmedCount: true,
          ignoredCount: true,
          autoPostCount: true,
          provisionalCount: true,
          settledCount: true,
          failedCount: true,
          isBiller: true,
          isIncomeSource: true,
          isRecurring: true,
          merchant: {
            select: { id: true, name: true },
          },
        },
      });

      const sourceIds = sources.map((source) => source.id);
      const rules = sourceIds.length
        ? await prisma.financeRule.findMany({
            where: { isActive: true, sourceId: { in: sourceIds } },
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              sourceId: true,
              name: true,
              ruleType: true,
              priority: true,
              isActive: true,
              conditions: true,
              actions: true,
            },
            take: 160,
          })
        : [];

      const rulesBySource = new Map<string, typeof rules>();
      for (const rule of rules) {
        if (!rule.sourceId) continue;
        const bucket = rulesBySource.get(rule.sourceId) || [];
        if (bucket.length < 6) {
          bucket.push(rule);
          rulesBySource.set(rule.sourceId, bucket);
        }
      }

      return NextResponse.json({
        sources: sources.map((source) => ({
          ...source,
          signals: [],
          rules: rulesBySource.get(source.id) || [],
          exampleSubtypes: [],
        })),
      });
    });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
