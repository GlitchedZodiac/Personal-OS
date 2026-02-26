import { hasOpenAIKey, openai } from "@/lib/openai";
import type { FinanceInboxParsedTransaction, FinanceTransactionType } from "@/lib/finance-inbox";

export const FINANCE_CATEGORY_OPTIONS = [
  "food",
  "transport",
  "housing",
  "entertainment",
  "health",
  "education",
  "shopping",
  "personal",
  "insurance",
  "debt_payment",
  "savings",
  "income",
  "transfer",
  "other",
] as const;

const CATEGORY_KEYWORDS: Record<string, { category: string; type?: FinanceTransactionType }> = {
  // Food
  rappi: { category: "food", type: "expense" },
  ifood: { category: "food", type: "expense" },
  exito: { category: "food", type: "expense" },
  carulla: { category: "food", type: "expense" },
  jumbo: { category: "food", type: "expense" },
  restaurante: { category: "food", type: "expense" },
  // Transport
  uber: { category: "transport", type: "expense" },
  didi: { category: "transport", type: "expense" },
  gasolina: { category: "transport", type: "expense" },
  peaje: { category: "transport", type: "expense" },
  // Housing
  arriendo: { category: "housing", type: "expense" },
  epm: { category: "housing", type: "expense" },
  energia: { category: "housing", type: "expense" },
  // Entertainment
  netflix: { category: "entertainment", type: "expense" },
  spotify: { category: "entertainment", type: "expense" },
  // Income
  nomina: { category: "income", type: "income" },
  salario: { category: "income", type: "income" },
  abono: { category: "income", type: "income" },
  deposito: { category: "income", type: "income" },
};

function normalizeType(value: unknown, fallback: FinanceTransactionType): FinanceTransactionType {
  if (value === "income" || value === "expense" || value === "transfer") {
    return value;
  }
  return fallback;
}

function normalizeDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string") return fallback.toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback.toISOString();
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== "string") return "COP";
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : "COP";
}

function toAmountNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value);
  }
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : Number.NaN;
}

function guessTypeFromText(text: string): FinanceTransactionType {
  const lower = text.toLowerCase();
  const incomeSignals = [
    "abono",
    "deposito",
    "deposit",
    "nomina",
    "salary",
    "recibiste",
    "received",
    "consignacion",
  ];
  const transferSignals = [
    "transferencia",
    "transfer",
    "pse",
    "nequi",
    "daviplata",
  ];

  if (incomeSignals.some((signal) => lower.includes(signal))) return "income";
  if (transferSignals.some((signal) => lower.includes(signal))) return "transfer";
  return "expense";
}

function guessCategory(text: string) {
  const lower = text.toLowerCase();
  for (const [keyword, cfg] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return cfg.category;
    }
  }
  return "other";
}

function cleanDescription(text: string) {
  const squashed = text.replace(/\s+/g, " ").trim();
  return squashed.slice(0, 180);
}

function extractAmountCandidates(text: string) {
  const patterns = [
    /(?:cop|\$)\s*([0-9][0-9\.,]*)/gi,
    /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?)\b/g,
    /\b([0-9]{4,})\b/g,
  ];
  const values: number[] = [];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const token = (match[1] || "").trim();
      if (!token) continue;
      const normalized = token.includes(",") && token.includes(".")
        ? token.replace(/\./g, "").replace(",", ".")
        : token.replace(/,/g, "");
      const amount = Number.parseFloat(normalized);
      if (Number.isFinite(amount) && amount > 0) {
        values.push(Math.abs(amount));
      }
    }
  }

  return values;
}

function fallbackParse(input: {
  sender?: string | null;
  subject?: string | null;
  bodyText: string;
}): FinanceInboxParsedTransaction[] {
  const combined = `${input.subject || ""}\n${input.bodyText}`.trim();
  const amountCandidates = extractAmountCandidates(combined);
  if (amountCandidates.length === 0) return [];

  const type = guessTypeFromText(combined);
  const category = guessCategory(combined);
  const description = cleanDescription(input.subject || input.bodyText || "Email transaction");
  if (!description) return [];

  return [
    {
      transactedAt: new Date().toISOString(),
      amount: amountCandidates[0],
      currency: "COP",
      description,
      category,
      type,
      merchant: input.sender || null,
      reference: null,
      subcategory: null,
      confidence: 0.35,
    },
  ];
}

function sanitizeParsedTransactions(value: unknown, fallbackText: string): FinanceInboxParsedTransaction[] {
  if (!Array.isArray(value)) return [];
  const fallbackType = guessTypeFromText(fallbackText);

  const results: FinanceInboxParsedTransaction[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const amount = toAmountNumber(item.amount);
    const description = cleanDescription(String(item.description || ""));
    if (!Number.isFinite(amount) || amount <= 0 || !description) continue;

    const categoryCandidate = String(item.category || "").trim().toLowerCase();
    const category = FINANCE_CATEGORY_OPTIONS.includes(categoryCandidate as (typeof FINANCE_CATEGORY_OPTIONS)[number])
      ? categoryCandidate
      : guessCategory(description);

    results.push({
      transactedAt: normalizeDate(item.transactedAt),
      amount,
      currency: normalizeCurrency(item.currency),
      description,
      category,
      subcategory:
        typeof item.subcategory === "string" && item.subcategory.trim().length > 0
          ? item.subcategory.trim().toLowerCase()
          : null,
      type: normalizeType(item.type, fallbackType),
      merchant:
        typeof item.merchant === "string" && item.merchant.trim().length > 0
          ? item.merchant.trim()
          : null,
      reference:
        typeof item.reference === "string" && item.reference.trim().length > 0
          ? item.reference.trim()
          : null,
      confidence:
        typeof item.confidence === "number" && Number.isFinite(item.confidence)
          ? item.confidence
          : null,
    });
  }

  return results;
}

export async function parseTransactionsFromEmail(input: {
  sender?: string | null;
  subject?: string | null;
  bodyText: string;
}) {
  const compactBody = input.bodyText.slice(0, 8000);
  const fallbackText = `${input.subject || ""}\n${compactBody}`;

  if (!hasOpenAIKey) {
    return fallbackParse(input);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract financial transactions from transactional emails. Return JSON only in shape {\"transactions\":[...]}. " +
            "Each transaction must include: transactedAt (ISO), amount (positive number), currency (ISO code), description, " +
            "category (food, transport, housing, entertainment, health, education, shopping, personal, insurance, debt_payment, savings, income, transfer, other), " +
            "type (income|expense|transfer). Optional: subcategory, merchant, reference, confidence 0-1. " +
            "Do not fabricate uncertain transactions. If none exist return empty array.",
        },
        {
          role: "user",
          content: `Sender: ${input.sender || "unknown"}\nSubject: ${input.subject || "no subject"}\n\nEmail content:\n${compactBody}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const transactions = sanitizeParsedTransactions(parsed.transactions, fallbackText);
    if (transactions.length > 0) return transactions;
  } catch {
    // Fall through to regex fallback parser.
  }

  return fallbackParse(input);
}

