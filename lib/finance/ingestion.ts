import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FINANCE_ACCOUNT,
  FINANCE_CATEGORY_KEYWORDS,
  FINANCE_REVIEW_THRESHOLD,
  type FinanceCategory,
  type ReviewAction,
} from "@/lib/finance/constants";
import { upsertVaultSecret } from "@/lib/finance/vault";

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
  document?: FinanceDocumentInput | null;
}

export interface ReviewActionPayload {
  fields?: Partial<FinanceIngestionCandidate>;
  createRule?: boolean;
  targetTransactionId?: string;
  passwordSecretKey?: string;
  password?: string;
  splits?: Array<{
    description: string;
    amount: number;
    category: string;
    subcategory?: string;
  }>;
}

interface NormalizedRuleAction {
  category?: string;
  subcategory?: string;
  type?: "income" | "expense" | "transfer";
  deductible?: boolean;
  excludedFromBudget?: boolean;
  isRecurring?: boolean;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toOptionalJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return toJsonValue(value);
}

export function normalizeMerchantName(value?: string | null) {
  if (!value) return null;

  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .replace(/\b(sas|s\.a\.s|sa|s\.a|ltda|llc|inc|corp|co)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildSourceFingerprint(input: {
  source: string;
  amount?: number | null;
  description: string;
  transactedAt?: Date | null;
  merchant?: string | null;
  externalId?: string | null;
}) {
  const payload = [
    input.source,
    input.externalId || "",
    input.amount ?? "",
    input.transactedAt ? input.transactedAt.toISOString().slice(0, 10) : "",
    normalizeMerchantName(input.merchant) || "",
    normalizeMerchantName(input.description) || input.description.toLowerCase(),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function guessCategoryFromText(text: string) {
  const lower = text.toLowerCase();

  for (const [keyword, match] of Object.entries(FINANCE_CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return {
        category: match.category,
        subcategory: match.subcategory ?? null,
        type: match.type ?? null,
        confidence: match.confidence ?? 0.8,
      };
    }
  }

  return {
    category: "other" as FinanceCategory,
    subcategory: null,
    type: null,
    confidence: 0.45,
  };
}

export function detectPotentialFlags(input: {
  description: string;
  confidence: number;
  amount?: number | null;
  requiresPassword?: boolean;
}) {
  const flags: string[] = [];
  const lower = input.description.toLowerCase();

  if (input.confidence < FINANCE_REVIEW_THRESHOLD) flags.push("low_confidence");
  if (input.amount == null) flags.push("missing_amount");
  if (/(refund|reembolso|reversed|chargeback)/.test(lower)) flags.push("refund");
  if (/(duplicate|duplicado|same day)/.test(lower)) flags.push("duplicate");
  if (input.requiresPassword) flags.push("password_required");

  return flags;
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

async function ensureDocument(input?: FinanceDocumentInput | null) {
  if (!input) return null;

  if (input.id) {
    return prisma.financeDocument.update({
      where: { id: input.id },
      data: {
        contentText: input.contentText ?? undefined,
        extractedData: toOptionalJsonValue(input.extractedData),
        parseError: input.parseError ?? undefined,
        requiresPassword: input.requiresPassword ?? undefined,
        passwordSecretKey: input.passwordSecretKey ?? undefined,
        status: input.status ?? undefined,
      },
    });
  }

  if (input.externalId) {
    const existing = await prisma.financeDocument.findFirst({
      where: { source: input.source, externalId: input.externalId },
    });
    if (existing) return existing;
  }

  return prisma.financeDocument.create({
    data: {
      source: input.source,
      externalId: input.externalId ?? null,
      documentType: input.documentType,
      status: input.status || (input.requiresPassword ? "password_required" : "processed"),
      mailConnectionId: input.mailConnectionId ?? null,
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
    },
  });
}

async function findMatchingRule(input: {
  description: string;
  merchantNormalized?: string | null;
  documentSender?: string | null;
}) {
  const rules = await prisma.financeRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const lowerDescription = input.description.toLowerCase();
  const lowerSender = input.documentSender?.toLowerCase() || "";

  for (const rule of rules) {
    const conditions = rule.conditions as Record<string, unknown>;
    const merchantNormalized = String(conditions.merchantNormalized || "");
    const descriptionIncludes = String(conditions.descriptionIncludes || "");
    const senderIncludes = String(conditions.senderIncludes || "");

    const merchantMatches =
      !merchantNormalized ||
      merchantNormalized === input.merchantNormalized ||
      lowerDescription.includes(merchantNormalized);
    const descriptionMatches =
      !descriptionIncludes || lowerDescription.includes(descriptionIncludes.toLowerCase());
    const senderMatches =
      !senderIncludes || lowerSender.includes(senderIncludes.toLowerCase());

    if (merchantMatches && descriptionMatches && senderMatches) {
      return rule;
    }
  }

  return null;
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

async function refreshMerchantStats(merchantId: string) {
  const result = await prisma.financialTransaction.aggregate({
    where: {
      merchantId,
      status: { notIn: ["duplicate", "ignored"] },
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

async function createReviewItems(params: {
  transactionId?: string | null;
  documentId?: string | null;
  flags: string[];
  candidate: FinanceIngestionCandidate;
}) {
  if (params.flags.length === 0) return [];

  const uniqueFlags = [...new Set(params.flags)];
  const relationFilters: Array<{ transactionId: string } | { documentId: string }> = [];
  if (params.transactionId) {
    relationFilters.push({ transactionId: params.transactionId });
  }
  if (params.documentId) {
    relationFilters.push({ documentId: params.documentId });
  }

  if (relationFilters.length > 0) {
    const existing = await prisma.financeReviewItem.findMany({
      where: {
        status: "pending",
        kind: { in: uniqueFlags },
        OR: relationFilters,
      },
      select: { kind: true },
    });

    const existingKinds = new Set(existing.map((item) => item.kind));
    const remainingFlags = uniqueFlags.filter((flag) => !existingKinds.has(flag));
    if (remainingFlags.length === 0) return [];

    return prisma.$transaction(
      remainingFlags.map((flag) =>
        prisma.financeReviewItem.create({
          data: {
            transactionId: params.transactionId ?? null,
            documentId: params.documentId ?? null,
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
            }),
          },
        })
      )
    );
  }

  return prisma.$transaction(
    uniqueFlags.map((flag) =>
      prisma.financeReviewItem.create({
        data: {
          transactionId: params.transactionId ?? null,
          documentId: params.documentId ?? null,
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
          }),
        },
      })
    )
  );
}

export async function ensureRuleFromTransaction(
  transactionId: string,
  name?: string
) {
  const transaction = await prisma.financialTransaction.findUnique({
    where: { id: transactionId },
    include: { merchantRef: true, sourceDocument: true },
  });
  if (!transaction) return null;

  const merchantNormalized =
    transaction.merchantRef?.normalizedName || normalizeMerchantName(transaction.merchant);

  return prisma.financeRule.create({
    data: {
      name: name || `Learn ${transaction.description}`,
      learned: true,
      merchantId: transaction.merchantId ?? null,
      priority: 100,
      conditions: toJsonValue({
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

export async function ingestFinanceCandidate(candidate: FinanceIngestionCandidate) {
  const document = await ensureDocument(candidate.document);
  const merchant = await ensureMerchant(candidate.merchant || candidate.description);
  const rule = await findMatchingRule({
    description: candidate.description,
    merchantNormalized: merchant?.normalizedName,
    documentSender: document?.sender,
  });
  const guessed = guessCategoryFromText(
    [candidate.description, candidate.notes, document?.contentText, document?.subject]
      .filter(Boolean)
      .join(" ")
  );
  const actions = (rule?.actions || {}) as NormalizedRuleAction;
  const resolvedCategory = candidate.category || actions.category || guessed.category;
  const resolvedSubcategory =
    candidate.subcategory || actions.subcategory || guessed.subcategory || null;
  const resolvedType =
    candidate.type ||
    actions.type ||
    guessed.type ||
    ((candidate.amount || 0) > 0 ? "income" : "expense");
  const confidence =
    candidate.confidence ??
    (rule ? 0.98 : merchant ? Math.max(guessed.confidence, 0.78) : guessed.confidence);

  const flags = detectPotentialFlags({
    description: candidate.description,
    confidence,
    amount: candidate.amount,
    requiresPassword: document?.requiresPassword ?? false,
  });

  const account =
    candidate.accountId
      ? await prisma.financialAccount.findUnique({ where: { id: candidate.accountId } })
      : await getOrCreateFallbackAccount(candidate.currency || "COP");

  const fingerprint = buildSourceFingerprint({
    source: candidate.source,
    amount: candidate.amount,
    description: candidate.description,
    transactedAt: candidate.transactedAt,
    merchant: merchant?.name || candidate.merchant || candidate.description,
    externalId: document?.externalId || candidate.document?.externalId || null,
  });

  const existing = await prisma.financialTransaction.findFirst({
    where: {
      OR: [{ sourceFingerprint: fingerprint }, { sourceDocumentId: document?.id || undefined }],
    },
  });

  if (existing) {
    if (!flags.includes("duplicate")) flags.push("duplicate");
    const reviewItems = await createReviewItems({
      transactionId: existing.id,
      documentId: document?.id,
      flags,
      candidate: {
        ...candidate,
        category: resolvedCategory,
        subcategory: resolvedSubcategory,
        type: resolvedType,
        confidence,
      },
    });
    return { transaction: existing, document, merchant, reviewItems, duplicated: true };
  }

  if (candidate.amount == null) {
    const reviewItems = await createReviewItems({
      documentId: document?.id,
      flags: flags.includes("missing_amount") ? flags : [...flags, "missing_amount"],
      candidate: {
        ...candidate,
        category: resolvedCategory,
        subcategory: resolvedSubcategory,
        type: resolvedType,
        confidence,
      },
    });
    return { transaction: null, document, merchant, reviewItems, duplicated: false };
  }

  const normalizedAmount =
    resolvedType === "expense"
      ? -Math.abs(candidate.amount)
      : resolvedType === "income"
      ? Math.abs(candidate.amount)
      : candidate.amount;

  const transaction = await prisma.financialTransaction.create({
    data: {
      accountId: account!.id,
      transactedAt: candidate.transactedAt || document?.receivedAt || new Date(),
      amount: normalizedAmount,
      currency: candidate.currency || account?.currency || "COP",
      description: candidate.description,
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      type: resolvedType,
      isRecurring: candidate.isRecurring || Boolean(actions.isRecurring),
      merchant: merchant?.name || candidate.merchant || null,
      merchantId: merchant?.id || null,
      reference: candidate.reference || null,
      notes: candidate.notes || null,
      source: candidate.source,
      tags: candidate.tags?.join(",") || null,
      status: candidate.status || "posted",
      reviewState: flags.length > 0 ? "pending_review" : candidate.reviewState || "resolved",
      confidence,
      subtotalAmount: candidate.subtotalAmount ?? null,
      taxAmount: candidate.taxAmount ?? null,
      tipAmount: candidate.tipAmount ?? null,
      deductible: candidate.deductible || Boolean(actions.deductible),
      excludedFromBudget:
        candidate.excludedFromBudget || Boolean(actions.excludedFromBudget),
      sourceDocumentId: document?.id || null,
      sourceFingerprint: fingerprint,
    },
  });

  await prisma.financialAccount.update({
    where: { id: account!.id },
    data: { balance: { increment: normalizedAmount } },
  });

  await writeChangeLog(transaction.id, "created", null, {
    category: resolvedCategory,
    subcategory: resolvedSubcategory,
    type: resolvedType,
    confidence,
    source: candidate.source,
  });

  if (merchant?.id) {
    await refreshMerchantStats(merchant.id);
  }

  const reviewItems = await createReviewItems({
    transactionId: transaction.id,
    documentId: document?.id,
    flags,
    candidate: {
      ...candidate,
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      type: resolvedType,
      confidence,
    },
  });

  return { transaction, document, merchant, reviewItems, duplicated: false };
}

export async function applyReviewAction(
  reviewId: string,
  action: ReviewAction,
  payload?: ReviewActionPayload
) {
  const review = await prisma.financeReviewItem.findUnique({
    where: { id: reviewId },
    include: { transaction: true, document: true },
  });

  if (!review) {
    throw new Error("Review item not found");
  }

  switch (action) {
    case "confirm":
    case "edit": {
      if (!review.transaction) break;
      const before = {
        category: review.transaction.category,
        subcategory: review.transaction.subcategory,
        status: review.transaction.status,
        excludedFromBudget: review.transaction.excludedFromBudget,
      };
      const updated = await prisma.financialTransaction.update({
        where: { id: review.transaction.id },
        data: {
          category: payload?.fields?.category ?? undefined,
          subcategory: payload?.fields?.subcategory ?? undefined,
          notes: payload?.fields?.notes ?? undefined,
          merchant: payload?.fields?.merchant ?? undefined,
          type: payload?.fields?.type ?? undefined,
          taxAmount: payload?.fields?.taxAmount ?? undefined,
          tipAmount: payload?.fields?.tipAmount ?? undefined,
          deductible: payload?.fields?.deductible ?? undefined,
          excludedFromBudget: payload?.fields?.excludedFromBudget ?? undefined,
          reviewState: "resolved",
        },
      });
      await writeChangeLog(review.transaction.id, action, before, {
        category: updated.category,
        subcategory: updated.subcategory,
        status: updated.status,
        excludedFromBudget: updated.excludedFromBudget,
      });
      if (payload?.createRule) {
        await ensureRuleFromTransaction(review.transaction.id);
      }
      break;
    }
    case "ignore":
    case "dismiss": {
      if (review.transaction) {
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
      if (!review.transaction) break;
      await prisma.financialTransaction.update({
        where: { id: review.transaction.id },
        data: {
          status: "duplicate",
          reviewState: "resolved",
          duplicateOfId: payload?.targetTransactionId ?? review.transaction.duplicateOfId,
          excludedFromBudget: true,
        },
      });
      await writeChangeLog(review.transaction.id, action, null, {
        duplicateOfId: payload?.targetTransactionId ?? null,
      });
      break;
    }
    case "refund": {
      if (!review.transaction) break;
      await prisma.financialTransaction.update({
        where: { id: review.transaction.id },
        data: {
          status: "refunded",
          reviewState: "resolved",
          refundOfId: payload?.targetTransactionId ?? review.transaction.refundOfId,
        },
      });
      await writeChangeLog(review.transaction.id, action, null, {
        refundOfId: payload?.targetTransactionId ?? null,
      });
      break;
    }
    case "split": {
      if (!review.transaction || !payload?.splits?.length) break;

      await prisma.$transaction([
        prisma.financialTransaction.update({
          where: { id: review.transaction.id },
          data: { status: "ignored", excludedFromBudget: true, reviewState: "resolved" },
        }),
        ...payload.splits.map((split) =>
          prisma.financialTransaction.create({
            data: {
              accountId: review.transaction!.accountId,
              transactedAt: review.transaction!.transactedAt,
              amount: split.amount < 0 ? split.amount : -Math.abs(split.amount),
              currency: review.transaction!.currency,
              description: split.description,
              category: split.category,
              subcategory: split.subcategory ?? null,
              type: "expense",
              merchant: review.transaction!.merchant,
              merchantId: review.transaction!.merchantId,
              notes: `Split from ${review.transaction!.description}`,
              source: review.transaction!.source,
              status: "posted",
              reviewState: "resolved",
              sourceDocumentId: review.transaction!.sourceDocumentId,
            },
          })
        ),
      ]);
      await writeChangeLog(review.transaction.id, action, null, toJsonValue(payload.splits));
      break;
    }
    case "create_rule": {
      if (review.transaction) {
        await ensureRuleFromTransaction(review.transaction.id);
      }
      break;
    }
    case "attach_password": {
      const passwordSecretKey =
        payload?.passwordSecretKey ||
        review.document?.passwordSecretKey ||
        `pdf:${review.document?.sender || "unknown"}:${review.document?.filename || "attachment"}`;

      if (!payload?.password || !passwordSecretKey) {
        throw new Error("Password and passwordSecretKey are required");
      }

      await upsertVaultSecret(passwordSecretKey, "pdf_password", payload.password, {
        label: review.document?.filename || "Bank PDF password",
        context: {
          sender: review.document?.sender,
          filename: review.document?.filename,
          documentId: review.document?.id,
        },
      });

      if (review.document) {
        await prisma.financeDocument.update({
          where: { id: review.document.id },
          data: {
            requiresPassword: false,
            passwordSecretKey,
            status: "pending",
          },
        });
      }
      break;
    }
  }

  return prisma.financeReviewItem.update({
    where: { id: reviewId },
    data: {
      status:
        action === "ignore" || action === "dismiss" ? "dismissed" : "resolved",
      resolvedAt: new Date(),
      resolution: toOptionalJsonValue(payload),
    },
  });
}
