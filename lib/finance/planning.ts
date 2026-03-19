import { addDays, addMonths, addWeeks, addYears, endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FINANCE_ACCOUNT } from "@/lib/finance/constants";

type SupportedFrequency = "monthly" | "biweekly" | "weekly" | "yearly";

function clampDay(day: number, date: Date) {
  const lastDay = endOfMonth(date).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

function addFrequency(date: Date, frequency: string) {
  switch (frequency as SupportedFrequency) {
    case "weekly":
      return addWeeks(date, 1);
    case "biweekly":
      return addWeeks(date, 2);
    case "yearly":
      return addYears(date, 1);
    case "monthly":
    default:
      return addMonths(date, 1);
  }
}

function resolveInitialOccurrenceDate(input: {
  nextOccurrenceAt?: Date | null;
  dueDay?: number | null;
}) {
  if (input.nextOccurrenceAt) return input.nextOccurrenceAt;

  const now = new Date();
  if (input.dueDay) {
    const day = clampDay(input.dueDay, now);
    const currentMonthDue = new Date(now.getFullYear(), now.getMonth(), day);
    if (currentMonthDue >= startOfMonth(now)) {
      return currentMonthDue;
    }
  }

  return addDays(now, 1);
}

async function getOrCreatePlanningFallbackAccount() {
  const existing = await prisma.financialAccount.findFirst({
    where: { name: DEFAULT_FINANCE_ACCOUNT.name },
  });

  if (existing) return existing;

  return prisma.financialAccount.create({
    data: {
      name: DEFAULT_FINANCE_ACCOUNT.name,
      accountType: DEFAULT_FINANCE_ACCOUNT.accountType,
      currency: DEFAULT_FINANCE_ACCOUNT.currency,
      institution: DEFAULT_FINANCE_ACCOUNT.institution,
      icon: DEFAULT_FINANCE_ACCOUNT.icon,
      balance: 0,
    },
  });
}

export async function syncScheduledObligationOccurrences(anchor = new Date()) {
  const horizonStart = startOfMonth(addMonths(anchor, -1));
  const horizonEnd = endOfMonth(addMonths(anchor, 2));
  const obligations = await prisma.scheduledObligation.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  for (const obligation of obligations) {
    let cursor = resolveInitialOccurrenceDate({
      nextOccurrenceAt: obligation.nextOccurrenceAt,
      dueDay: obligation.dueDay,
    });

    if (obligation.dueDay && cursor.getDate() !== obligation.dueDay) {
      const corrected = new Date(cursor.getFullYear(), cursor.getMonth(), clampDay(obligation.dueDay, cursor));
      cursor = corrected;
    }

    while (cursor <= horizonEnd) {
      if (cursor >= horizonStart) {
        await prisma.scheduledObligationOccurrence.upsert({
          where: {
            obligationId_dueDate: {
              obligationId: obligation.id,
              dueDate: cursor,
            },
          },
          create: {
            obligationId: obligation.id,
            dueDate: cursor,
            expectedAmount: obligation.amount,
          },
          update: {
            expectedAmount: obligation.amount,
          },
        });
      }

      cursor = addFrequency(cursor, obligation.frequency);
      if (obligation.dueDay && obligation.frequency === "monthly") {
        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          clampDay(obligation.dueDay, cursor)
        );
      }
    }

    await prisma.scheduledObligation.update({
      where: { id: obligation.id },
      data: {
        nextOccurrenceAt: cursor,
      },
    });
  }
}

export async function checkoffScheduledObligationOccurrence(params: {
  occurrenceId: string;
  accountId?: string | null;
  paidAt?: Date | null;
  notes?: string | null;
}) {
  const occurrence = await prisma.scheduledObligationOccurrence.findUnique({
    where: { id: params.occurrenceId },
    include: {
      obligation: {
        include: {
          defaultAccount: true,
        },
      },
      transaction: true,
    },
  });

  if (!occurrence) {
    throw new Error("Scheduled obligation occurrence not found");
  }

  if (occurrence.transaction) {
    return occurrence.transaction;
  }

  const account =
    (params.accountId
      ? await prisma.financialAccount.findUnique({ where: { id: params.accountId } })
      : occurrence.obligation.defaultAccount) || (await getOrCreatePlanningFallbackAccount());

  const paidAt = params.paidAt || new Date();

  const transaction = await prisma.financialTransaction.create({
    data: {
      accountId: account.id,
      transactedAt: paidAt,
      amount: -Math.abs(occurrence.expectedAmount),
      currency: occurrence.obligation.currency,
      description: occurrence.obligation.name,
      category: occurrence.obligation.category,
      subcategory: occurrence.obligation.subcategory ?? null,
      type: "expense",
      isRecurring: true,
      merchant: occurrence.obligation.name,
      notes: params.notes ?? occurrence.obligation.notes ?? null,
      source: "scheduled_obligation",
      status: "posted",
      settlementStatus: "settled",
      reviewState: "resolved",
      excludedFromBudget: false,
    },
  });

  await prisma.financialAccount.update({
    where: { id: account.id },
    data: {
      balance: { increment: transaction.amount },
    },
  });

  await prisma.scheduledObligationOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: "paid",
      paidAt,
      notes: params.notes ?? occurrence.notes ?? undefined,
      transactionId: transaction.id,
    },
  });

  return transaction;
}

