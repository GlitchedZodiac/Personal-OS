const POSITIVE_AMOUNT_LABELS = [
  "total",
  "total pagado",
  "valor",
  "valor total",
  "monto",
  "importe",
  "pagado",
  "cobrado",
  "charge",
  "charged",
  "payment",
  "payment total",
  "amount",
  "approved",
  "aprobada",
  "operacion",
  "operación",
  "purchase",
  "receipt",
  "pago",
  "compra",
  "transaccion",
  "transacción",
  "statement balance",
  "saldo total",
  "minimum due",
  "minimo a pagar",
  "mínimo a pagar",
  "subtotal",
  "tax",
  "tip",
];

const NEGATIVE_AMOUNT_LABELS = [
  "referencia",
  "reference",
  "factura",
  "invoice no",
  "invoice number",
  "documento",
  "document",
  "autorizacion",
  "autorización",
  "nit",
  "id",
  "uuid",
  "pedido",
  "orden",
  "tracking",
  "secuencia",
  "transaction id",
  "transaction number",
  "approval code",
  "codigo",
  "código",
  "customer",
];

const CURRENCY_MARKERS: Record<string, string[]> = {
  COP: ["cop", "col$", "peso colombiano", "pesos colombianos", "cop$", "colombian peso"],
  USD: ["usd", "us$", "u$s", "dolar", "dólar", "dolares", "dólares", "dollar", "dollars"],
  EUR: ["eur", "€", "euro", "euros"],
};

export interface FinanceMoneyExtractionInput {
  text: string;
  labels?: string[];
  sourceCurrencyHint?: string | null;
  sourceLocaleHint?: string | null;
  sourceCountryHint?: string | null;
  senderDomain?: string | null;
}

export interface FinanceMoneyExtractionResult {
  sourceAmount: number | null;
  sourceCurrency: string | null;
  amountConfidence: number;
  amountExtractionLabel: string | null;
  requiresCurrencyReview: boolean;
}

interface MoneyCandidate {
  raw: string;
  amount: number;
  label: string | null;
  currency: string | null;
  score: number;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();
}

export function normalizeCurrencyCode(value?: string | null) {
  const normalized = normalizeText(value || "").trim();
  if (!normalized) return null;

  for (const [currency, markers] of Object.entries(CURRENCY_MARKERS)) {
    if (markers.some((marker) => normalized.includes(normalizeText(marker)))) {
      return currency;
    }
  }

  if (normalized === "cop" || normalized === "usd" || normalized === "eur") {
    return normalized.toUpperCase();
  }

  return null;
}

function detectExplicitCurrency(context: string) {
  for (const [currency, markers] of Object.entries(CURRENCY_MARKERS)) {
    if (markers.some((marker) => normalizeText(context).includes(normalizeText(marker)))) {
      return currency;
    }
  }

  return null;
}

export function isLikelyLocalFinanceSource(input: {
  sourceCurrencyHint?: string | null;
  sourceLocaleHint?: string | null;
  sourceCountryHint?: string | null;
  senderDomain?: string | null;
}) {
  const currencyHint = normalizeCurrencyCode(input.sourceCurrencyHint);
  if (currencyHint === "COP") return true;

  const localeHint = normalizeText(input.sourceLocaleHint || "");
  if (localeHint.startsWith("es-co")) return true;

  const countryHint = normalizeText(input.sourceCountryHint || "");
  if (countryHint === "co" || countryHint === "colombia") return true;

  const domain = normalizeText(input.senderDomain || "");
  if (domain.endsWith(".com.co") || (domain.endsWith(".co") && !domain.endsWith(".co.uk"))) {
    return true;
  }

  return false;
}

function parseLocaleMoney(raw: string, preferLocal: boolean, explicitCurrency?: string | null) {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^-/, "");

  if (!/[0-9]/.test(unsigned)) return null;

  let normalized = unsigned;

  if (unsigned.includes(".") && unsigned.includes(",")) {
    const lastDot = unsigned.lastIndexOf(".");
    const lastComma = unsigned.lastIndexOf(",");
    if (lastDot > lastComma) {
      normalized = unsigned.replace(/,/g, "");
    } else {
      normalized = unsigned.replace(/\./g, "").replace(",", ".");
    }
  } else if (preferLocal || explicitCurrency === "COP") {
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(unsigned)) {
      normalized = unsigned.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+,\d{1,2}$/.test(unsigned)) {
      normalized = unsigned.replace(",", ".");
    } else if (/^\d+\.\d{1,2}$/.test(unsigned)) {
      normalized = unsigned;
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(unsigned)) {
      normalized = unsigned.replace(/,/g, "");
    } else {
      normalized = unsigned.replace(/[.,](?=\d{3}\b)/g, "");
    }
  } else {
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(unsigned)) {
      normalized = unsigned.replace(/,/g, "");
    } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(unsigned)) {
      normalized = unsigned.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+,\d{1,2}$/.test(unsigned)) {
      normalized = unsigned.replace(",", ".");
    } else {
      normalized = unsigned.replace(/,(?=\d{3}\b)/g, "");
    }
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return negative ? -Math.abs(amount) : Math.abs(amount);
}

function getLabelWindow(text: string, start: number, end: number) {
  const before = text.slice(Math.max(0, start - 56), start);
  const after = text.slice(end, Math.min(text.length, end + 32));
  return { before, after, context: `${before} ${text.slice(start, end)} ${after}` };
}

