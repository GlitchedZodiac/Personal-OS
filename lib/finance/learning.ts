import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function toOptionalJsonValue(value: Prisma.InputJsonValue | undefined) {
  return value === undefined ? undefined : value;
}

export async function recordFinanceLearningEvent(params: {
  sourceId?: string | null;
  ruleId?: string | null;
  signalId?: string | null;
  transactionId?: string | null;
  kind: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  markSourceReviewed?: boolean;
}) {
  const event = await prisma.financeLearningEvent.create({
    data: {
      sourceId: params.sourceId ?? null,
      ruleId: params.ruleId ?? null,
      signalId: params.signalId ?? null,
      transactionId: params.transactionId ?? null,
      kind: params.kind,
      summary: params.summary,
      metadata: toOptionalJsonValue(params.metadata),
    },
  });

  if (params.sourceId) {
    await prisma.financeSource.update({
      where: { id: params.sourceId },
      data: {
        reviewedAt: params.markSourceReviewed === false ? undefined : new Date(),
        lastLearningEventAt: new Date(),
      },
    });
  }

  return event;
}

export async function getLatestLearningEventsForSources(sourceIds: string[]) {
  if (sourceIds.length === 0) {
    return new Map<
      string,
      { latestSummary: string | null; latestAt: Date | null; count: number }
    >();
  }

  const [latestEvents, counts] = await Promise.all([
    prisma.financeLearningEvent.findMany({
      where: { sourceId: { in: sourceIds } },
      orderBy: { createdAt: "desc" },
      select: {
        sourceId: true,
        summary: true,
        createdAt: true,
      },
      take: sourceIds.length * 4,
    }),
    prisma.financeLearningEvent.groupBy({
      by: ["sourceId"],
      where: { sourceId: { in: sourceIds } },
      _count: { _all: true },
    }),
  ]);

  const countsBySource = new Map<string, number>();
  for (const row of counts) {
    if (!row.sourceId) continue;
    countsBySource.set(row.sourceId, row._count._all);
  }

  const map = new Map<
    string,
    { latestSummary: string | null; latestAt: Date | null; count: number }
  >();

  for (const event of latestEvents) {
    if (!event.sourceId || map.has(event.sourceId)) continue;
    map.set(event.sourceId, {
      latestSummary: event.summary,
      latestAt: event.createdAt,
      count: countsBySource.get(event.sourceId) || 0,
    });
  }

  for (const sourceId of sourceIds) {
    if (!map.has(sourceId)) {
      map.set(sourceId, {
        latestSummary: null,
        latestAt: null,
        count: countsBySource.get(sourceId) || 0,
      });
    }
  }

  return map;
}
