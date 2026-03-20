import type { FinanceIngestionCandidate } from "@/lib/finance/ingestion";

function parseLocalizedAmount(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").trim();
  if (!normalized) return null;

  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      return Number(normalized.replace(/\./g, "").replace(",", "."));
    }
    return Number(normalized.replace(/,/g, ""));
  }

  if (commaCount > 0) {
    const [head, tail] = normalized.split(",");
    if (tail && tail.length <= 2) {
      return Number(`${head.replace(/\./g, "")}.${tail}`);
    }
    return Number(normalized.replace(/,/g, "."));
  }

  if (dotCount > 1) {
    return Number(normalized.replace(/\./g, ""));
  }

  if (dotCount === 1) {
    const [head, tail] = normalized.split(".");
    if (tail && tail.length <= 2) {
      return Number(`${head}.${tail}`);
    }
    return Number(normalized.replace(/\./g, ""));
  }

  return Number(normalized);
}

function parseLocalDateTime(dateText: string, timeText: string) {
  const [day, month, year] = dateText.split("/").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  if (!day || !month || !year || hour == null || minute == null) {
    return null;
  }
  return new Date(year, month - 1, day, hour, minute);
}

function cleanMerchant(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function matchBody(text: string, pattern: RegExp) {
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.match(pattern);
}

export function buildCuratedFinanceCandidate(params: {
  sender: string;
  subject: string;
  text: string;
  receivedAt: Date;
  primaryCashAccountId: string;
  document: NonNullable<FinanceIngestionCandidate["document"]>;
}): FinanceIngestionCandidate | null {
  const senderLower = params.sender.toLowerCase();
  const subjectLower = params.subject.toLowerCase();
  const textLower = params.text.toLowerCase();

  if (senderLower.includes("gusto.com")) {
    const companyMatch =
      matchBody(params.subject, /payment from\s+(.+?)\s+is on its way/i) ||
      matchBody(params.text, /payment initiated from\s+(.+?)(?:\s+total|$)/i);
    const amountMatch = matchBody(params.text, /total\s+([\d.,]+)\s+(cop|usd|eur)/i);
    const amount = amountMatch ? parseLocalizedAmount(amountMatch[1]) : null;
    const currency = amountMatch?.[2]?.toUpperCase() || "COP";
    const company = cleanMerchant(companyMatch?.[1] || "Gusto payroll");

    if (amount) {
      return {
        accountId: params.primaryCashAccountId,
        transactedAt: params.receivedAt,
        amount,
        currency,
        description: `Gusto paycheck from ${company}`,
        category: "income",
        subcategory: "salary",
        type: "income",
        signalKind: "income",
        messageSubtype: "payment_receipt",
        documentClassification: "income_notice",
        merchant: company,
        notes: `Imported from ${params.sender}`,
        source: "email",
        confidence: 0.99,
        promotionPreference: "trusted_autopost",
        cashImpactType: "cash",
        needsCategorization: false,
        document: params.document,
      };
    }
  }

  if (
    senderLower.includes("bancolombia") ||
    subjectLower.includes("bancolombia") ||
    textLower.includes("bancolombia:")
  ) {
    const success = matchBody(
      params.text,
      /compraste\s+\$?\s*([\d.,]+)\s+en\s+(.+?)\s+con\s+tu\s+(t\.(?:deb|cred))\s*\*(\d{4}),\s+el\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+las\s+(\d{2}:\d{2})/i
    );

    if (success) {
      const amount = parseLocalizedAmount(success[1]);
      const merchant = cleanMerchant(success[2]);
      const instrumentRaw = success[3].toLowerCase();
      const instrumentType = instrumentRaw.includes("deb") ? "debit_card" : "credit_card";
      const instrumentLast4 = success[4];
      const transactedAt = parseLocalDateTime(success[5], success[6]) || params.receivedAt;

      if (!amount) return null;

      return {
        accountId:
          instrumentType === "debit_card" ? params.primaryCashAccountId : undefined,
        transactedAt,
        amount,
        currency: "COP",
        description: merchant,
        category: "other",
        type: "expense",
        signalKind: "purchase",
        messageSubtype: "charge_notice",
        documentClassification: "expense_receipt",
        merchant,
        notes: `Imported from ${params.sender}`,
        source: "email",
        confidence: 0.99,
        promotionPreference:
          instrumentType === "debit_card" ? "trusted_autopost" : "source_policy",
        cashImpactType:
          instrumentType === "debit_card" ? "cash" : "credit_pending",
        needsCategorization: instrumentType === "debit_card",
        instrumentType,
        instrumentLast4,
        document: params.document,
      };
    }

    const failed = matchBody(
      params.text,
      /tu\s+compra\s+en\s+(.+?)\s+por\s+\$?\s*([\d.,]+)\s+no\s+fue\s+exitosa.*?(t\.(?:deb|cred))\s*\*(\d{4}).*?(\d{2}:\d{2})[\s.:,-]*(\d{2}\/\d{2}\/\d{4})/i
    );

    if (failed) {
      const amount = parseLocalizedAmount(failed[2]);
      const merchant = cleanMerchant(failed[1]);
      const instrumentRaw = failed[3].toLowerCase();
      const instrumentType = instrumentRaw.includes("deb") ? "debit_card" : "credit_card";
      const instrumentLast4 = failed[4];
      const transactedAt = parseLocalDateTime(failed[6], failed[5]) || params.receivedAt;

      return {
        transactedAt,
        amount: amount ?? undefined,
        currency: "COP",
        description: merchant,
        category: "other",
        type: "expense",
        signalKind: "purchase",
        messageSubtype: "payment_failed",
        documentClassification: "expense_receipt",
        merchant,
        notes: `Failed Bancolombia transaction alert from ${params.sender}`,
        source: "email",
        confidence: 0.99,
        promotionPreference: "source_policy",
        cashImpactType: "non_cash",
        needsCategorization: false,
        instrumentType,
        instrumentLast4,
        document: params.document,
      };
    }
  }

  return null;
}
