import crypto from "crypto";
import { FINANCE_CATEGORY_KEYWORDS, type FinanceCategory } from "@/lib/finance/constants";

export const FINANCE_SOURCE_DISPOSITIONS = [
  "always_ignore",
  "capture_only",
  "bill_notice",
  "expense_receipt",
  "income_notice",
  "trusted_autopost",
] as const;

export type FinanceSourceDisposition = (typeof FINANCE_SOURCE_DISPOSITIONS)[number];

export const FINANCE_SIGNAL_KINDS = [
  "purchase",
  "bill_due",
  "statement",
  "subscription",
  "income",
  "refund",
  "transfer",
  "unknown",
] as const;

export type FinanceSignalKind = (typeof FINANCE_SIGNAL_KINDS)[number];

export const FINANCE_DOCUMENT_CLASSIFICATIONS = [
  "ignored",
  "unclassified",
  "expense_receipt",
  "bill_notice",
  "statement",
  "income_notice",
  "refund_notice",
  "transfer_notice",
  "subscription_notice",
] as const;

export type FinanceDocumentClassification =
  (typeof FINANCE_DOCUMENT_CLASSIFICATIONS)[number];

export interface FinanceSourceIdentity {
  senderEmail: string | null;
  senderDomain: string | null;
  senderName: string | null;
  sourceKey: string;
}

export interface FinanceClassificationResult {
  classification: FinanceDocumentClassification;
  signalKind: FinanceSignalKind;
  defaultDisposition: FinanceSourceDisposition;
  typeHint: "income" | "expense" | "transfer" | null;
  shouldIgnore: boolean;
  confidence: number;
  reason: string;
}

