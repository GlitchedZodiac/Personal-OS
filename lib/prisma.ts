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
 *
 * SSL: Supabase's pooler presents a self-signed chain. Prisma 5's engine
 * treated `sslmode=require` as encrypt-without-CA-verification; node-postgres
 * verifies by default and fails with P1011. We reproduce the engine
 * semantics: always encrypt (unless sslmode=disable), never CA-verify.
 */
function toPgConfig(value: string | undefined) {
  const cleaned = cleanEnv(value);
  if (!cleaned) return { connectionString: cleaned, ssl: undefined };

  try {
    const url = new URL(cleaned);
    const sslmode = url.searchParams.get("sslmode");
    for (const p of ["pgbouncer", "connection_limit", "pool_timeout", "sslmode"]) {
      url.searchParams.delete(p);
    }
    return {
      connectionString: url.toString(),
      ssl: sslmode === "disable" ? undefined : { rejectUnauthorized: false },
    };
  } catch {
    return { connectionString: cleaned, ssl: { rejectUnauthorized: false } };
  }
}

export function createPrismaAdapter() {
  const { connectionString, ssl } = toPgConfig(process.env.DATABASE_URL);
  return new PrismaPg({
    connectionString,
    ssl,
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
