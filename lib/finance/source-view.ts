import type { PrismaClient } from "@prisma/client";
import { ensurePrioritySourcesSeeded } from "@/lib/finance/priority-sources";

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

function isReviewedSource(input: {
  trustLevel: string;
  defaultDisposition: string;
  isBiller: boolean;
  isIncomeSource: boolean;
  isRecurring: boolean;
  isPriority: boolean;
  categoryHint: string | null;
  subcategoryHint: string | null;
  notes: string | null;
  reviewedAt: Date | null;
  ruleCount: number;
}) {
  return Boolean(
    input.reviewedAt ||
      input.ruleCount > 0 ||
      input.isBiller ||
      input.isIncomeSource ||
      input.isRecurring ||
      input.isPriority ||
      input.categoryHint ||
      input.subcategoryHint ||
      input.notes ||
      input.trustLevel !== "new" ||
      input.defaultDisposition !== "capture_only"
  );
}

export async function buildFinanceSourcesResponse(db: PrismaClient) {
  await ensurePrioritySourcesSeeded();

  const settingsRow = await db.userSettings.findUnique({
    where: { id: "default" },
    select: { data: true },
  });
  const curatedOnly = Boolean(
    (settingsRow?.data as { finance?: { gmailCuratedSyncOnly?: boolean } } | null)?.finance
      ?.gmailCuratedSyncOnly ?? true
  );

  const sources = await db.financeSource.findMany({
    orderBy: [{ isPriority: "desc" }, { signalCount: "desc" }, { documentCount: "desc" }, { lastSeenAt: "desc" }],
    take: 48,
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
      isPriority: true,
      prioritySourceRole: true,
      priorityInstitution: true,
      notes: true,
      reviewedAt: true,
      merchant: {
        select: { id: true, name: true },
      },
    },
  });

  const sourceIds = sources.map((source) => source.id);

  const [rules, rawSignals, learningEvents] = sourceIds.length
    ? await Promise.all([
        db.financeRule.findMany({
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
          take: 240,
        }),
        db.financeSignal.findMany({
          where: {
            sourceId: { in: sourceIds },
            promotionState: { notIn: ["ignored", "dismissed"] },
            matchedRuleId: null,
          },
          orderBy: { createdAt: "desc" },
          take: 360,
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
        db.financeLearningEvent.findMany({
          where: { sourceId: { in: sourceIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            sourceId: true,
            summary: true,
            createdAt: true,
          },
          take: sourceIds.length * 6,
        }),
      ])
    : [[], [], []];

  const rulesBySource = new Map<string, typeof rules>();
  for (const rule of rules) {
    if (!rule.sourceId) continue;
    const bucket = rulesBySource.get(rule.sourceId) || [];
    if (bucket.length < 8) {
      bucket.push(rule);
      rulesBySource.set(rule.sourceId, bucket);
    }
  }

  const learningBySource = new Map<
    string,
    { latestSummary: string | null; latestAt: Date | null; count: number }
  >();
  for (const sourceId of sourceIds) {
    learningBySource.set(sourceId, {
      latestSummary: null,
      latestAt: null,
      count: 0,
    });
  }
  for (const event of learningEvents) {
    if (!event.sourceId) continue;
    const current = learningBySource.get(event.sourceId) || {
      latestSummary: null,
      latestAt: null,
      count: 0,
    };
    if (!current.latestAt) {
      current.latestAt = event.createdAt;
      current.latestSummary = event.summary;
    }
    current.count += 1;
    learningBySource.set(event.sourceId, current);
  }

  const signalsBySource = new Map<string, PreviewSignal[]>();
  for (const signal of rawSignals) {
    if (!signal.sourceId || !isMeaningfulPreview(signal)) continue;
    const bucket = signalsBySource.get(signal.sourceId) || [];
    if (bucket.length >= 3) continue;
    bucket.push(signal);
    signalsBySource.set(signal.sourceId, bucket);
  }

  const mappedSources = sources.map((source) => {
    const previewSignals = signalsBySource.get(source.id) || [];
    const sourceRules = rulesBySource.get(source.id) || [];
    const learning = learningBySource.get(source.id) || {
      latestSummary: null,
      latestAt: null,
      count: 0,
    };
    const reviewed = isReviewedSource({
      trustLevel: source.trustLevel,
      defaultDisposition: source.defaultDisposition,
      isBiller: source.isBiller,
      isIncomeSource: source.isIncomeSource,
      isRecurring: source.isRecurring,
      isPriority: source.isPriority,
      categoryHint: source.categoryHint,
      subcategoryHint: source.subcategoryHint,
      notes: source.notes,
      reviewedAt: source.reviewedAt,
      ruleCount: sourceRules.length,
    });

    return {
      ...source,
      reviewed,
      rules: sourceRules,
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
        coveredByRule: false,
        document: {
          subject: signal.document?.subject || null,
          sender: signal.document?.sender || null,
        },
      })),
      exampleSubtypes: [...new Set(previewSignals.map((signal) => signal.messageSubtype || "unknown"))],
      learningSummary: learning,
    };
  });

  const visibleSources = curatedOnly
    ? mappedSources.filter(
        (source) => Boolean(source.prioritySourceRole || source.priorityInstitution)
      )
    : mappedSources;

  const needsReview = visibleSources.filter((source) => !source.reviewed);
  const reviewed = visibleSources.filter((source) => source.reviewed);

  return {
    sections: {
      needsReview,
      reviewed,
    },
    summary: {
      needsReviewCount: needsReview.length,
      reviewedCount: reviewed.length,
      priorityCount: visibleSources.filter((source) => source.isPriority).length,
      totalCount: visibleSources.length,
    },
  };
}
