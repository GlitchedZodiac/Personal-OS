import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FINANCE_ACCOUNT,
  type ReviewAction,
} from "@/lib/finance/constants";
import { analyzeFinanceDocument } from "@/lib/finance/ai";
import {
  buildFinanceSourceIdentity,
  buildSignalGroupKey,
  buildSignalFingerprint,
  buildSourceFingerprint,
  coerceValidDate,
  detectPotentialFlags,
  extractChargeReference,
  extractDueDateFromText,
  extractOrderReference,
  guessCategoryFromText,
  inferFinanceDocumentClassification,
  inferFinanceMessageSubtype,
  isValidDateValue,
  normalizeMerchantName,
  titleCase,
  type FinanceDocumentClassification,
  type FinanceMessageSubtype,
  type FinanceSettlementStatus,
  type FinanceSignalKind,
  type FinanceSourceDisposition,
} from "@/lib/finance/pipeline-utils";
import { extractFinanceMoney, normalizeCurrencyCode } from "@/lib/finance/money";
import { normalizeAmountToCop } from "@/lib/finance/fx";
import { ensurePaycheckAllocationRunForTransaction } from "@/lib/finance/planning";
import { upsertVaultSecret } from "@/lib/finance/vault";

export {
  buildSourceFingerprint,
  detectPotentialFlags,
  guessCategoryFromText,
  normalizeMerchantName,
  titleCase,
};

export interface FinanceDocumentInput {
  id?: string | null;
  source: string;
  externalId?: string | null;
  documentType: string;
  mailConnectionId?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  attachmentId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sender?: string | null;
  subject?: string | null;
  receivedAt?: Date | null;
  contentText?: string | null;
  extractedData?: Prisma.InputJsonValue;
  requiresPassword?: boolean;
  parseError?: string | null;
  passwordSecretKey?: string | null;
  status?: string;
  classification?: FinanceDocumentClassification | string | null;
  messageSubtype?: FinanceMessageSubtype | string | null;
  processingStage?: string | null;
  sourceKey?: string | null;
  groupKey?: string | null;
  orderRef?: string | null;
  chargeRef?: string | null;
}

export interface FinanceIngestionCandidate {
  accountId?: string | null;
  transactedAt?: Date | null;
  amount?: number | null;
  currency?: string;
  description: string;
  category?: string | null;
  subcategory?: string | null;
  type?: "income" | "expense" | "transfer";
  pocketId?: string | null;
  needsCategorization?: boolean;
  instrumentType?: string | null;
  instrumentLast4?: string | null;
  cashImpactType?: "cash" | "credit_pending" | "non_cash";
  signalKind?: FinanceSignalKind | null;
  messageSubtype?: FinanceMessageSubtype | null;
  documentClassification?: FinanceDocumentClassification | null;
  dueDate?: Date | null;
  minimumDue?: number | null;
  statementBalance?: number | null;
  isRecurring?: boolean;
  merchant?: string | null;
  reference?: string | null;
  notes?: string | null;
  source: string;
  tags?: string[];
  status?: string;
  reviewState?: string;
  confidence?: number | null;
  deductible?: boolean;
  excludedFromBudget?: boolean;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  tipAmount?: number | null;
  promotionPreference?: "source_policy" | "trusted_autopost" | "manual_post";
  document?: FinanceDocumentInput | null;
}

export interface ReviewActionPayload {
  fields?: Partial<FinanceIngestionCandidate>;
  createRule?: boolean;
  targetTransactionId?: string;
  passwordSecretKey?: string;
  password?: string;
  sourceDisposition?: FinanceSourceDisposition;
  trustLevel?: string;
  splits?: Array<{
    description: string;
    amount: number;
    category: string;
    subcategory?: string;
  }>;
}

export interface InboxActionPayload extends ReviewActionPayload {
  reviewId?: string;
  signalId?: string;
  documentId?: string;
  sourceId?: string;
}

interface NormalizedRuleAction {
  category?: string;
  subcategory?: string;
  type?: "income" | "expense" | "transfer";
  deductible?: boolean;
  excludedFromBudget?: boolean;
  isRecurring?: boolean;
  signalKind?: FinanceSignalKind;
  messageSubtype?: FinanceMessageSubtype;
  classification?: FinanceDocumentClassification;
  defaultDisposition?: FinanceSourceDisposition;
  settlementStatus?: FinanceSettlementStatus;
  sourceCurrency?: string;
  merchantId?: string;
  action?:
    | "ignore"
    | "capture_only"
    | "bill_notice"
    | "income_notice"
    | "provisional_purchase"
    | "settle_charge"
    | "refund_notice"
    | "mark_failed_payment";
}

interface ResolvedDocumentContext {
  document: Awaited<ReturnType<typeof ensureDocument>>;
  source: Awaited<ReturnType<typeof ensureSource>>;
  merchant: Awaited<ReturnType<typeof ensureMerchant>>;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toOptionalJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return toJsonValue(value);
}

function cleanString(value?: string | null) {
  return value?.trim() || null;
}

async function getOrCreateFallbackAccount(currency = "COP") {
  let account = await prisma.financialAccount.findFirst({
    where: { name: DEFAULT_FINANCE_ACCOUNT.name, isActive: true },
  });

  if (!account) {
    account = await prisma.financialAccount.create({
      data: {
        ...DEFAULT_FINANCE_ACCOUNT,
        currency,
      },
    });
  }

  return account;
}

async function ensureMerchant(rawName?: string | null) {
  const normalized = normalizeMerchantName(rawName);
  if (!normalized) return null;

  const existing = await prisma.merchant.findUnique({
    where: { normalizedName: normalized },
  });
  if (existing) return existing;

  return prisma.merchant.create({
    data: {
      name: titleCase(normalized),
      normalizedName: normalized,
      aliases: toJsonValue([rawName].filter(Boolean)),
    },
  });
}

async function refreshMerchantStats(merchantId: string) {
  const result = await prisma.financialTransaction.aggregate({
    where: {
      merchantId,
      status: "posted",
      reviewState: "resolved",
      excludedFromBudget: false,
    },
    _sum: { amount: true, taxAmount: true, tipAmount: true },
    _count: true,
  });

  await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      transactionCount: result._count,
      totalSpent: Math.abs(result._sum.amount || 0),
      totalTax: result._sum.taxAmount || 0,
      totalTip: result._sum.tipAmount || 0,
    },
  });
}

async function ensureSource(params: {
  candidate: FinanceIngestionCandidate;
  document?: FinanceDocumentInput | null;
  merchantId?: string | null;
  categoryHint?: string | null;
}) {
  const identity = buildFinanceSourceIdentity({
    source: params.candidate.source,
    sender: params.document?.sender,
    merchant: params.candidate.merchant,
    filename: params.document?.filename,
    subject: params.document?.subject || params.candidate.description,
  });

  const label =
    cleanString(identity.senderName) ||
    cleanString(identity.senderEmail) ||
    cleanString(identity.senderDomain) ||
    cleanString(params.candidate.merchant) ||
    cleanString(params.candidate.description) ||
    "Unknown source";

  return prisma.financeSource.upsert({
    where: { sourceKey: identity.sourceKey },
    create: {
      sourceKey: identity.sourceKey,
      label: label.slice(0, 140),
      senderEmail: identity.senderEmail,
      senderDomain: identity.senderDomain,
      merchantId: params.merchantId ?? null,
      categoryHint: params.categoryHint ?? null,
      firstSeenAt: params.document?.receivedAt || params.candidate.transactedAt || new Date(),
      lastSeenAt: params.document?.receivedAt || params.candidate.transactedAt || new Date(),
    },
    update: {
      label: label.slice(0, 140),
      senderEmail: identity.senderEmail || undefined,
      senderDomain: identity.senderDomain || undefined,
      merchantId: params.merchantId ?? undefined,
      categoryHint: params.categoryHint ?? undefined,
      lastSeenAt: params.document?.receivedAt || params.candidate.transactedAt || new Date(),
    },
  });
}