function buildSuggestedAllocations(grossAmount: number, rules: Array<{ pocketId: string; percentOfIncome: number }>) {
  let remaining = Math.max(0, grossAmount);

  return rules.map((rule, index) => {
    const rawAmount = Math.round((grossAmount * rule.percentOfIncome) / 100);
    const amount = index === rules.length - 1 ? remaining : Math.min(remaining, rawAmount);
    remaining -= amount;
    return {
      pocketId: rule.pocketId,
      amount,
      percentOfIncome: rule.percentOfIncome,
    };
  });
}

export function isPaycheckLikeTransaction(input: {
  type?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  source?: string | null;
}) {
  const combined = [
    input.category,
    input.subcategory,
    input.description,
    input.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    input.type === "income" &&
    /(income|salary|payroll|paycheck|gusto|nomina|n[oó]mina|salario|deposit)/i.test(combined)
  );
}

export async function ensurePaycheckAllocationRunForTransaction(params: {
  transactionId: string;
  grossAmount: number;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  source?: string | null;
  type?: string | null;
}) {
  if (!isPaycheckLikeTransaction(params)) {
    return null;
  }

  const existing = await prisma.paycheckAllocationRun.findUnique({
    where: { sourceTransactionId: params.transactionId },
  });
  if (existing) return existing;

  const rules = await prisma.paycheckAllocationRule.findMany({
    where: { active: true, pocket: { active: true } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (rules.length === 0) return null;

  const suggestions = buildSuggestedAllocations(
    Math.max(0, params.grossAmount),
    rules.map((rule) => ({
      pocketId: rule.pocketId,
      percentOfIncome: rule.percentOfIncome,
    }))
  );

  return prisma.paycheckAllocationRun.create({
    data: {
      sourceTransactionId: params.transactionId,
      grossAmount: params.grossAmount,
      suggestedAllocations: suggestions,
      status: "pending",
    },
  });
}

export async function confirmPaycheckAllocationRun(params: {
  runId: string;
  allocations?: Array<{ pocketId: string; amount: number }>;
  notes?: string | null;
}) {
  const run = await prisma.paycheckAllocationRun.findUnique({
    where: { id: params.runId },
    include: {
      entries: true,
      sourceTransaction: true,
    },
  });

  if (!run) {
    throw new Error("Paycheck allocation run not found");
  }

  if (run.status === "confirmed") {
    return run;
  }

  const rawAllocations =
    params.allocations ||
    ((run.suggestedAllocations as Array<{ pocketId: string; amount: number }> | null) || []);

  const allocations = rawAllocations
    .filter((item) => item && item.pocketId && Number(item.amount) > 0)
    .map((item) => ({
      pocketId: item.pocketId,
      amount: Math.max(0, Math.round(Number(item.amount))),
    }));

  await prisma.$transaction(async (tx) => {
    for (const allocation of allocations) {
      await tx.pocketEntry.create({
        data: {
          pocketId: allocation.pocketId,
          allocationRunId: run.id,
          sourceTransactionId: run.sourceTransactionId ?? null,
          amount: allocation.amount,
          entryType: "allocation",
          notes: params.notes ?? null,
        },
      });

      await tx.fundPocket.update({
        where: { id: allocation.pocketId },
        data: {
          currentBalance: { increment: allocation.amount },
        },
      });
    }

    await tx.paycheckAllocationRun.update({
      where: { id: run.id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        notes: params.notes ?? undefined,
      },
    });
  });

  return prisma.paycheckAllocationRun.findUnique({
    where: { id: run.id },
    include: {
      entries: true,
      sourceTransaction: true,
    },
  });
}
