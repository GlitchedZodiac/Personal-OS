import { NextResponse } from "next/server";
import { withRequestPrisma } from "@/lib/prisma-request";

type PreviewSignal = {
  id: string;
  kind: string;
  messageSubtype: string;
  settlementStatus: string;
  description: string;
  amount: number | null;
  sourceAmount: number | null;
  sourceCurrency: string | null;
  fxRate: number | null;
  amountExtractionLabel: string | null;
  requiresCurrencyReview: boolean;
  promotionState: string;
  category: string | null;
  dueDate: Date | null;
  groupKey: string | null;
  orderRef: string | null;
  chargeRef: string | null;
  document: {
    subject: string | null;
    sender: string | null;
  } | null;
};

function looksTransactionalSubject(value: string) {
  return /(order|ordered|shipped|receipt|statement|invoice|payment|paid|bill|subscription|charge|transaction|factur|operaci[oó]n|compra|pedido|cobro|minim|minimo|minimum|due)/i.test(
    value
  );
}

function looksPromotionalSubject(value: string) {
  return /(save|winner|contest|deal|deals|hours left|few days|vale la pena|you'll love|tips of the month|begun|started|guide|travel deal|lo nuevo)/i.test(
    value
  );
}

function isMeaningfulPreview(signal: PreviewSignal) {
  const hasAmount = signal.amount != null || signal.sourceAmount != null;
  const hasKnownSubtype = signal.messageSubtype !== "unknown";
  const hasResolution = ["settled", "failed", "rejected", "refunded"].includes(
    signal.settlementStatus
  );
  const hasGroupingRef = Boolean(signal.orderRef || signal.chargeRef);
  const subjectText = `${signal.document?.subject || ""} ${signal.description || ""}`.trim();
  const subjectLooksTransactional = looksTransactionalSubject(subjectText);
  const subjectLooksPromotional = looksPromotionalSubject(subjectText);
  const hasMeaningfulKind =
    ["bill_due", "statement", "income"].includes(signal.kind) ||
    (signal.kind === "refund" &&
      (signal.messageSubtype === "refund" ||
        signal.settlementStatus === "refunded" ||
        Boolean(signal.chargeRef)));

  if (
    subjectLooksPromotional &&
    !hasKnownSubtype &&
    !hasMeaningfulKind &&
    !hasGroupingRef &&
    !subjectLooksTransactional
  ) {
    return false;
  }

  return (
    hasKnownSubtype ||
    hasResolution ||
    hasMeaningfulKind ||
    hasGroupingRef ||
    signal.dueDate != null ||
    (hasAmount && subjectLooksTransactional)
  );
}