function deriveCandidateLabel(before: string, after: string) {
  const normalizedBefore = normalizeText(before);
  const normalizedAfter = normalizeText(after);

  const positiveBefore = POSITIVE_AMOUNT_LABELS.find((label) =>
    normalizedBefore.includes(normalizeText(label))
  );
  if (positiveBefore) return positiveBefore;

  const positiveAfter = POSITIVE_AMOUNT_LABELS.find((label) =>
    normalizedAfter.includes(normalizeText(label))
  );
  if (positiveAfter) return positiveAfter;

  const trailingWords = before
    .split(/[\n:;|]/)
    .pop()
    ?.trim()
    .split(/\s+/)
    .slice(-3)
    .join(" ");

  return trailingWords ? normalizeText(trailingWords) : null;
}

function looksReferenceLike(raw: string, context: string, label: string | null) {
  const normalizedContext = normalizeText(context);
  const normalizedLabel = normalizeText(label || "");
  const digitsOnly = raw.replace(/\D/g, "");

  if (/[a-f0-9]{8}-[a-f0-9]{4}-/i.test(context)) return true;
  if (digitsOnly.length >= 8 && !/[.,]/.test(raw) && !label) return true;
  if (
    NEGATIVE_AMOUNT_LABELS.some(
      (item) => normalizedContext.includes(normalizeText(item)) || normalizedLabel.includes(normalizeText(item))
    )
  ) {
    return true;
  }

  return false;
}

function scoreMoneyCandidate(params: {
  amount: number;
  raw: string;
  label: string | null;
  context: string;
  explicitCurrency: string | null;
  preferLocal: boolean;
  labelFilter?: string[] | null;
}) {
  const normalizedLabel = normalizeText(params.label || "");
  const matchesFilter =
    !params.labelFilter?.length ||
    params.labelFilter.some((label) => normalizedLabel.includes(normalizeText(label)));
  let score = matchesFilter ? 0.2 : 0.1;

  if (
    POSITIVE_AMOUNT_LABELS.some((label) => normalizedLabel.includes(normalizeText(label))) ||
    normalizeText(params.context).match(/\b(total|valor|monto|importe|pagado|cobrado|charge|payment|pago|compra)\b/)
  ) {
    score += 0.45;
  }

  if (params.explicitCurrency) score += 0.25;
  if (params.preferLocal && /\d{1,3}(?:\.\d{3})+/.test(params.raw)) score += 0.2;
  if (params.amount >= 1000) score += 0.1;
  if (params.amount < 1000 && !params.explicitCurrency && !params.label) score -= 0.25;
  if (looksReferenceLike(params.raw, params.context, params.label)) score -= 0.65;
  if (!matchesFilter) score -= 0.35;

  return score;
}

function collectMoneyCandidates(
  text: string,
  input: FinanceMoneyExtractionInput
) {
  const candidates: MoneyCandidate[] = [];
  const amountRegex =
    /(?:cop|usd|eur|col\$|us\$|u\$s|€|\$)?\s*-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|(?:cop|usd|eur|col\$|us\$|u\$s|€|\$)\s*-?\d+(?:[.,]\d{1,2})?|\b-?\d{4,}(?:[.,]\d{1,2})?\b/gi;
  const preferLocal = isLikelyLocalFinanceSource(input);
  const labelFilter = input.labels?.map((label) => normalizeText(label)) || null;

  for (const match of text.matchAll(amountRegex)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const { before, after, context } = getLabelWindow(text, index, index + raw.length);
    const explicitCurrency =
      detectExplicitCurrency(raw) || detectExplicitCurrency(before.slice(-16)) || detectExplicitCurrency(after.slice(0, 16));
    const amount = parseLocaleMoney(raw, preferLocal, explicitCurrency);
    if (amount == null) continue;

    const label = deriveCandidateLabel(before, after);
    const score = scoreMoneyCandidate({
      amount,
      raw,
      label,
      context,
      explicitCurrency,
      preferLocal,
      labelFilter,
    });

    if (score < 0.2) continue;

    candidates.push({
      raw,
      amount,
      label,
      currency: explicitCurrency,
      score,
    });
  }

  return candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
}

export function extractFinanceMoney(
  input: FinanceMoneyExtractionInput
): FinanceMoneyExtractionResult {
  const text = input.text || "";
  const candidates = collectMoneyCandidates(text, input);
  const best = candidates[0];
  const localSource = isLikelyLocalFinanceSource(input);
  const hintedCurrency = normalizeCurrencyCode(input.sourceCurrencyHint);

  if (!best) {
    return {
      sourceAmount: null,
      sourceCurrency: hintedCurrency && localSource ? hintedCurrency : null,
      amountConfidence: 0,
      amountExtractionLabel: null,
      requiresCurrencyReview: !localSource && !hintedCurrency,
    };
  }

  const sourceCurrency =
    best.currency ||
    (localSource ? hintedCurrency || "COP" : hintedCurrency || null);

  return {
    sourceAmount: Math.abs(best.amount),
    sourceCurrency,
    amountConfidence: Math.max(0, Math.min(best.score, 0.99)),
    amountExtractionLabel: best.label,
    requiresCurrencyReview: best.amount > 0 && !sourceCurrency,
  };
}

export function extractPrimaryAmount(
  text: string,
  hints?: Omit<FinanceMoneyExtractionInput, "text" | "labels">
) {
  return extractFinanceMoney({ text, ...hints }).sourceAmount;
}

export function extractMoneyByLabel(
  text: string,
  labels: string[],
  hints?: Omit<FinanceMoneyExtractionInput, "text" | "labels">
) {
  return extractFinanceMoney({
    text,
    labels,
    ...hints,
  }).sourceAmount;
}