async function refreshSourceStats(sourceId: string) {
  const [
    documentCount,
    signalCount,
    confirmedCount,
    ignoredCount,
    autoPostCount,
    provisionalCount,
    settledCount,
    failedCount,
  ] =
    await Promise.all([
      prisma.financeDocument.count({ where: { sourceId } }),
      prisma.financeSignal.count({ where: { sourceId } }),
      prisma.financeSignal.count({
        where: { sourceId, promotionState: { in: ["auto_posted", "user_confirmed"] } },
      }),
      prisma.financeSignal.count({
        where: { sourceId, promotionState: { in: ["ignored", "dismissed"] } },
      }),
      prisma.financeSignal.count({ where: { sourceId, promotionState: "auto_posted" } }),
      prisma.financeSignal.count({ where: { sourceId, settlementStatus: "provisional" } }),
      prisma.financeSignal.count({ where: { sourceId, settlementStatus: "settled" } }),
      prisma.financeSignal.count({
        where: { sourceId, settlementStatus: { in: ["failed", "rejected"] } },
      }),
    ]);

  await prisma.financeSource.update({
    where: { id: sourceId },
    data: {
      documentCount,
      signalCount,
      confirmedCount,
      ignoredCount,
      autoPostCount,
      provisionalCount,
      settledCount,
      failedCount,
    },
  });
}

async function ensureDocument(
  input: FinanceDocumentInput | null | undefined,
  sourceId?: string | null
) {
  if (!input) return null;

  const baseData = {
    source: input.source,
    externalId: input.externalId ?? null,
    documentType: input.documentType,
    status: input.status || (input.requiresPassword ? "password_required" : "processed"),
    classification: input.classification || "unclassified",
    messageSubtype: input.messageSubtype || "unknown",
    processingStage:
      input.processingStage ||
      (input.requiresPassword ? "password_required" : input.status === "error" ? "error" : "captured"),
    mailConnectionId: input.mailConnectionId ?? null,
    sourceId: sourceId ?? null,
    sourceKey: input.sourceKey ?? null,
    groupKey: input.groupKey ?? null,
    orderRef: input.orderRef ?? null,
    chargeRef: input.chargeRef ?? null,
    messageId: input.messageId ?? null,
    threadId: input.threadId ?? null,
    attachmentId: input.attachmentId ?? null,
    filename: input.filename ?? null,
    mimeType: input.mimeType ?? null,
    sender: input.sender ?? null,
    subject: input.subject ?? null,
    receivedAt: input.receivedAt ?? null,
    contentText: input.contentText ?? null,
    extractedData: toOptionalJsonValue(input.extractedData),
    parseError: input.parseError ?? null,
    requiresPassword: input.requiresPassword ?? false,
    passwordSecretKey: input.passwordSecretKey ?? null,
  };

  if (input.id) {
    return prisma.financeDocument.update({
      where: { id: input.id },
      data: baseData,
    });
  }

  if (input.externalId) {
    const existing = await prisma.financeDocument.findFirst({
      where: { source: input.source, externalId: input.externalId },
    });
    if (existing) {
      return prisma.financeDocument.update({
        where: { id: existing.id },
        data: baseData,
      });
    }
  }

  return prisma.financeDocument.create({
    data: baseData,
  });
}

async function refreshDocumentProgress(documentId: string) {
  const document = await prisma.financeDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      classification: true,
      status: true,
      requiresPassword: true,
      signals: {
        select: {
          id: true,
          promotionState: true,
        },
      },
    },
  });

  if (!document) return;

  const signalCount = document.signals.length;
  const promotedSignalCount = document.signals.filter((signal) =>
    ["auto_posted", "user_confirmed"].includes(signal.promotionState)
  ).length;

  let processingStage = "captured";
  if (document.requiresPassword) {
    processingStage = "password_required";
  } else if (document.status === "error") {
    processingStage = "error";
  } else if (document.classification === "ignored") {
    processingStage = "ignored";
  } else if (promotedSignalCount > 0) {
    processingStage = "promoted";
  } else if (signalCount > 0) {
    processingStage = "classified";
  }

  await prisma.financeDocument.update({
    where: { id: documentId },
    data: {
      signalCount,
      promotedSignalCount,
      processingStage,
    },
  });
}

async function writeChangeLog(
  transactionId: string,
  action: string,
  before?: Prisma.InputJsonValue | null,
  after?: Prisma.InputJsonValue | null,
  note?: string
) {
  await prisma.transactionChangeLog.create({
    data: {
      transactionId,
      action,
      before: before === null ? Prisma.JsonNull : before,
      after: after === null ? Prisma.JsonNull : after,
      note: note ?? null,
    },
  });
}

function toStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function matchesTextCondition(value: string, includes: unknown, excludes: unknown) {
  const normalized = value.toLowerCase();
  const includeList = toStringList(includes).map((item) => item.toLowerCase());
  const excludeList = toStringList(excludes).map((item) => item.toLowerCase());

  if (includeList.length > 0 && !includeList.some((item) => normalized.includes(item))) {
    return false;
  }

  if (excludeList.some((item) => normalized.includes(item))) {
    return false;
  }

  return true;
}

async function findMatchingRule(input: {
  description: string;
  merchantNormalized?: string | null;
  documentSender?: string | null;
  documentSubject?: string | null;
  documentText?: string | null;
  attachmentFilename?: string | null;
  sourceKey?: string | null;
  sourceId?: string | null;
  messageSubtype?: FinanceMessageSubtype | null;
  hasAmount?: boolean;
  orderRef?: string | null;
}) {
  const rules = await prisma.financeRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const lowerDescription = input.description.toLowerCase();
  const lowerSender = input.documentSender?.toLowerCase() || "";
  const lowerSubject = input.documentSubject?.toLowerCase() || "";
  const lowerText = input.documentText?.toLowerCase() || "";
  const lowerFilename = input.attachmentFilename?.toLowerCase() || "";

  for (const rule of rules) {
    if (rule.sourceId && rule.sourceId !== input.sourceId) continue;

    const conditions = (rule.conditions || {}) as Record<string, unknown>;
    const merchantNormalized = String(conditions.merchantNormalized || "");
    const descriptionIncludes = String(conditions.descriptionIncludes || "");
    const senderIncludes = String(conditions.senderIncludes || "");
    const sourceKey = String(conditions.sourceKey || "");
    const messageSubtype = String(conditions.messageSubtype || "");
    const requiresAmount =
      typeof conditions.requiresAmount === "boolean" ? conditions.requiresAmount : null;
    const requiresOrderRef =
      typeof conditions.requiresOrderRef === "boolean" ? conditions.requiresOrderRef : null;

    const merchantMatches =
      !merchantNormalized ||
      merchantNormalized === input.merchantNormalized ||
      lowerDescription.includes(merchantNormalized);
    const descriptionMatches =
      !descriptionIncludes || lowerDescription.includes(descriptionIncludes.toLowerCase());
    const senderMatches =
      !senderIncludes || lowerSender.includes(senderIncludes.toLowerCase());
    const sourceMatches = !sourceKey || sourceKey === input.sourceKey;
    const subjectMatches = matchesTextCondition(
      lowerSubject,
      conditions.subjectIncludes,
      conditions.subjectExcludes
    );
    const bodyMatches = matchesTextCondition(
      lowerText,
      conditions.bodyIncludes,
      conditions.bodyExcludes
    );
    const attachmentMatches = matchesTextCondition(
      lowerFilename,
      conditions.attachmentFilenameIncludes,
      []
    );
    const subtypeMatches =
      !messageSubtype || messageSubtype === String(input.messageSubtype || "");
    const amountMatches =
      requiresAmount === null ? true : Boolean(input.hasAmount) === requiresAmount;
    const orderRefMatches =
      requiresOrderRef === null ? true : Boolean(input.orderRef) === requiresOrderRef;

    if (
      merchantMatches &&
      descriptionMatches &&
      senderMatches &&
      sourceMatches &&
      subjectMatches &&
      bodyMatches &&
      attachmentMatches &&
      subtypeMatches &&
      amountMatches &&
      orderRefMatches
    ) {
      return rule;
    }
  }

  return null;
}

async function maybeRunDocumentAI(input: {
  description: string;
  text: string;
  sender?: string | null;
  subject?: string | null;
  heuristicConfidence: number;
}) {
  if (input.heuristicConfidence >= 0.68) return null;
  try {
    return await analyzeFinanceDocument({
      description: input.description,
      text: input.text.slice(0, 6000),
      sender: input.sender,
      subject: input.subject,
    });
  } catch {
    return null;
  }
}