export function isValidDateValue(value?: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function coerceValidDate(value?: Date | string | null) {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return isValidDateValue(parsed) ? parsed : null;
}

function buildValidatedDate(
  year: string | number,
  month: string | number,
  day: string | number
) {
  const parsed = new Date(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`
  );
  return isValidDateValue(parsed) ? parsed : null;
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

function normalizeKeyPart(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9@._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || ""
  );
}

export function extractSenderEmail(value?: string | null) {
  if (!value) return null;
  const angleBracketMatch = value.match(/<([^>]+)>/);
  if (angleBracketMatch?.[1]) return angleBracketMatch[1].trim().toLowerCase();
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.trim().toLowerCase() || null;
}

export function extractSenderDomain(value?: string | null) {
  const email = extractSenderEmail(value);
  return email?.split("@")[1] || null;
}

export function extractSenderDisplayName(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^"?([^"<]+)"?\s*</);
  if (match?.[1]) return match[1].trim();
  return value.split("@")[0]?.trim() || null;
}

export function buildFinanceSourceIdentity(input: {
  source: string;
  sender?: string | null;
  merchant?: string | null;
  filename?: string | null;
  subject?: string | null;
}) {
  const senderEmail = extractSenderEmail(input.sender);
  const senderDomain = extractSenderDomain(input.sender);
  const senderName = extractSenderDisplayName(input.sender);

  const sourceKey =
    senderEmail
      ? `${normalizeKeyPart(input.source)}:email:${normalizeKeyPart(senderEmail)}`
      : senderDomain
      ? `${normalizeKeyPart(input.source)}:domain:${normalizeKeyPart(senderDomain)}`
      : input.merchant
      ? `${normalizeKeyPart(input.source)}:merchant:${normalizeKeyPart(
          normalizeMerchantName(input.merchant) || input.merchant
        )}`
      : input.filename
      ? `${normalizeKeyPart(input.source)}:file:${normalizeKeyPart(input.filename)}`
      : `${normalizeKeyPart(input.source)}:subject:${normalizeKeyPart(input.subject).slice(0, 48) || "unknown"}`;

  return {
    senderEmail,
    senderDomain,
    senderName,
    sourceKey,
  } satisfies FinanceSourceIdentity;
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
    isValidDateValue(input.transactedAt) ? input.transactedAt.toISOString().slice(0, 10) : "",
    normalizeMerchantName(input.merchant) || "",
    normalizeMerchantName(input.description) || input.description.toLowerCase(),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function buildSignalFingerprint(input: {
  sourceKey: string;
  signalKind: FinanceSignalKind;
  amount?: number | null;
  dueDate?: Date | null;
  transactedAt?: Date | null;
  description: string;
}) {
  const payload = [
    input.sourceKey,
    input.signalKind,
    input.amount ?? "",
    isValidDateValue(input.dueDate) ? input.dueDate.toISOString().slice(0, 10) : "",
    isValidDateValue(input.transactedAt) ? input.transactedAt.toISOString().slice(0, 10) : "",
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
  shouldReview?: boolean;
}) {
  const flags: string[] = [];
  const lower = input.description.toLowerCase();

  if (input.confidence < 0.75) flags.push("low_confidence");
  if (input.amount == null) flags.push("missing_amount");
  if (/(refund|reembolso|reversed|chargeback)/.test(lower)) flags.push("refund");
  if (/(duplicate|duplicado|same day)/.test(lower)) flags.push("duplicate");
  if (input.requiresPassword) flags.push("password_required");
  if (input.shouldReview) flags.push("pending_transaction");

  return flags;
}

export function extractAmountCandidates(text: string) {
  const matches =
    text.match(
      /(?:cop|usd|eur|\$)\s*-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d{4,}(?:[.,]\d{1,2})?/gi
    ) || [];

  return matches
    .map((value) => {
      const cleaned = value.replace(/[^\d,.-]/g, "");
      if (!cleaned) return null;

      const normalized =
        cleaned.includes(",") && cleaned.includes(".")
          ? cleaned.replace(/\./g, "").replace(",", ".")
          : cleaned.includes(",") && !cleaned.includes(".")
          ? cleaned.replace(/\./g, "").replace(",", ".")
          : cleaned.replace(/,(?=\d{3}\b)/g, "");

      const amount = Number(normalized);
      return Number.isFinite(amount) ? Math.abs(amount) : null;
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a);
}

export function extractPrimaryAmount(text: string) {
  const values = extractAmountCandidates(text);
  return values[0] ?? null;
}

export function extractMoneyByLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(
      `${label}\\s*[:=-]?\\s*(?:cop|usd|eur|\\$)?\\s*(-?\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d{4,}(?:[.,]\\d{1,2})?)`,
      "i"
    );
    const match = text.match(regex);
    if (!match?.[1]) continue;
    const parsed = extractPrimaryAmount(match[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

export function extractDueDateFromText(text: string) {
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return buildValidatedDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const slashMatch = text.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const dayFirst = buildValidatedDate(year, second, first);
    const monthFirst = buildValidatedDate(year, first, second);

    if (dayFirst && !monthFirst) return dayFirst;
    if (monthFirst && !dayFirst) return monthFirst;

    const lower = text.toLowerCase();
    if (/(fecha|vence|vencimiento|minimo a pagar|factura|recibo|pago)/.test(lower)) {
      return dayFirst;
    }

    if (/(due|statement|payment|bill|invoice|receipt|charge)/.test(lower)) {
      return monthFirst;
    }

    return dayFirst || monthFirst;
  }

  return null;
}

export function inferFinanceDocumentClassification(input: {
  text: string;
  subject?: string | null;
  sourceDisposition?: FinanceSourceDisposition | null;
  trustLevel?: string | null;
}) {
  const combined = `${input.subject || ""} ${input.text}`.toLowerCase();
  const amount = extractPrimaryAmount(combined);

  if (input.sourceDisposition === "always_ignore") {
    return {
      classification: "ignored",
      signalKind: "unknown",
      defaultDisposition: "always_ignore",
      typeHint: null,
      shouldIgnore: true,
      confidence: 0.99,
      reason: "Source explicitly marked to ignore.",
    } satisfies FinanceClassificationResult;
  }

  if (input.sourceDisposition === "trusted_autopost") {
    if (/(refund|reembolso|chargeback)/.test(combined)) {
      return {
        classification: "refund_notice",
        signalKind: "refund",
        defaultDisposition: "trusted_autopost",
        typeHint: "income",
        shouldIgnore: false,
        confidence: 0.96,
        reason: "Trusted source with refund markers.",
      } satisfies FinanceClassificationResult;
    }

    if (/(salary|payroll|nomina|salario|payout|deposito)/.test(combined)) {
      return {
        classification: "income_notice",
        signalKind: "income",
        defaultDisposition: "trusted_autopost",
        typeHint: "income",
        shouldIgnore: false,
        confidence: 0.96,
        reason: "Trusted source with income markers.",
      } satisfies FinanceClassificationResult;
    }

    return {
      classification: "expense_receipt",
      signalKind: "purchase",
      defaultDisposition: "trusted_autopost",
      typeHint: "expense",
      shouldIgnore: false,
      confidence: 0.94,
      reason: "Trusted finance source.",
    } satisfies FinanceClassificationResult;
  }

  const promoNoise =
    /(deal|deals|offer|offers|sale|promo|promocion|promociones|discount|descuento|newsletter|newsletters|imperdibles|you.?ll love|fares from|flight deals|up to \d+%|hasta \d+%)/.test(
      combined
    ) && !/(paid|payment|purchase|receipt|factura|recibo|transaction|charge|bill|statement|minimum due|saldo|reembolso|refund)/.test(
      combined
    );

  if (promoNoise) {
    return {
      classification: "ignored",
      signalKind: "unknown",
      defaultDisposition: "always_ignore",
      typeHint: null,
      shouldIgnore: true,
      confidence: 0.94,
      reason: "Promotional email with no charge or statement markers.",
    } satisfies FinanceClassificationResult;
  }

  if (/(minimum due|minimo a pagar|payment due|vence el|due date|fecha limite|statement balance|saldo total|estado de cuenta)/.test(combined)) {
    return {
      classification: /(statement|estado de cuenta|statement balance|saldo total)/.test(combined)
        ? "statement"
        : "bill_notice",
      signalKind: /(subscription|suscripcion|renewal|renovacion|monthly plan|plan mensual)/.test(combined)
        ? "subscription"
        : /(statement|estado de cuenta|statement balance|saldo total)/.test(combined)
        ? "statement"
        : "bill_due",
      defaultDisposition: "bill_notice",
      typeHint: "expense",
      shouldIgnore: false,
      confidence: amount != null ? 0.86 : 0.72,
      reason: "Billing and due-date markers detected.",
    } satisfies FinanceClassificationResult;
  }

  if (/(refund|reembolso|chargeback|reversed charge)/.test(combined)) {
    return {
      classification: "refund_notice",
      signalKind: "refund",
      defaultDisposition: "capture_only",
      typeHint: "income",
      shouldIgnore: false,
      confidence: amount != null ? 0.84 : 0.68,
      reason: "Refund markers detected.",
    } satisfies FinanceClassificationResult;
  }

  if (/(salary|payroll|nomina|salario|deposito|abono|payout|payment received|received payment)/.test(combined)) {
    return {
      classification: "income_notice",
      signalKind: "income",
      defaultDisposition: input.trustLevel === "trusted" ? "trusted_autopost" : "income_notice",
      typeHint: "income",
      shouldIgnore: false,
      confidence: amount != null ? 0.88 : 0.72,
      reason: "Income markers detected.",
    } satisfies FinanceClassificationResult;
  }

  if (/(transferencia|transfer|pse|moviendo dinero|internal transfer)/.test(combined)) {
    return {
      classification: "transfer_notice",
      signalKind: "transfer",
      defaultDisposition: input.trustLevel === "trusted" ? "trusted_autopost" : "capture_only",
      typeHint: "transfer",
      shouldIgnore: false,
      confidence: amount != null ? 0.82 : 0.65,
      reason: "Transfer markers detected.",
    } satisfies FinanceClassificationResult;
  }

  if (/(subscription|suscripcion|renewal|renovacion|plan mensual|monthly plan)/.test(combined)) {
    return {
      classification: "subscription_notice",
      signalKind: "subscription",
      defaultDisposition: input.trustLevel === "trusted" ? "trusted_autopost" : "expense_receipt",
      typeHint: "expense",
      shouldIgnore: false,
      confidence: amount != null ? 0.84 : 0.66,
      reason: "Subscription markers detected.",
    } satisfies FinanceClassificationResult;
  }

  if (/(receipt|invoice|payment confirmation|payment processed|paid|purchase|order confirmation|charge|factura|recibo|pago|compra|cobro|transaction approved)/.test(combined)) {
    return {
      classification: "expense_receipt",
      signalKind: "purchase",
      defaultDisposition: input.trustLevel === "trusted" ? "trusted_autopost" : "expense_receipt",
      typeHint: "expense",
      shouldIgnore: false,
      confidence: amount != null ? 0.82 : 0.6,
      reason: "Purchase or receipt markers detected.",
    } satisfies FinanceClassificationResult;
  }

  return {
    classification: "unclassified",
    signalKind: "unknown",
    defaultDisposition: "capture_only",
    typeHint: null,
    shouldIgnore: false,
    confidence: amount != null ? 0.48 : 0.35,
    reason: "No strong finance pattern detected.",
  } satisfies FinanceClassificationResult;
}