export async function GET() {
  try {
    return await withRequestPrisma(async (prisma) => {
      const sources = await prisma.financeSource.findMany({
        orderBy: [{ signalCount: "desc" }, { documentCount: "desc" }, { lastSeenAt: "desc" }],
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

      const [documentCounts, signalCounts, settlementCounts, promotionCounts, rules, rawSignals] =
        sourceIds.length
          ? await Promise.all([
              prisma.financeDocument.groupBy({
                by: ["sourceId"],
                where: { sourceId: { in: sourceIds } },
                _count: { _all: true },
              }),
              prisma.financeSignal.groupBy({
                by: ["sourceId"],
                where: { sourceId: { in: sourceIds } },
                _count: { _all: true },
              }),
              prisma.financeSignal.groupBy({
                by: ["sourceId", "settlementStatus"],
                where: { sourceId: { in: sourceIds } },
                _count: { _all: true },
              }),
              prisma.financeSignal.groupBy({
                by: ["sourceId", "promotionState"],
                where: { sourceId: { in: sourceIds } },
                _count: { _all: true },
              }),
              prisma.financeRule.findMany({
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
              }),
              prisma.financeSignal.findMany({
                where: {
                  sourceId: { in: sourceIds },
                  promotionState: { notIn: ["ignored", "dismissed"] },
                },
                orderBy: { createdAt: "desc" },
                take: 240,
                select: {
                  id: true,
                  sourceId: true,
                  kind: true,
                  messageSubtype: true,
                  settlementStatus: true,
                  description: true,
                  amount: true,
                  sourceAmount: true,
                  sourceCurrency: true,
                  fxRate: true,
                  amountExtractionLabel: true,
                  requiresCurrencyReview: true,
                  promotionState: true,
                  category: true,
                  dueDate: true,
                  groupKey: true,
                  orderRef: true,
                  chargeRef: true,
                  document: {
                    select: {
                      subject: true,
                      sender: true,
                    },
                  },
                },
              }),
            ])
          : [[], [], [], [], [], []];

      const rulesBySource = new Map<string, typeof rules>();
      for (const rule of rules) {
        if (!rule.sourceId) continue;
        const bucket = rulesBySource.get(rule.sourceId) || [];
        if (bucket.length < 6) {
          bucket.push(rule);
          rulesBySource.set(rule.sourceId, bucket);
        }
      }

      const documentCountsBySource = new Map<string, number>();
      for (const row of documentCounts) {
        if (!row.sourceId) continue;
        documentCountsBySource.set(row.sourceId, row._count._all);
      }

      const signalCountsBySource = new Map<string, number>();
      for (const row of signalCounts) {
        if (!row.sourceId) continue;
        signalCountsBySource.set(row.sourceId, row._count._all);
      }

      const settlementCountsBySource = new Map<
        string,
        { provisional: number; settled: number; failed: number }
      >();
      for (const row of settlementCounts) {
        if (!row.sourceId) continue;
        const current = settlementCountsBySource.get(row.sourceId) || {
          provisional: 0,
          settled: 0,
          failed: 0,
        };
        if (row.settlementStatus === "provisional") current.provisional += row._count._all;
        if (row.settlementStatus === "settled") current.settled += row._count._all;
        if (row.settlementStatus === "failed" || row.settlementStatus === "rejected") {
          current.failed += row._count._all;
        }
        settlementCountsBySource.set(row.sourceId, current);
      }

      const promotionCountsBySource = new Map<
        string,
        { confirmed: number; ignored: number; autoPosted: number }
      >();
      for (const row of promotionCounts) {
        if (!row.sourceId) continue;
        const current = promotionCountsBySource.get(row.sourceId) || {
          confirmed: 0,
          ignored: 0,
          autoPosted: 0,
        };
        if (row.promotionState === "auto_posted") {
          current.autoPosted += row._count._all;
          current.confirmed += row._count._all;
        }
        if (row.promotionState === "user_confirmed") {
          current.confirmed += row._count._all;
        }
        if (row.promotionState === "ignored" || row.promotionState === "dismissed") {
          current.ignored += row._count._all;
        }
        promotionCountsBySource.set(row.sourceId, current);
      }

      const signalsBySource = new Map<string, PreviewSignal[]>();
      for (const signal of rawSignals) {
        if (!signal.sourceId || !isMeaningfulPreview(signal)) continue;
        const bucket = signalsBySource.get(signal.sourceId) || [];
        if (bucket.length >= 3) continue;
        bucket.push(signal);
        signalsBySource.set(signal.sourceId, bucket);
      }

      return NextResponse.json({
        sources: sources.map((source) => {
          const liveSettlementCounts = settlementCountsBySource.get(source.id);
          const livePromotionCounts = promotionCountsBySource.get(source.id);
          const previewSignals = signalsBySource.get(source.id) || [];

          return {
            ...source,
            documentCount: documentCountsBySource.get(source.id) ?? source.documentCount,
            signalCount: signalCountsBySource.get(source.id) ?? source.signalCount,
            confirmedCount: livePromotionCounts?.confirmed ?? source.confirmedCount,
            ignoredCount: livePromotionCounts?.ignored ?? source.ignoredCount,
            autoPostCount: livePromotionCounts?.autoPosted ?? source.autoPostCount,
            provisionalCount: liveSettlementCounts?.provisional ?? source.provisionalCount,
            settledCount: liveSettlementCounts?.settled ?? source.settledCount,
            failedCount: liveSettlementCounts?.failed ?? source.failedCount,
            signals: previewSignals.map((signal) => ({
              id: signal.id,
              kind: signal.kind,
              messageSubtype: signal.messageSubtype || "unknown",
              settlementStatus: signal.settlementStatus || "provisional",
              description: signal.description,
              amount: signal.amount,
              sourceAmount: signal.sourceAmount,
              sourceCurrency: signal.sourceCurrency,
              fxRate: signal.fxRate,
              requiresCurrencyReview: signal.requiresCurrencyReview,
              promotionState: signal.promotionState,
              category: signal.category,
              document: {
                subject: signal.document?.subject || null,
                sender: signal.document?.sender || null,
              },
            })),
            rules: rulesBySource.get(source.id) || [],
            exampleSubtypes: [...new Set(previewSignals.map((signal) => signal.messageSubtype || "unknown"))],
          };
        }),
      });
    });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