async function createReviewItems(params: {
  transactionId?: string | null;
  documentId?: string | null;
  sourceId?: string | null;
  signalId?: string | null;
  flags: string[];
  candidate: FinanceIngestionCandidate;
}) {
  if (params.flags.length === 0) return [];

  const uniqueFlags = [...new Set(params.flags)];
  const relationFilters: Prisma.FinanceReviewItemWhereInput[] = [];
  if (params.transactionId) relationFilters.push({ transactionId: params.transactionId });
  if (params.documentId) relationFilters.push({ documentId: params.documentId });
  if (params.signalId) relationFilters.push({ signalId: params.signalId });
  if (params.sourceId) relationFilters.push({ sourceId: params.sourceId });

  const existing =
    relationFilters.length > 0
      ? await prisma.financeReviewItem.findMany({
          where: {
            status: "pending",
            kind: { in: uniqueFlags },
            OR: relationFilters,
          },
          select: { kind: true },
        })
      : [];

  const existingKinds = new Set(existing.map((item) => item.kind));
  const remainingFlags = uniqueFlags.filter((flag) => !existingKinds.has(flag));
  if (remainingFlags.length === 0) return [];

  return prisma.$transaction(
    remainingFlags.map((flag) =>
      prisma.financeReviewItem.create({
        data: {
          transactionId: params.transactionId ?? null,
          documentId: params.documentId ?? null,
          sourceId: params.sourceId ?? null,
          signalId: params.signalId ?? null,
          kind: flag,
          title: titleCase(flag.replace(/_/g, " ")),
          detail: params.candidate.description,
          suggestedData: toJsonValue({
            category: params.candidate.category,
            subcategory: params.candidate.subcategory,
            type: params.candidate.type,
            amount: params.candidate.amount,
            merchant: params.candidate.merchant,
            source: params.candidate.source,
            dueDate: isValidDateValue(params.candidate.dueDate)
              ? params.candidate.dueDate.toISOString()
              : null,
          }),
        },
      })
    )
  );
}

async function settlePendingReviewItems(params: {
  transactionId?: string | null;
  documentId?: string | null;
  signalId?: string | null;
  sourceId?: string | null;
  status: "resolved" | "dismissed";
  resolution?: Prisma.InputJsonValue | null;
}) {
  const orFilters = [
    params.transactionId ? { transactionId: params.transactionId } : null,
    params.documentId ? { documentId: params.documentId } : null,
    params.signalId ? { signalId: params.signalId } : null,
    params.sourceId ? { sourceId: params.sourceId } : null,
  ].filter(Boolean) as Prisma.FinanceReviewItemWhereInput[];

  if (orFilters.length === 0) return;

  await prisma.financeReviewItem.updateMany({
    where: {
      status: "pending",
      OR: orFilters,
    },
    data: {
      status: params.status,
      resolvedAt: new Date(),
      resolution:
        params.resolution === null ? Prisma.JsonNull : params.resolution ?? undefined,
    },
  });
}

async function upsertUpcomingPaymentFromSignal(signal: {
  id: string;
  kind: string;
  documentId: string;
  merchantId?: string | null;
  description: string;
  dueDate?: Date | null;
  amount?: number | null;
  minimumDue?: number | null;
  statementBalance?: number | null;
  category?: string | null;
}) {
  if (!signal.dueDate || !["bill_due", "statement", "subscription"].includes(signal.kind)) {
    return null;
  }

  const existing = await prisma.upcomingPayment.findFirst({
    where: {
      sourceDocumentId: signal.documentId,
      description: signal.description,
    },
  });

  if (existing) {
    return prisma.upcomingPayment.update({
      where: { id: existing.id },
      data: {
        dueDate: signal.dueDate,
        amount: signal.amount ?? undefined,
        minimumDue: signal.minimumDue ?? undefined,
        statementBalance: signal.statementBalance ?? undefined,
        merchantId: signal.merchantId ?? undefined,
        category: signal.category ?? undefined,
        status: "detected",
      },
    });
  }

  return prisma.upcomingPayment.create({
    data: {
      sourceDocumentId: signal.documentId,
      merchantId: signal.merchantId ?? null,
      description: signal.description,
      dueDate: signal.dueDate,
      amount: signal.amount ?? null,
      minimumDue: signal.minimumDue ?? null,
      statementBalance: signal.statementBalance ?? null,
      category: signal.category ?? null,
      source: "email",
      status: "detected",
      confidence: 0.8,
    },
  });
}

function resolveDispositionFromRuleAction(
  action?: NormalizedRuleAction["action"]
): FinanceSourceDisposition | null {
  switch (action) {
    case "ignore":
      return "always_ignore";
    case "capture_only":
      return "capture_only";
    case "bill_notice":
      return "bill_notice";
    case "income_notice":
      return "income_notice";
    case "provisional_purchase":
      return "capture_only";
    case "settle_charge":
      return "trusted_autopost";
    case "refund_notice":
      return "trusted_autopost";
    case "mark_failed_payment":
      return "capture_only";
    default:
      return null;
  }
}

function resolveSettlementStatus(params: {
  action?: NormalizedRuleAction["action"];
  messageSubtype: FinanceMessageSubtype;
  signalKind: FinanceSignalKind;
  classification: FinanceDocumentClassification;
}) {
  if (params.classification === "ignored" || params.action === "ignore") {
    return "ignored" satisfies FinanceSettlementStatus;
  }

  if (params.action === "mark_failed_payment" || params.messageSubtype === "payment_failed") {
    return "failed" satisfies FinanceSettlementStatus;
  }

  if (params.action === "refund_notice" || params.signalKind === "refund") {
    return "refunded" satisfies FinanceSettlementStatus;
  }

  if (
    params.action === "provisional_purchase" ||
    params.messageSubtype === "order_confirmation" ||
    params.signalKind === "bill_due" ||
    params.signalKind === "statement"
  ) {
    return "provisional" satisfies FinanceSettlementStatus;
  }

  if (
    params.action === "settle_charge" ||
    params.messageSubtype === "payment_receipt" ||
    params.messageSubtype === "charge_notice" ||
    params.classification === "expense_receipt"
  ) {
    return "settled" satisfies FinanceSettlementStatus;
  }

  return "provisional" satisfies FinanceSettlementStatus;
}

function shouldAutoPromoteSignal(params: {
  signalKind: FinanceSignalKind;
  settlementStatus: FinanceSettlementStatus;
  confidence: number;
  amount?: number | null;
  cashImpactType?: FinanceIngestionCandidate["cashImpactType"];
  requiresCurrencyReview?: boolean;
  sourceDisposition: FinanceSourceDisposition;
  promotionPreference?: FinanceIngestionCandidate["promotionPreference"];
}) {
  if (
    params.settlementStatus !== "settled" ||
    params.cashImpactType === "credit_pending" ||
    params.requiresCurrencyReview ||
    ["bill_due", "statement"].includes(params.signalKind)
  ) {
    return false;
  }

  if (params.promotionPreference === "manual_post") {
    return params.amount != null;
  }

  if (params.promotionPreference === "trusted_autopost") {
    return params.amount != null;
  }

  return (
    params.amount != null &&
    params.confidence >= 0.85 &&
    params.sourceDisposition === "trusted_autopost"
  );
}

