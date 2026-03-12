import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function normalizeDatabaseUrl(value: string | undefined) {
  if (!value) return value;
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
process.env.DIRECT_URL = normalizeDatabaseUrl(process.env.DIRECT_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
