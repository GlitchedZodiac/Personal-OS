import { prisma } from "@/lib/prisma";

export interface MatchedPrioritySource {
  id: string;
  label: string;
  sourceRole: string;
  institution: string | null;
  provider: string | null;
  defaultDisposition: string;
  passwordSecretKey: string | null;
}

const DEFAULT_PRIORITY_SOURCES = [
  {
    label: "Bancolombia Transactions",
    sourceRole: "bank_transaction",
    institution: "Bancolombia",
    provider: "Bancolombia",
    senderDomainPattern: "bancolombia\\.com(\\.co)?|grupobancolombia\\.com",
    subjectPattern: "compra|pago|transaccion|transacci[oó]n|debito|d[eé]bito|credito|cr[eé]dito",
    defaultDisposition: "capture_only",
    parserPriority: 300,
    isPinned: true,
    active: true,
    passwordSecretKey: null,
    notes: "Seeded critical source for bank transaction alerts.",
  },
  {
    label: "Bancolombia Statements",
    sourceRole: "card_statement",
    institution: "Bancolombia",
    provider: "Bancolombia",
    senderDomainPattern: "bancolombia\\.com(\\.co)?|grupobancolombia\\.com|documenteme\\.co",
    subjectPattern:
      "estado de cuenta|minimo a pagar|m[ií]nimo a pagar|saldo total|extracto|facturaci[oó]n",
    defaultDisposition: "bill_notice",
    parserPriority: 400,
    isPinned: true,
    active: true,
    passwordSecretKey: "pdf:bancolombia:statement-default",
    notes: "Seeded critical source for statement and card balance emails.",
  },
  {
    label: "Gusto Payroll",
    sourceRole: "payroll",
    institution: null,
    provider: "Gusto",
    senderDomainPattern: "gusto\\.com|gusto-mail\\.com|gustoapp\\.com",
    subjectPattern: "payroll|paystub|salary|deposit|compensation|gusto",
    defaultDisposition: "income_notice",
    parserPriority: 350,
    isPinned: true,
    active: true,
    passwordSecretKey: null,
    notes: "Seeded critical source for payroll and paycheck emails.",
  },
] as const;

function patternMatches(pattern: string | null | undefined, value: string | null | undefined) {
  if (!pattern || !value) return false;
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
}

export async function ensurePrioritySourcesSeeded() {
  for (const source of DEFAULT_PRIORITY_SOURCES) {
    const existing = await prisma.financePrioritySource.findFirst({
      where: {
        label: source.label,
        sourceRole: source.sourceRole,
      },
    });

    if (existing) continue;

    await prisma.financePrioritySource.create({
      data: source,
    });
  }
}

export async function getActivePrioritySources() {
  await ensurePrioritySourcesSeeded();
  return prisma.financePrioritySource.findMany({
    where: { active: true },
    orderBy: [{ parserPriority: "desc" }, { createdAt: "asc" }],
  });
}

export async function matchPrioritySource(params: {
  sender?: string | null;
  senderDomain?: string | null;
  subject?: string | null;
}) {
  const active = await getActivePrioritySources();
  const sender = params.sender || "";
  const senderDomain = params.senderDomain || "";
  const subject = params.subject || "";

  const match = active.find((item) => {
    const senderEmailMatch = patternMatches(item.senderEmailPattern, sender);
    const senderDomainMatch = patternMatches(item.senderDomainPattern, senderDomain);
    const subjectMatch = patternMatches(item.subjectPattern, subject);
    return senderEmailMatch || senderDomainMatch || subjectMatch;
  });

  if (!match) return null;

  return {
    id: match.id,
    label: match.label,
    sourceRole: match.sourceRole,
    institution: match.institution,
    provider: match.provider,
    defaultDisposition: match.defaultDisposition,
    passwordSecretKey: match.passwordSecretKey,
  } satisfies MatchedPrioritySource;
}

export async function syncSourceWithPriorityMatch(
  sourceId: string,
  match: MatchedPrioritySource | null
) {
  if (!match) return null;

  return prisma.financeSource.update({
    where: { id: sourceId },
    data: {
      isPriority: true,
      prioritySourceRole: match.sourceRole,
      priorityInstitution: match.institution || match.provider || null,
      reviewedAt: new Date(),
      defaultDisposition:
        match.defaultDisposition === "income_notice" ||
        match.defaultDisposition === "bill_notice" ||
        match.defaultDisposition === "capture_only"
          ? match.defaultDisposition
          : undefined,
      isIncomeSource: match.sourceRole === "payroll" ? true : undefined,
      isBiller:
        match.sourceRole === "card_statement" || match.sourceRole === "bank_statement"
          ? true
          : undefined,
    },
  });
}

export async function buildPrioritySourceSearchTerms() {
  const active = await getActivePrioritySources();
  const terms = new Set<string>();

  for (const source of active) {
    if (source.senderDomainPattern) {
      for (const domain of source.senderDomainPattern.split("|")) {
        const cleaned = domain.replace(/\\/g, "").replace(/\./g, ".").replace(/\(\.co\)\?/g, ".co");
        const token = cleaned.replace(/[^a-zA-Z0-9.-]/g, "");
        if (token) terms.add(`from:${token}`);
      }
    }

    if (source.subjectPattern) {
      const subjectToken = source.subjectPattern
        .split("|")[0]
        ?.replace(/\\/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚ-]/g, "")
        .trim();
      if (subjectToken) terms.add(`subject:${subjectToken}`);
    }
  }

  return [...terms];
}
