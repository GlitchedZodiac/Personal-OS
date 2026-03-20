import type { Prisma } from "@prisma/client";
import { DEFAULT_FINANCE_ACCOUNT } from "@/lib/finance/constants";

export function getLegacyInboxAccountWhere(): Prisma.FinancialAccountWhereInput {
  return {
    name: DEFAULT_FINANCE_ACCOUNT.name,
    institution: DEFAULT_FINANCE_ACCOUNT.institution,
  };
}

export function getVisibleFinanceAccountsWhere(): Prisma.FinancialAccountWhereInput {
  return {
    isActive: true,
    NOT: getLegacyInboxAccountWhere(),
  };
}

export function getCuratedPrimaryTransactionWhere(
  primaryAccountId: string
): Prisma.FinancialTransactionWhereInput {
  return {
    accountId: primaryAccountId,
  };
}

export function getCuratedSourceWhere(): Prisma.FinanceSourceWhereInput {
  return {
    OR: [
      { senderDomain: { contains: "bancolombia" } },
      { senderEmail: { contains: "bancolombia" } },
      { label: { contains: "Bancolombia" } },
      { senderDomain: { contains: "gusto" } },
      { senderEmail: { contains: "gusto.com" } },
      { label: { contains: "Gusto" } },
      {
        isPriority: true,
        priorityInstitution: { in: ["Bancolombia", "Gusto"] },
      },
    ],
  };
}