async function promoteSignalToTransaction(params: {
  signalId: string;
  accountId?: string | null;
  fields?: Partial<FinanceIngestionCandidate>;
  promotionState: "auto_posted" | "user_confirmed";
}) {
  const signal = await prisma.financeSignal.findUnique({
    where: { id: params.signalId },
    include: {
      document: true,
      source: true,
      merchant: true,
      transaction: true,
    },
  });

  if (!signal) {
    throw new Error("Finance signal not found");
  }

  const account =
    params.accountId
      ? await prisma.financialAccount.findUnique({ where: { id: params.accountId } })
      : await getOrCreateFallbackAccount(signal.currency || "COP");

  if (!account) {
    throw new Error("Could not resolve finance account");
  }

  const nextType =
    params.fields?.type || (signal.type as "income" | "expense" | "transfer" | null) || "expense";
  const nextAmountBase =
    params.fields?.amount ??
    signal.amount ??
    0;
  const nextAmount =
    nextType === "expense"
      ? -Math.abs(nextAmountBase)
      : nextType === "income"
      ? Math.abs(nextAmountBase)
      : nextAmountBase;
  const nextPocketId =
    params.fields?.pocketId ?? signal.transaction?.pocketId ?? null;
  const nextCashImpactType =
    params.fields?.cashImpactType || signal.cashImpactType || "non_cash";
  const nextNeedsCategorization =
    params.fields?.needsCategorization ??
    (nextType === "expense" && nextCashImpactType === "cash" && !nextPocketId);

  const fingerprint = buildSourceFingerprint({
    source: signal.document.source,
    amount: signal.amount,
    description: params.fields?.description || signal.description,
    transactedAt: params.fields?.transactedAt || signal.transactedAt || signal.document.receivedAt,
    merchant:
      params.fields?.merchant ||
      signal.merchant?.name ||
      signal.document.sender ||
      signal.description,
    externalId: signal.document.externalId,
  });

  const existing =
    signal.transaction ||
    (await prisma.financialTransaction.findFirst({
      where: {
        OR: [
          { sourceFingerprint: fingerprint },
          { sourceDocumentId: signal.documentId },
          signal.groupKey ? { groupKey: signal.groupKey } : undefined,
        ].filter(Boolean) as Prisma.FinancialTransactionWhereInput[],
      },
    }));

  let transaction;
  if (existing) {
    const beforeAmount = existing.amount;
    transaction = await prisma.financialTransaction.update({
      where: { id: existing.id },
      data: {
        accountId: params.accountId || existing.accountId,
        transactedAt:
          params.fields?.transactedAt ||
          signal.transactedAt ||
          signal.document.receivedAt ||
          existing.transactedAt,
        amount: nextAmount,
        currency: params.fields?.currency || signal.currency || existing.currency,
        description: params.fields?.description || signal.description,
        category: params.fields?.category || signal.category || existing.category,
        subcategory: params.fields?.subcategory ?? signal.subcategory ?? existing.subcategory,
        type: nextType,
        pocketId: nextPocketId,
        needsCategorization: nextNeedsCategorization,
        instrumentType:
          params.fields?.instrumentType ??
          signal.instrumentType ??
          existing.instrumentType,
        instrumentLast4:
          params.fields?.instrumentLast4 ??
          signal.instrumentLast4 ??
          existing.instrumentLast4,
        cashImpactType: nextCashImpactType,
        isRecurring: params.fields?.isRecurring ?? existing.isRecurring,
        merchant: params.fields?.merchant || signal.merchant?.name || existing.merchant,
        merchantId: signal.merchantId ?? existing.merchantId,
        reference: params.fields?.reference ?? signal.reference ?? existing.reference,
        notes: params.fields?.notes ?? signal.notes ?? existing.notes,
        source: signal.document.source,
        tags: params.fields?.tags?.join(",") || existing.tags,
        status: "posted",
        settlementStatus: "settled",
        reviewState: "resolved",
        confidence: params.fields?.confidence ?? signal.confidence ?? existing.confidence,
        sourceAmount: signal.sourceAmount ?? existing.sourceAmount,
        sourceCurrency: signal.sourceCurrency ?? existing.sourceCurrency,
        fxRate: signal.fxRate ?? existing.fxRate,
        fxDate: signal.fxDate ?? existing.fxDate,
        amountConfidence: signal.amountConfidence ?? existing.amountConfidence,
        amountExtractionLabel:
          signal.amountExtractionLabel ?? existing.amountExtractionLabel,
        requiresCurrencyReview: false,
        subtotalAmount:
          params.fields?.subtotalAmount ?? signal.subtotalAmount ?? existing.subtotalAmount,
        taxAmount: params.fields?.taxAmount ?? signal.taxAmount ?? existing.taxAmount,
        tipAmount: params.fields?.tipAmount ?? signal.tipAmount ?? existing.tipAmount,
        deductible: params.fields?.deductible ?? existing.deductible,
        excludedFromBudget: params.fields?.excludedFromBudget ?? false,
        sourceDocumentId: signal.documentId,
        sourceFingerprint: fingerprint,
        groupKey: signal.groupKey ?? existing.groupKey,
        orderRef: signal.orderRef ?? existing.orderRef,
        chargeRef: signal.chargeRef ?? existing.chargeRef,
      },
    });

    if (nextAmount !== beforeAmount) {
      await prisma.financialAccount.update({
        where: { id: transaction.accountId },
        data: {
          balance: { increment: nextAmount - beforeAmount },
        },
      });
    }
  } else {
    transaction = await prisma.financialTransaction.create({
      data: {
        accountId: account.id,
        transactedAt:
          params.fields?.transactedAt || signal.transactedAt || signal.document.receivedAt || new Date(),
        amount: nextAmount,
        currency: params.fields?.currency || signal.currency || account.currency || "COP",
        description: params.fields?.description || signal.description,
        category: params.fields?.category || signal.category || "other",
        subcategory: params.fields?.subcategory ?? signal.subcategory ?? null,
        type: nextType,
        pocketId: nextPocketId,
        needsCategorization: nextNeedsCategorization,
        instrumentType: params.fields?.instrumentType ?? signal.instrumentType ?? null,
        instrumentLast4: params.fields?.instrumentLast4 ?? signal.instrumentLast4 ?? null,
        cashImpactType: nextCashImpactType,
        isRecurring: params.fields?.isRecurring ?? false,
        merchant: params.fields?.merchant || signal.merchant?.name || null,
        merchantId: signal.merchantId ?? null,
        reference: params.fields?.reference ?? signal.reference ?? null,
        notes: params.fields?.notes ?? signal.notes ?? null,
        source: signal.document.source,
        tags: params.fields?.tags?.join(",") || null,
        status: "posted",
        settlementStatus: "settled",
        reviewState: "resolved",
        confidence: params.fields?.confidence ?? signal.confidence ?? null,
        sourceAmount: signal.sourceAmount ?? null,
        sourceCurrency: signal.sourceCurrency ?? null,
        fxRate: signal.fxRate ?? null,
        fxDate: signal.fxDate ?? null,
        amountConfidence: signal.amountConfidence ?? null,
        amountExtractionLabel: signal.amountExtractionLabel ?? null,
        requiresCurrencyReview: false,
        subtotalAmount: params.fields?.subtotalAmount ?? signal.subtotalAmount ?? null,
        taxAmount: params.fields?.taxAmount ?? signal.taxAmount ?? null,
        tipAmount: params.fields?.tipAmount ?? signal.tipAmount ?? null,
        deductible: params.fields?.deductible ?? false,
        excludedFromBudget: params.fields?.excludedFromBudget ?? false,
        sourceDocumentId: signal.documentId,
        sourceFingerprint: fingerprint,
        groupKey: signal.groupKey ?? null,
        orderRef: signal.orderRef ?? null,
        chargeRef: signal.chargeRef ?? null,
      },
    });

    await prisma.financialAccount.update({
      where: { id: transaction.accountId },
      data: { balance: { increment: transaction.amount } },
    });
  }

  await prisma.financeSignal.update({
    where: { id: signal.id },
    data: {
      transactionId: transaction.id,
      status: "promoted",
      promotionState: params.promotionState,
      settlementStatus: "settled",
    },
  });

  if (signal.sourceId && params.promotionState === "auto_posted") {
    await prisma.financeSource.update({
      where: { id: signal.sourceId },
      data: {
        autoPostCount: { increment: 1 },
      },
    });
  }

  await settlePendingReviewItems({
    signalId: signal.id,
    documentId: signal.documentId,
    sourceId: signal.sourceId,
    transactionId: transaction.id,
    status: "resolved",
    resolution: toJsonValue({ promotionState: params.promotionState }),
  });

  await writeChangeLog(transaction.id, "created", null, {
    category: transaction.category,
    subcategory: transaction.subcategory,
    type: transaction.type,
    confidence: transaction.confidence,
    source: transaction.source,
  });

  if (transaction.merchantId) {
    await refreshMerchantStats(transaction.merchantId);
  }
  await ensurePaycheckAllocationRunForTransaction({
    transactionId: transaction.id,
    grossAmount: Math.abs(transaction.amount),
    category: transaction.category,
    subcategory: transaction.subcategory,
    description: transaction.description,
    source: transaction.source,
    type: transaction.type,
  });
  if (signal.sourceId) {
    await refreshSourceStats(signal.sourceId);
  }
  await refreshDocumentProgress(signal.documentId);

  return transaction;
}

