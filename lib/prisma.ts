import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\r\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .trim();
}

/**
 * Prisma 7 connects through the node-postgres driver adapter. The old
 * engine-era URL params (pgbouncer, connection_limit, pool_timeout) mean
 * nothing to pg — pool sizing is configured on the adapter instead.
 */
function toPgConnectionString(value: string | undefined) {
  const cleaned = cleanEnv(value);
  if (!cleaned) return cleaned;

  try {
    const url = new URL(cleaned);
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    url.searchParams.delete("pool_timeout");
    return url.toString();
  } catch {
    return cleaned;
  }
}

export function createPrismaAdapter() {
  return new PrismaPg({
    connectionString: toPgConnectionString(process.env.DATABASE_URL),
    // Single-user app on serverless functions hitting the Supabase
    // transaction pooler: keep per-instance pools small and release idle
    // connections quickly.
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: createPrismaAdapter() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
