import { addDays, addMonths, addWeeks, addYears, endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  CANONICAL_FUND_POCKETS,
  DEFAULT_FINANCE_ACCOUNT,
  PRIMARY_CASH_ACCOUNT,
  PRIMARY_CASH_BALANCE_SEED,
  TX_CATEGORY_TO_BUDGET_CATEGORY_NAME,
} from "@/lib/finance/constants";

type SupportedFrequency = "monthly" | "biweekly" | "weekly" | "yearly";
const INITIAL_SEED_RUN_NOTE = "Initial cash seed";

function roundMoney(value: number) {
  return Math.round(Number(value) || 0);
}

function sumPercent(rules: Array<{ percentOfIncome: number }>) {
  return Math.round(
    rules.reduce((sum, rule) => sum + Number(rule.percentOfIncome || 0), 0) * 100
  ) / 100;
}

export async function ensurePrimaryCashAccount() {
  const existingPrimary = await prisma.financialAccount.findFirst({
    where: { isPrimary: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (existingPrimary) {
    return existingPrimary;
  }

  const namedAccount = await prisma.financialAccount.findFirst({
    where: { name: PRIMARY_CASH_ACCOUNT.name, isActive: true },
  });

  if (namedAccount) {
    return prisma.financialAccount.update({
      where: { id: namedAccount.id },
      data: {
        isPrimary: true,
        balance:
          namedAccount.balance === 0 ? PRIMARY_CASH_BALANCE_SEED : namedAccount.balance,
      },
    });
  }

  return prisma.financialAccount.create({
    data: {
      ...PRIMARY_CASH_ACCOUNT,
      balance: PRIMARY_CASH_BALANCE_SEED,
      isPrimary: true,
      notes: "Seeded from user-provided balance on 2026-03-19.",
    },
  });
}

async function ensureCanonicalAllocationRuleForPocket(params: {
  pocketId: string;
  pocketName: string;
  priority: number;
}) {
  const existingRules = await prisma.paycheckAllocationRule.findMany({
    where: { pocketId: params.pocketId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  if (!existingRules.length) {
    return prisma.paycheckAllocationRule.create({
      data: {
        pocketId: params.pocketId,
        name: `${params.pocketName} allocation`,
        percentOfIncome: 0,
        priority: params.priority,
        active: true,
      },
    });
  }

  const [primaryRule, ...duplicates] = existingRules;
  if (duplicates.length > 0) {
    await prisma.paycheckAllocationRule.updateMany({
      where: { id: { in: duplicates.map((rule) => rule.id) } },
      data: { active: false },
    });
  }

  return prisma.paycheckAllocationRule.update({
    where: { id: primaryRule.id },
    data: {
      name: primaryRule.name || `${params.pocketName} allocation`,
      priority: params.priority,
      active: true,
    },
  });
}

export async function ensureCanonicalPockets() {
  const pockets = [];

  for (const definition of CANONICAL_FUND_POCKETS) {
    const existing =
      (await prisma.fundPocket.findFirst({
        where: {
          OR: [{ slug: definition.slug }, { name: definition.name }],
        },
      })) || null;

    const pocket = existing
      ? await prisma.fundPocket.update({
          where: { id: existing.id },
          data: {
            slug: definition.slug,
            name: definition.name,
            description: existing.description || definition.description,
            icon: existing.icon || definition.icon,
            color: existing.color || definition.color,
            isCanonical: true,
            active: true,
            sortOrder: definition.sortOrder,
          },
        })
      : await prisma.fundPocket.create({
          data: {
            slug: definition.slug,
            name: definition.name,
            description: definition.description,
            icon: definition.icon,
            color: definition.color,
            isCanonical: true,
            active: true,
            sortOrder: definition.sortOrder,
          },
        });

    await ensureCanonicalAllocationRuleForPocket({
      pocketId: pocket.id,
      pocketName: pocket.name,
      priority: definition.sortOrder,
    });
    pockets.push(pocket);
  }

  return prisma.fundPocket.findMany({
    where: { isCanonical: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      allocationRules: {
        where: { active: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
      entries: {
        orderBy: { occurredAt: "desc" },
        take: 5,
      },
    },
  });
}

export async function ensureCanonicalCashSetup() {
  const [primaryAccount, pockets] = await Promise.all([
    ensurePrimaryCashAccount(),
    ensureCanonicalPockets(),
  ]);

  return { primaryAccount, pockets };
}

async function maybeEnsureInitialSeedRun(primaryCashBalance: number) {
  const [rules, existingPendingSeed, pocketEntryCount] = await Promise.all([
    prisma.paycheckAllocationRule.findMany({
      where: { active: true, pocket: { isCanonical: true, active: true } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.paycheckAllocationRun.findFirst({
      where: { runType: "initial_seed", status: "pending" },
      orderBy: { promptedAt: "desc" },
    }),
    prisma.pocketEntry.count({
      where: {
        pocket: { isCanonical: true },
      },
    }),
  ]);

  if (existingPendingSeed || pocketEntryCount > 0 || primaryCashBalance <= 0) {
    return existingPendingSeed;
  }

  if (!rules.length || sumPercent(rules) !== 100) {
    return null;
  }

  const suggestedAllocations = buildSuggestedAllocations(
    roundMoney(primaryCashBalance),
    rules.map((rule) => ({
      pocketId: rule.pocketId,
      percentOfIncome: rule.percentOfIncome,
    }))
  );

  return prisma.paycheckAllocationRun.create({
    data: {
      runType: "initial_seed",
      grossAmount: roundMoney(primaryCashBalance),
      suggestedAllocations,
      status: "pending",
      notes: INITIAL_SEED_RUN_NOTE,
    },
  });
}

export async function getPocketDashboardData() {
  const { primaryAccount } = await ensureCanonicalCashSetup();
  await maybeEnsureInitialSeedRun(primaryAccount.balance);

  const [pockets, pendingRuns] = await Promise.all([
    prisma.fundPocket.findMany({
      where: { isCanonical: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        allocationRules: {
          where: { active: true },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
        entries: {
          orderBy: { occurredAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.paycheckAllocationRun.findMany({
      where: { status: "pending" },
      orderBy: { promptedAt: "desc" },
      include: {
        sourceTransaction: {
          select: {
            id: true,
            description: true,
            amount: true,
            transactedAt: true,
          },
        },
      },
    }),
  ]);

  const rules = pockets.flatMap((pocket) => pocket.allocationRules);
  const allocationPercentTotal = sumPercent(rules);
  const totalPocketBalance = pockets.reduce(
    (sum, pocket) => sum + roundMoney(pocket.currentBalance),
    0
  );

  return {
    primaryAccount,
    pockets,
    pendingRuns,
    allocationPercentTotal,
    primaryCashBalance: roundMoney(primaryAccount.balance),
    totalPocketBalance,
    unassignedCash: roundMoney(primaryAccount.balance) - totalPocketBalance,
  };
}

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
  const primary = await ensurePrimaryCashAccount();
  if (primary) return primary;

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

  await ensureCanonicalCashSetup();

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

  const activeRules = await prisma.paycheckAllocationRule.findMany({
    where: { active: true, pocket: { isCanonical: true, active: true } },
  });
  const percentTotal = sumPercent(activeRules);
  if (percentTotal !== 100) {
    throw new Error("Pocket percentages must total 100% before confirming allocations");
  }

  const totalAllocation = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (Math.abs(totalAllocation - Math.round(run.grossAmount)) > 1) {
    throw new Error("Allocations must cover the full amount before confirming");
  }

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

async function saveDefaultPocketForCategory(category: string, pocketId: string) {
  const budgetCategoryName = TX_CATEGORY_TO_BUDGET_CATEGORY_NAME[category] || null;
  if (!budgetCategoryName) return;

  const budgetCategory = await prisma.budgetCategory.findFirst({
    where: { name: budgetCategoryName },
  });
  if (!budgetCategory) return;

  await prisma.budgetCategory.update({
    where: { id: budgetCategory.id },
    data: { defaultPocketId: pocketId },
  });
}

export async function assignTransactionToPocket(params: {
  transactionId: string;
  pocketId: string;
  category?: string | null;
  subcategory?: string | null;
  notes?: string | null;
  saveDefaultPocket?: boolean;
}) {
  const transaction = await prisma.financialTransaction.findUnique({
    where: { id: params.transactionId },
    include: {
      pocketEntries: true,
      pocket: true,
    },
  });

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  if (transaction.type !== "expense" || transaction.cashImpactType !== "cash") {
    throw new Error("Only cash expenses can be assigned to pockets");
  }

  const nextCategory = params.category ?? transaction.category;
  const nextSubcategory =
    params.subcategory !== undefined ? params.subcategory : transaction.subcategory;
  const nextAmount = -Math.abs(transaction.amount);

  await prisma.$transaction(async (tx) => {
    const existingEntry = transaction.pocketEntries.find(
      (entry) => entry.entryType === "expense_deduction"
    );

    if (existingEntry && existingEntry.pocketId !== params.pocketId) {
      await tx.fundPocket.update({
        where: { id: existingEntry.pocketId },
        data: { currentBalance: { increment: Math.abs(existingEntry.amount) } },
      });

      await tx.pocketEntry.delete({
        where: { id: existingEntry.id },
      });
    }

    if (existingEntry && existingEntry.pocketId === params.pocketId) {
      const delta = nextAmount - existingEntry.amount;
      if (delta !== 0) {
        await tx.fundPocket.update({
          where: { id: params.pocketId },
          data: { currentBalance: { increment: delta } },
        });
      }

      await tx.pocketEntry.update({
        where: { id: existingEntry.id },
        data: {
          amount: nextAmount,
          notes: params.notes ?? existingEntry.notes ?? undefined,
          occurredAt: transaction.transactedAt,
        },
      });
    } else {
      await tx.pocketEntry.create({
        data: {
          pocketId: params.pocketId,
          sourceTransactionId: transaction.id,
          amount: nextAmount,
          entryType: "expense_deduction",
          occurredAt: transaction.transactedAt,
          notes: params.notes ?? null,
        },
      });

      await tx.fundPocket.update({
        where: { id: params.pocketId },
        data: { currentBalance: { increment: nextAmount } },
      });
    }

    await tx.financialTransaction.update({
      where: { id: transaction.id },
      data: {
        pocketId: params.pocketId,
        category: nextCategory,
        subcategory: nextSubcategory,
        notes: params.notes ?? undefined,
        needsCategorization: false,
        reviewState: "resolved",
      },
    });
  });

  if (params.saveDefaultPocket && nextCategory) {
    await saveDefaultPocketForCategory(nextCategory, params.pocketId);
  }

  return prisma.financialTransaction.findUnique({
    where: { id: transaction.id },
    include: {
      pocket: true,
      pocketEntries: true,
    },
  });
}

export async function syncPocketEffectsForTransactionUpdate(params: {
  transactionId: string;
  previousAmount: number;
  previousPocketId?: string | null;
  previousCashImpactType?: string | null;
  previousType?: string | null;
  nextAmount: number;
  nextPocketId?: string | null;
  nextCashImpactType?: string | null;
  nextType?: string | null;
  transactedAt?: Date | null;
  notes?: string | null;
}) {
  const previousWasPocketExpense =
    params.previousType === "expense" &&
    params.previousCashImpactType === "cash" &&
    Boolean(params.previousPocketId);
  const nextIsPocketExpense =
    params.nextType === "expense" &&
    params.nextCashImpactType === "cash" &&
    Boolean(params.nextPocketId);

  const existingEntry = await prisma.pocketEntry.findFirst({
    where: {
      sourceTransactionId: params.transactionId,
      entryType: "expense_deduction",
    },
  });

  if (!previousWasPocketExpense && !nextIsPocketExpense) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (existingEntry && (!nextIsPocketExpense || params.previousPocketId !== params.nextPocketId)) {
      await tx.fundPocket.update({
        where: { id: existingEntry.pocketId },
        data: { currentBalance: { increment: Math.abs(existingEntry.amount) } },
      });
      await tx.pocketEntry.delete({ where: { id: existingEntry.id } });
    }

    if (!nextIsPocketExpense || !params.nextPocketId) {
      await tx.financialTransaction.update({
        where: { id: params.transactionId },
        data: {
          pocketId: null,
          needsCategorization: false,
        },
      });
      return;
    }

    const nextEntryAmount = -Math.abs(params.nextAmount);
    const entryToUse =
      existingEntry && params.previousPocketId === params.nextPocketId ? existingEntry : null;

    if (entryToUse) {
      const delta = nextEntryAmount - entryToUse.amount;
      if (delta !== 0) {
        await tx.fundPocket.update({
          where: { id: params.nextPocketId },
          data: { currentBalance: { increment: delta } },
        });
      }
      await tx.pocketEntry.update({
        where: { id: entryToUse.id },
        data: {
          amount: nextEntryAmount,
          occurredAt: params.transactedAt ?? undefined,
          notes: params.notes ?? undefined,
        },
      });
    } else {
      await tx.pocketEntry.create({
        data: {
          pocketId: params.nextPocketId,
          sourceTransactionId: params.transactionId,
          amount: nextEntryAmount,
          entryType: "expense_deduction",
          occurredAt: params.transactedAt ?? new Date(),
          notes: params.notes ?? null,
        },
      });
      await tx.fundPocket.update({
        where: { id: params.nextPocketId },
        data: { currentBalance: { increment: nextEntryAmount } },
      });
    }

    await tx.financialTransaction.update({
      where: { id: params.transactionId },
      data: {
        pocketId: params.nextPocketId,
        needsCategorization: false,
      },
    });
  });
}

export async function removePocketEffectsForTransaction(transactionId: string) {
  const existingEntry = await prisma.pocketEntry.findFirst({
    where: {
      sourceTransactionId: transactionId,
      entryType: "expense_deduction",
    },
  });

  if (!existingEntry) return;

  await prisma.$transaction(async (tx) => {
    await tx.fundPocket.update({
      where: { id: existingEntry.pocketId },
      data: { currentBalance: { increment: Math.abs(existingEntry.amount) } },
    });
    await tx.pocketEntry.delete({ where: { id: existingEntry.id } });
  });
}