async function learnFromInboxAction(params: {
  sourceId?: string | null;
  signalKind?: string | null;
  action: ReviewAction;
}) {
  if (!params.sourceId) return;

  const source = await prisma.financeSource.findUnique({ where: { id: params.sourceId } });
  if (!source) return;

  if (params.action === "create_rule") {
    await prisma.financeSource.update({
      where: { id: source.id },
      data: {
        trustLevel: "trusted",
        defaultDisposition:
          params.signalKind && ["bill_due", "statement", "subscription"].includes(params.signalKind)
            ? "bill_notice"
            : params.signalKind === "income"
            ? "income_notice"
            : source.defaultDisposition === "always_ignore"
            ? "capture_only"
            : source.defaultDisposition,
      },
    });
    await refreshSourceStats(source.id);
    return;
  }

  if (params.action === "ignore" || params.action === "dismiss") {
    const nextIgnoredCount = source.ignoredCount + 1;
    await prisma.financeSource.update({
      where: { id: source.id },
      data: {
        trustLevel:
          nextIgnoredCount >= 2 && source.confirmedCount === 0 ? "ignored" : source.trustLevel,
        defaultDisposition:
          nextIgnoredCount >= 2 && source.confirmedCount === 0
            ? "always_ignore"
            : source.defaultDisposition,
      },
    });
    await refreshSourceStats(source.id);
    return;
  }

  if (params.action === "confirm" || params.action === "edit") {
    const nextConfirmedCount = source.confirmedCount + 1;
    const promoteToTrusted =
      nextConfirmedCount >= 2 &&
      params.signalKind &&
      ["purchase", "income", "refund", "transfer", "subscription"].includes(params.signalKind);

      await prisma.financeSource.update({
        where: { id: source.id },
        data: {
          trustLevel: promoteToTrusted
            ? "trusted"
            : source.trustLevel === "new"
            ? "learning"
            : source.trustLevel,
          defaultDisposition:
            params.signalKind && ["bill_due", "statement"].includes(params.signalKind)
              ? "bill_notice"
              : params.signalKind === "income"
              ? "income_notice"
              : source.defaultDisposition === "always_ignore"
              ? "capture_only"
              : source.defaultDisposition,
        },
      });
    await refreshSourceStats(source.id);
  }
}

export async function ensureRuleFromTransaction(transactionId: string, name?: string) {
  const transaction = await prisma.financialTransaction.findUnique({
    where: { id: transactionId },
    include: { merchantRef: true, sourceDocument: true },
  });
  if (!transaction) return null;

  const sourceKey = transaction.sourceDocument?.sourceKey || null;
  const source = sourceKey
    ? await prisma.financeSource.findUnique({ where: { sourceKey } })
    : null;
  const merchantNormalized =
    transaction.merchantRef?.normalizedName || normalizeMerchantName(transaction.merchant);

  return prisma.financeRule.create({
    data: {
      name: name || `Learn ${transaction.description}`,
      learned: true,
      merchantId: transaction.merchantId ?? null,
      sourceId: source?.id ?? null,
      priority: 100,
      conditions: toJsonValue({
        sourceKey,
        merchantNormalized: merchantNormalized || null,
        senderIncludes: transaction.sourceDocument?.sender || null,
        descriptionIncludes: transaction.description.toLowerCase().slice(0, 32),
      }),
      actions: toJsonValue({
        category: transaction.category,
        subcategory: transaction.subcategory,
        type: transaction.type,
        deductible: transaction.deductible,
        excludedFromBudget: transaction.excludedFromBudget,
      }),
    },
  });
}

export async function ensureRuleFromSignal(signalId: string, name?: string) {
  const signal = await prisma.financeSignal.findUnique({
    where: { id: signalId },
    include: {
      document: true,
      source: true,
    },
  });

  if (!signal || !signal.sourceId) return null;

  const action: NormalizedRuleAction["action"] =
    signal.settlementStatus === "failed" || signal.messageSubtype === "payment_failed"
      ? "mark_failed_payment"
      : signal.kind === "bill_due" || signal.kind === "statement"
      ? "bill_notice"
      : signal.settlementStatus === "provisional" || signal.messageSubtype === "order_confirmation"
      ? "provisional_purchase"
      : signal.kind === "refund"
      ? "refund_notice"
      : signal.kind === "income"
      ? "income_notice"
      : "settle_charge";

  const subjectSnippet = signal.document.subject?.slice(0, 56) || null;

  return prisma.financeRule.create({
    data: {
      name: name || `Learn ${signal.description}`,
      ruleType: "source_override",
      learned: true,
      merchantId: signal.merchantId ?? null,
      sourceId: signal.sourceId,
      priority: 160,
      conditions: toJsonValue({
        sourceId: signal.sourceId,
        messageSubtype: signal.messageSubtype,
        subjectIncludes: subjectSnippet ? [subjectSnippet] : undefined,
        requiresAmount: signal.sourceAmount != null,
        requiresOrderRef: signal.orderRef != null ? true : undefined,
      }),
      actions: toJsonValue({
        action,
        signalKind: signal.kind,
        classification:
          signal.kind === "statement"
            ? "statement"
            : signal.kind === "bill_due"
            ? "bill_notice"
            : signal.kind === "refund"
            ? "refund_notice"
            : signal.kind === "income"
            ? "income_notice"
            : "expense_receipt",
        type: signal.type,
        category: signal.category,
        subcategory: signal.subcategory,
      }),
    },
  });
}

async function resolveDocumentContext(
  candidate: FinanceIngestionCandidate
): Promise<ResolvedDocumentContext> {
  const merchant = await ensureMerchant(candidate.merchant || candidate.description);
  const sourcePreview = await ensureSource({
    candidate,
    document: candidate.document,
    merchantId: merchant?.id ?? null,
    categoryHint: candidate.category ?? null,
  });

  const document = await ensureDocument(
    {
        source: candidate.document?.source || candidate.source,
        externalId:
          candidate.document?.externalId ||
          `capture:${candidate.source}:${isValidDateValue(candidate.transactedAt) ? candidate.transactedAt.toISOString() : Date.now()}:${candidate.description.slice(0, 24)}`,
        documentType: candidate.document?.documentType || "captured_event",
        ...candidate.document,
        sourceKey:
        candidate.document?.sourceKey ||
        buildFinanceSourceIdentity({
          source: candidate.source,
          sender: candidate.document?.sender,
          merchant: candidate.merchant,
          filename: candidate.document?.filename,
          subject: candidate.document?.subject || candidate.description,
        }).sourceKey,
    },
    sourcePreview.id
  );

  return {
    document,
    source: sourcePreview,
    merchant,
  };
}

