import { PrismaClient } from "@prisma/client";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

// Guard against accidental newline artifacts in provider env vars.
process.env.DATABASE_URL = cleanEnv(process.env.DATABASE_URL);
process.env.DIRECT_URL = cleanEnv(process.env.DIRECT_URL);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function normalizeDatabaseUrl(value: string | undefined) {
  if (!value) return value;
  const cleaned = value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();

  try {
    const url = new URL(cleaned);

    // Serverless functions should keep tiny connection pools to avoid exhausting
    // the shared Postgres connection limit across many cold/warm lambdas.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }

    return url.toString();
  } catch {
    return cleaned;
  }
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
process.env.DIRECT_URL = cleanEnv(process.env.DIRECT_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
