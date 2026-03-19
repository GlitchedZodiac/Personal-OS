import { PrismaClient } from "@prisma/client";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\r\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeDatabaseUrl(value: string | undefined) {
  const cleaned = cleanEnv(value);
  if (!cleaned) return cleaned;

  try {
    const url = new URL(cleaned);
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

export function createRequestPrismaClient() {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (url) {
    return new PrismaClient({
      datasources: {
        db: {
          url,
        },
      },
    });
  }

  return new PrismaClient();
}

export async function withRequestPrisma<T>(callback: (prisma: PrismaClient) => Promise<T>) {
  const prisma = createRequestPrismaClient();
  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