export async function ingestFinanceCandidate(candidate: FinanceIngestionCandidate) {
  const combinedText = [
    candidate.description,
    candidate.notes,
    candidate.document?.subject,
    candidate.document?.contentText,
  ]
    .filter(Boolean)
    .join(" ");

  const guessed = guessCategoryFromText(combinedText);
  const { document, source, merchant } = await resolveDocumentContext({
    ...candidate,
    category: candidate.category || guessed.category,
    subcategory: candidate.subcategory ?? guessed.subcategory,
  });

  const inferredSubtype =
    candidate.messageSubtype ||
    (document?.messageSubtype as FinanceMessageSubtype | undefined) ||
    inferFinanceMessageSubtype({
      text: combinedText,
      subject: document?.subject || candidate.document?.subject,
    });
  const orderRef =
    candidate.document?.orderRef ||
    document?.orderRef ||
    extractOrderReference(`${document?.subject || ""} ${combinedText}`);
  const chargeRef =
    candidate.document?.chargeRef ||
    document?.chargeRef ||
    candidate.reference ||
    extractChargeReference(`${document?.subject || ""} ${combinedText}`);
  const groupKey =
    candidate.document?.groupKey ||
    document?.groupKey ||
    buildSignalGroupKey({
      sourceKey: source.sourceKey,
      threadId: candidate.document?.threadId || document?.threadId,
      orderRef,
      chargeRef,
      transactedAt: candidate.transactedAt || document?.receivedAt,
      description: candidate.description,
    });

  const rule = await findMatchingRule({
    description: candidate.description,
    merchantNormalized: merchant?.normalizedName,
    documentSender: document?.sender,
    documentSubject: document?.subject,
    documentText: combinedText,
    attachmentFilename: document?.filename,
    sourceKey: source.sourceKey,
    sourceId: source.id,
    messageSubtype: inferredSubtype,
    hasAmount: candidate.amount != null,
    orderRef,
  });

  const actions = ((rule?.actions || {}) as Record<string, unknown>) as NormalizedRuleAction;
  const ruleDisposition = resolveDispositionFromRuleAction(actions.action);

  const heuristic = inferFinanceDocumentClassification({
    text: combinedText,
    subject: document?.subject || candidate.document?.subject,
    sourceDisposition:
      ruleDisposition ||
      actions.defaultDisposition ||
      (source.defaultDisposition as FinanceSourceDisposition),
    trustLevel: source.trustLevel,
  });

  const aiDecision =
    candidate.documentClassification || candidate.signalKind || candidate.category
      ? null
      : await maybeRunDocumentAI({
          description: candidate.description,
          text: combinedText,
          sender: document?.sender,
          subject: document?.subject,
          heuristicConfidence: heuristic.confidence,
        });

  const classification = (candidate.documentClassification ||
    actions.classification ||
    aiDecision?.classification ||
    heuristic.classification) as FinanceDocumentClassification;
  const signalKind = (candidate.signalKind ||
    actions.signalKind ||
    aiDecision?.signalKind ||
    heuristic.signalKind) as FinanceSignalKind;
  const messageSubtype = (candidate.messageSubtype ||
    actions.messageSubtype ||
    heuristic.messageSubtype ||
    inferredSubtype) as FinanceMessageSubtype;
  const resolvedDisposition =
    candidate.promotionPreference === "trusted_autopost"
      ? "trusted_autopost"
      : ruleDisposition ||
        actions.defaultDisposition ||
        (aiDecision?.defaultDisposition as FinanceSourceDisposition | undefined) ||
        (source.defaultDisposition as FinanceSourceDisposition) ||
        heuristic.defaultDisposition;
  const resolvedCategory =
    candidate.category || actions.category || aiDecision?.category || guessed.category;
  const resolvedSubcategory =
    candidate.subcategory ||
    actions.subcategory ||
    aiDecision?.subcategory ||
    guessed.subcategory ||
    null;
  const resolvedType =
    candidate.type ||
    actions.type ||
    aiDecision?.type ||
    heuristic.typeHint ||
    guessed.type ||
    ((candidate.amount || 0) > 0 ? "income" : "expense");
  const confidence =
    candidate.confidence ??
    aiDecision?.confidence ??
    (rule ? 0.98 : merchant ? Math.max(heuristic.confidence, guessed.confidence, 0.7) : heuristic.confidence);

  const money = extractFinanceMoney({
    text: combinedText,
    labels:
      signalKind === "bill_due" || signalKind === "statement"
        ? [
            "statement balance",
            "saldo total",
            "minimum due",
            "minimo a pagar",
            "mínimo a pagar",
            "total",
            "valor",
          ]
        : ["total", "valor", "cobrado", "pagado", "monto", "importe", "charge", "payment"],
    sourceCurrencyHint: actions.sourceCurrency || source.currencyHint || candidate.currency || null,
    sourceLocaleHint: source.localeHint,
    sourceCountryHint: source.countryHint,
    senderDomain: source.senderDomain,
  });
  const sourceAmount =
    candidate.amount != null ? Math.abs(candidate.amount) : aiDecision?.amount ?? money.sourceAmount;
  const sourceCurrency =
    normalizeCurrencyCode(candidate.currency) ||
    normalizeCurrencyCode(actions.sourceCurrency) ||
    normalizeCurrencyCode(source.currencyHint) ||
    money.sourceCurrency;
  const normalizedMoney = await normalizeAmountToCop({
    amount: sourceAmount,
    currency: sourceCurrency,
    date: candidate.transactedAt || document?.receivedAt || new Date(),
  });
  const resolvedAmount = normalizedMoney.amount;
  const dueDate =
    coerceValidDate(candidate.dueDate) ||
    coerceValidDate(aiDecision?.dueDate) ||
    extractDueDateFromText(combinedText);
  const minimumDue =
    candidate.minimumDue ??
    aiDecision?.minimumDue ??
    extractFinanceMoney({
      text: combinedText,
      labels: ["minimum due", "minimo a pagar", "mínimo a pagar"],
      sourceCurrencyHint: sourceCurrency,
      sourceLocaleHint: source.localeHint,
      sourceCountryHint: source.countryHint,
      senderDomain: source.senderDomain,
    }).sourceAmount;
  const statementBalance =
    candidate.statementBalance ??
    aiDecision?.statementBalance ??
    extractFinanceMoney({
      text: combinedText,
      labels: ["statement balance", "saldo total", "total due", "valor total"],
      sourceCurrencyHint: sourceCurrency,
      sourceLocaleHint: source.localeHint,
      sourceCountryHint: source.countryHint,
      senderDomain: source.senderDomain,
    }).sourceAmount;
  const settlementStatus = (actions.settlementStatus ||
    resolveSettlementStatus({
      action: actions.action,
      messageSubtype,
      signalKind,
      classification,
    })) as FinanceSettlementStatus;

  const updatedDocument = await prisma.financeDocument.update({
    where: { id: document!.id },
    data: {
      classification,
      messageSubtype,
      sourceId: source.id,
      sourceKey: source.sourceKey,
      groupKey,
      orderRef,
      chargeRef,
      extractedData: toOptionalJsonValue({
        ...(((document?.extractedData as Record<string, unknown> | null) || {}) as Record<
          string,
          unknown
        >),
        aiDecision: aiDecision || undefined,
        guessedCategory: guessed,
        heuristic,
        money,
        sourceAmount,
        sourceCurrency,
        normalizedAmount: resolvedAmount,
      }),
      processingStage:
        classification === "ignored"
          ? "ignored"
          : document?.requiresPassword
          ? "password_required"
          : "classified",
    },
  });

  const inferredLocaleHint =
    source.localeHint || (source.senderDomain?.endsWith(".co") ? "es-CO" : null);
  const inferredCountryHint =
    source.countryHint || (source.senderDomain?.endsWith(".co") ? "CO" : null);
  const inferredCurrencyHint =
    source.currencyHint ||
    (normalizeCurrencyCode(sourceCurrency) === "COP" && source.senderDomain?.endsWith(".co")
      ? "COP"
      : sourceCurrency);

  if (
    source.merchantId !== merchant?.id ||
    source.categoryHint !== resolvedCategory ||
    source.subcategoryHint !== resolvedSubcategory ||
    source.isBiller !== ["bill_due", "statement", "subscription"].includes(signalKind) ||
    source.isIncomeSource !== (signalKind === "income") ||
    source.isRecurring !== Boolean(candidate.isRecurring || signalKind === "subscription") ||
    source.localeHint !== inferredLocaleHint ||
    source.countryHint !== inferredCountryHint ||
    source.currencyHint !== inferredCurrencyHint
  ) {
    await prisma.financeSource.update({
      where: { id: source.id },
      data: {
        merchantId: merchant?.id ?? undefined,
        categoryHint: resolvedCategory,
        subcategoryHint: resolvedSubcategory,
        isBiller: ["bill_due", "statement", "subscription"].includes(signalKind),
        isIncomeSource: signalKind === "income",
        isRecurring: Boolean(candidate.isRecurring || signalKind === "subscription"),
        localeHint: inferredLocaleHint || undefined,
        countryHint: inferredCountryHint || undefined,
        currencyHint: inferredCurrencyHint || undefined,
      },
    });
  }

  const fingerprint = buildSignalFingerprint({
    sourceKey: source.sourceKey,
    signalKind,
    amount: resolvedAmount,
    dueDate,
    transactedAt: candidate.transactedAt || updatedDocument.receivedAt,
    description: candidate.description,
  });

  const existingSignal = await prisma.financeSignal.findFirst({
    where: {
      OR: [
        { fingerprint },
        { documentId: updatedDocument.id, kind: signalKind },
        groupKey ? { groupKey } : undefined,
      ].filter(Boolean) as Prisma.FinanceSignalWhereInput[],
    },
    include: {
      transaction: true,
    },
  });

  const signal = existingSignal
    ? await prisma.financeSignal.update({
        where: { id: existingSignal.id },
        data: {
          sourceId: source.id,
          merchantId: merchant?.id ?? null,
          matchedRuleId: rule?.id ?? null,
          kind: signalKind,
          messageSubtype,
          settlementStatus,
          confidence,
          amount: resolvedAmount ?? null,
          currency: "COP",
          sourceAmount: sourceAmount ?? null,
          sourceCurrency: sourceCurrency ?? null,
          fxRate: normalizedMoney.fxRate ?? null,
          fxDate: normalizedMoney.fxDate ?? null,
          instrumentType: candidate.instrumentType ?? null,
          instrumentLast4: candidate.instrumentLast4 ?? null,
          cashImpactType: candidate.cashImpactType || "non_cash",
          amountConfidence: money.amountConfidence ?? confidence,
          amountExtractionLabel: money.amountExtractionLabel ?? null,
          requiresCurrencyReview: normalizedMoney.requiresCurrencyReview,
          description: candidate.description,
          category: resolvedCategory,
          subcategory: resolvedSubcategory,
          type: resolvedType,
          transactedAt: candidate.transactedAt || updatedDocument.receivedAt || new Date(),
          dueDate,
          subtotalAmount: candidate.subtotalAmount ?? null,
          taxAmount: candidate.taxAmount ?? null,
          tipAmount: candidate.tipAmount ?? null,
          minimumDue,
          statementBalance,
          reference: candidate.reference ?? null,
          groupKey,
          orderRef,
          chargeRef,
          notes: candidate.notes ?? null,
          fingerprint,
          extractedData: toOptionalJsonValue({
            heuristic,
            aiDecision: aiDecision || undefined,
            matchedRuleId: rule?.id ?? null,
            settlementStatus,
          }),
        },
      })
    : await prisma.financeSignal.create({
        data: {
          documentId: updatedDocument.id,
          sourceId: source.id,
          merchantId: merchant?.id ?? null,
          matchedRuleId: rule?.id ?? null,
          kind: signalKind,
          messageSubtype,
          settlementStatus,
          confidence,
          amount: resolvedAmount ?? null,
          currency: "COP",
          sourceAmount: sourceAmount ?? null,
          sourceCurrency: sourceCurrency ?? null,
          fxRate: normalizedMoney.fxRate ?? null,
          fxDate: normalizedMoney.fxDate ?? null,
          instrumentType: candidate.instrumentType ?? null,
          instrumentLast4: candidate.instrumentLast4 ?? null,
          cashImpactType: candidate.cashImpactType || "non_cash",
          amountConfidence: money.amountConfidence ?? confidence,
          amountExtractionLabel: money.amountExtractionLabel ?? null,
          requiresCurrencyReview: normalizedMoney.requiresCurrencyReview,
          description: candidate.description,
          category: resolvedCategory,
          subcategory: resolvedSubcategory,
          type: resolvedType,
          transactedAt: candidate.transactedAt || updatedDocument.receivedAt || new Date(),
          dueDate,
          subtotalAmount: candidate.subtotalAmount ?? null,
          taxAmount: candidate.taxAmount ?? null,
          tipAmount: candidate.tipAmount ?? null,
          minimumDue,
          statementBalance,
          reference: candidate.reference ?? null,
          groupKey,
          orderRef,
          chargeRef,
          notes: candidate.notes ?? null,
          fingerprint,
          extractedData: toOptionalJsonValue({
            heuristic,
            aiDecision: aiDecision || undefined,
            matchedRuleId: rule?.id ?? null,
            settlementStatus,
          }),
        },
      });

  const shouldIgnore = classification === "ignored";
  const shouldAutoPromote = shouldAutoPromoteSignal({
    signalKind,
    settlementStatus,
    confidence,
    amount: resolvedAmount,
    cashImpactType: candidate.cashImpactType,
    requiresCurrencyReview: normalizedMoney.requiresCurrencyReview,
    sourceDisposition: resolvedDisposition,
    promotionPreference: candidate.promotionPreference,
  });

  if (shouldIgnore) {
    await prisma.financeSignal.update({
      where: { id: signal.id },
      data: {
        status: "ignored",
        promotionState: "ignored",
        settlementStatus: "ignored",
      },
    });
    await settlePendingReviewItems({
      signalId: signal.id,
      documentId: updatedDocument.id,
      sourceId: source.id,
      status: "dismissed",
      resolution: toJsonValue({ reason: "ignored_noise" }),
    });
    await refreshDocumentProgress(updatedDocument.id);
    await refreshSourceStats(source.id);
    return {
      transaction: null,
      signal: await prisma.financeSignal.findUnique({ where: { id: signal.id } }),
      document: updatedDocument,
      source,
      merchant,
      reviewItems: [],
      duplicated: false,
    };
  }

  const flags = detectPotentialFlags({
    description: candidate.description,
    confidence,
    amount: resolvedAmount,
    requiresPassword: updatedDocument.requiresPassword,
    shouldReview:
      !shouldAutoPromote &&
      ["purchase", "subscription", "income", "refund", "transfer"].includes(signalKind),
  });

  if (classification === "unclassified" || source.trustLevel === "new") {
    flags.push("source_review");
  }
  if (["bill_due", "statement", "subscription"].includes(signalKind)) {
    flags.push("bill_notice");
  }
  if (updatedDocument.parseError) {
    flags.push("parse_error");
  }
  if (normalizedMoney.requiresCurrencyReview) {
    flags.push("currency_review");
  }
  if (settlementStatus === "provisional") {
    flags.push("provisional_review");
  }
  if (["failed", "rejected"].includes(settlementStatus)) {
    flags.push("failed_payment");
  }

  let transaction = null;
  if (shouldAutoPromote) {
    transaction = await promoteSignalToTransaction({
      signalId: signal.id,
      accountId: candidate.accountId,
      promotionState:
        candidate.promotionPreference === "manual_post" ? "user_confirmed" : "auto_posted",
    });
    await learnFromInboxAction({
      sourceId: source.id,
      signalKind,
      action: candidate.promotionPreference === "manual_post" ? "confirm" : "edit",
    });
  } else {
    await prisma.financeSignal.update({
      where: { id: signal.id },
      data: {
        status:
          settlementStatus === "failed" || settlementStatus === "rejected"
            ? "resolved"
            : "pending",
        promotionState: "pending_review",
      },
    });
  }

  const reviewItems =
    transaction || shouldIgnore
      ? []
      : await createReviewItems({
          transactionId: null,
          documentId: updatedDocument.id,
          sourceId: source.id,
          signalId: signal.id,
          flags,
          candidate: {
            ...candidate,
            amount: resolvedAmount,
            currency: sourceCurrency || "COP",
            category: resolvedCategory,
            subcategory: resolvedSubcategory,
            type: resolvedType,
            dueDate,
          },
        });

  await upsertUpcomingPaymentFromSignal({
    id: signal.id,
    kind: signalKind,
    documentId: updatedDocument.id,
    merchantId: merchant?.id,
    description: candidate.description,
    dueDate,
    amount: resolvedAmount,
    minimumDue,
    statementBalance,
    category: resolvedCategory,
  });

  await refreshDocumentProgress(updatedDocument.id);
  await refreshSourceStats(source.id);
  if (merchant?.id && transaction) {
    await refreshMerchantStats(merchant.id);
  }

  return {
    transaction,
    signal: await prisma.financeSignal.findUnique({
      where: { id: signal.id },
      include: {
        source: true,
        document: true,
        merchant: true,
        transaction: true,
      },
    }),
    document: updatedDocument,
    source: await prisma.financeSource.findUnique({ where: { id: source.id } }),
    merchant,
    reviewItems,
    duplicated: false,
  };
}

export async function applyInboxAction(action: ReviewAction, payload: InboxActionPayload) {
  let review =
    payload.reviewId
      ? await prisma.financeReviewItem.findUnique({
          where: { id: payload.reviewId },
          include: {
            transaction: true,
            document: true,
            signal: true,
            source: true,
          },
        })
      : null;

  const signal =
    payload.signalId
      ? await prisma.financeSignal.findUnique({
          where: { id: payload.signalId },
          include: {
            document: true,
            source: true,
            transaction: true,
          },
        })
      : review?.signal
      ? await prisma.financeSignal.findUnique({
          where: { id: review.signal.id },
          include: {
            document: true,
            source: true,
            transaction: true,
          },
        })
      : null;

  const targetTransaction =
    payload.targetTransactionId
      ? await prisma.financialTransaction.findUnique({ where: { id: payload.targetTransactionId } })
      : null;

  switch (action) {
    case "confirm":
    case "edit": {
      if (signal) {
        const posted = await promoteSignalToTransaction({
          signalId: signal.id,
          accountId: payload.fields?.accountId || undefined,
          fields: payload.fields,
          promotionState: "user_confirmed",
        });
        await learnFromInboxAction({
          sourceId: signal.sourceId,
          signalKind: signal.kind,
          action,
        });
        if (payload.createRule) {
          await ensureRuleFromTransaction(posted.id);
        }
      } else if (review?.transaction) {
        const before = {
          category: review.transaction.category,
          subcategory: review.transaction.subcategory,
          status: review.transaction.status,
          excludedFromBudget: review.transaction.excludedFromBudget,
        };
        const updated = await prisma.financialTransaction.update({
          where: { id: review.transaction.id },
          data: {
            category: payload.fields?.category ?? undefined,
            subcategory: payload.fields?.subcategory ?? undefined,
            notes: payload.fields?.notes ?? undefined,
            merchant: payload.fields?.merchant ?? undefined,
            type: payload.fields?.type ?? undefined,
            taxAmount: payload.fields?.taxAmount ?? undefined,
            tipAmount: payload.fields?.tipAmount ?? undefined,
            deductible: payload.fields?.deductible ?? undefined,
            excludedFromBudget: payload.fields?.excludedFromBudget ?? undefined,
            reviewState: "resolved",
            status: "posted",
          },
        });
        await writeChangeLog(review.transaction.id, action, before, {
          category: updated.category,
          subcategory: updated.subcategory,
          status: updated.status,
          excludedFromBudget: updated.excludedFromBudget,
        });
        if (payload.createRule) {
          await ensureRuleFromTransaction(review.transaction.id);
        }
      }
      break;
    }
    case "ignore":
    case "dismiss": {
      if (signal) {
        await prisma.financeSignal.update({
          where: { id: signal.id },
          data: {
            status: action === "ignore" ? "ignored" : "resolved",
            promotionState: action === "ignore" ? "ignored" : "dismissed",
            settlementStatus: action === "ignore" ? "ignored" : signal.settlementStatus,
          },
        });
        await prisma.financeDocument.update({
          where: { id: signal.documentId },
          data: {
            classification: action === "ignore" ? "ignored" : undefined,
            processingStage: action === "ignore" ? "ignored" : "classified",
          },
        });
        await settlePendingReviewItems({
          signalId: signal.id,
          documentId: signal.documentId,
          sourceId: signal.sourceId,
          status: action === "ignore" ? "dismissed" : "resolved",
          resolution: toJsonValue({ action }),
        });
        await learnFromInboxAction({
          sourceId: signal.sourceId,
          signalKind: signal.kind,
          action,
        });
        await refreshDocumentProgress(signal.documentId);
      } else if (review?.transaction) {
        await prisma.financialTransaction.update({
          where: { id: review.transaction.id },
          data: {
            status: action === "ignore" ? "ignored" : undefined,
            reviewState: "dismissed",
            excludedFromBudget: true,
          },
        });
      }
      break;
    }
    case "duplicate":
    case "merge": {
      if (signal) {
        await prisma.financeSignal.update({
          where: { id: signal.id },
          data: {
            status: "duplicate",
            promotionState: "dismissed",
            settlementStatus: "ignored",
            transactionId: targetTransaction?.id ?? signal.transactionId,
          },
        });
        await settlePendingReviewItems({
          signalId: signal.id,
          documentId: signal.documentId,
          sourceId: signal.sourceId,
          transactionId: targetTransaction?.id ?? null,
          status: "resolved",
          resolution: toJsonValue({ duplicateOfId: targetTransaction?.id ?? null }),
        });
      } else if (review?.transaction) {
        await prisma.financialTransaction.update({
          where: { id: review.transaction.id },
          data: {
            status: "duplicate",
            reviewState: "resolved",
            duplicateOfId: payload.targetTransactionId ?? review.transaction.duplicateOfId,
            excludedFromBudget: true,
          },
        });
      }
      break;
    }
    case "refund": {
      if (signal) {
        const posted = await promoteSignalToTransaction({
          signalId: signal.id,
          accountId: payload.fields?.accountId || undefined,
          fields: {
            ...payload.fields,
            type: "income",
          },
          promotionState: "user_confirmed",
        });
        await prisma.financeSignal.update({
          where: { id: signal.id },
          data: {
            settlementStatus: "refunded",
          },
        });
        if (payload.targetTransactionId) {
          await prisma.financialTransaction.update({
            where: { id: posted.id },
            data: {
              refundOfId: payload.targetTransactionId,
              settlementStatus: "refunded",
            },
          });
        }
      } else if (review?.transaction) {
        await prisma.financialTransaction.update({
          where: { id: review.transaction.id },
          data: {
            status: "refunded",
            reviewState: "resolved",
            refundOfId: payload.targetTransactionId ?? review.transaction.refundOfId,
          },
        });
      }
      break;
    }
    case "split": {
      const signalTransaction =
        signal && !signal.transactionId
          ? await promoteSignalToTransaction({
              signalId: signal.id,
              accountId: payload.fields?.accountId || undefined,
              fields: payload.fields,
              promotionState: "user_confirmed",
            })
          : signal?.transaction ||
            (review?.transaction
              ? await prisma.financialTransaction.findUnique({ where: { id: review.transaction.id } })
              : null);

      if (!signalTransaction || !payload.splits?.length) break;

      await prisma.$transaction([
        prisma.financialTransaction.update({
          where: { id: signalTransaction.id },
          data: { status: "ignored", excludedFromBudget: true, reviewState: "resolved" },
        }),
        ...payload.splits.map((split) =>
          prisma.financialTransaction.create({
            data: {
              accountId: signalTransaction.accountId,
              transactedAt: signalTransaction.transactedAt,
              amount: split.amount < 0 ? split.amount : -Math.abs(split.amount),
              currency: signalTransaction.currency,
              description: split.description,
              category: split.category,
              subcategory: split.subcategory ?? null,
              type: "expense",
              merchant: signalTransaction.merchant,
              merchantId: signalTransaction.merchantId,
              notes: `Split from ${signalTransaction.description}`,
              source: signalTransaction.source,
              status: "posted",
              reviewState: "resolved",
              sourceDocumentId: signalTransaction.sourceDocumentId,
            },
          })
        ),
      ]);
      await writeChangeLog(signalTransaction.id, action, null, toJsonValue(payload.splits));
      break;
    }
    case "create_rule": {
      const transactionId =
        signal?.transactionId || review?.transactionId || payload.targetTransactionId || null;
      if (transactionId) {
        await ensureRuleFromTransaction(transactionId);
      } else if (signal?.id) {
        await ensureRuleFromSignal(signal.id);
      }
      await learnFromInboxAction({
        sourceId: signal?.sourceId || review?.sourceId,
        signalKind: signal?.kind || review?.signal?.kind || null,
        action,
      });
      break;
    }
    case "attach_password": {
      const document =
        signal?.document ||
        review?.document ||
        (payload.documentId
          ? await prisma.financeDocument.findUnique({ where: { id: payload.documentId } })
          : null);

      const passwordSecretKey =
        payload.passwordSecretKey ||
        document?.passwordSecretKey ||
        `pdf:${document?.sender || "unknown"}:${document?.filename || "attachment"}`;

      if (!payload.password || !passwordSecretKey || !document) {
        throw new Error("Password and target document are required");
      }

      await upsertVaultSecret(passwordSecretKey, "pdf_password", payload.password, {
        label: document.filename || "Bank PDF password",
        context: {
          sender: document.sender,
          filename: document.filename,
          documentId: document.id,
        },
      });

      await prisma.financeDocument.update({
        where: { id: document.id },
        data: {
          requiresPassword: false,
          passwordSecretKey,
          status: "pending",
          processingStage: "captured",
        },
      });
      break;
    }
  }

  if (review) {
    review = await prisma.financeReviewItem.update({
      where: { id: review.id },
      data: {
        status:
          action === "ignore" || action === "dismiss" ? "dismissed" : "resolved",
        resolvedAt: new Date(),
        resolution: toOptionalJsonValue(payload),
      },
      include: {
        transaction: true,
        document: true,
        signal: true,
        source: true,
      },
    });
  }

  return review;
}

export async function applyReviewAction(
  reviewId: string,
  action: ReviewAction,
  payload?: ReviewActionPayload
) {
  return applyInboxAction(action, {
    reviewId,
    ...(payload || {}),
  });
}
