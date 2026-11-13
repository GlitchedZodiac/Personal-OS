import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Where the wrong-PIN counters live (audit 2026-10, SEC-005 / PLAN D2).
//
// They used to live in one serverless instance's memory, so every warm
// instance had its own fresh budget and a cold start forgot everything. Now
// they live in Postgres, shared by every instance. The one operation that
// must be atomic — count a failure, open or roll the window, start a block
// when the count reaches the cap — is a single INSERT … ON CONFLICT, so two
// instances counting at once cannot both slip under the cap. Clock: the
// app's, passed in, so tests and both stores agree.
//
// The memory store mirrors the same rules exactly; it backs the unit tests
// (RATE_LIMIT_STORE=memory) and nothing else.

export interface Bucket {
  attempts: number;
  resetAt: number;
  blockedUntil: number | null;
}

export interface RateStore {
  read(keys: string[], now: number): Promise<Map<string, Bucket>>;
  /** Count one failure; returns the bucket AFTER the increment. */
  fail(key: string, maxFailures: number, windowMs: number, now: number): Promise<Bucket>;
  clear(key: string): Promise<void>;
  /** Block a key until at least `until` (never shortens an existing block). */
  blockUntil(key: string, until: number): Promise<void>;
  /** Forget every key starting with this prefix (a door's counts). */
  clearPrefix(prefix: string): Promise<void>;
}

export function memoryStore(): RateStore {
  const map = new Map<string, Bucket>();
  return {
    async read(keys) {
      const out = new Map<string, Bucket>();
      for (const k of keys) {
        const b = map.get(k);
        if (b) out.set(k, { ...b });
      }
      return out;
    },
    async fail(key, maxFailures, windowMs, now) {
      const existing = map.get(key);
      if (!existing || existing.resetAt <= now) {
        const fresh: Bucket = { attempts: 1, resetAt: now + windowMs, blockedUntil: maxFailures <= 1 ? now + windowMs : null };
        map.set(key, fresh);
        return { ...fresh };
      }
      existing.attempts += 1;
      if (existing.attempts >= maxFailures && existing.blockedUntil === null) existing.blockedUntil = existing.resetAt;
      return { ...existing };
    },
    async clear(key) {
      map.delete(key);
    },
    async blockUntil(key, until) {
      const b = map.get(key);
      if (b) b.blockedUntil = Math.max(b.blockedUntil ?? 0, until);
    },
    async clearPrefix(prefix) {
      for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k);
    },
  };
}

type BucketRow = { key: string; attempts: number; resetAt: Date; blockedUntil: Date | null };

const toBucket = (r: Omit<BucketRow, "key">): Bucket => ({
  attempts: Number(r.attempts),
  resetAt: new Date(r.resetAt).getTime(),
  blockedUntil: r.blockedUntil ? new Date(r.blockedUntil).getTime() : null,
});

export const postgresStore: RateStore = {
  async read(keys) {
    const rows = await prisma.rateLimitBucket.findMany({ where: { key: { in: keys } } });
    return new Map(rows.map((r) => [r.key, toBucket(r)]));
  },
  async fail(key, maxFailures, windowMs, now) {
    const nowAt = new Date(now);
    const resetAt = new Date(now + windowMs);
    const firstBlock = maxFailures <= 1 ? resetAt : null;
    const rows = await prisma.$queryRaw<Array<Omit<BucketRow, "key">>>(Prisma.sql`
      INSERT INTO "rate_limit_buckets" ("key", "attempts", "resetAt", "blockedUntil", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, ${firstBlock}, ${nowAt})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${nowAt} THEN 1
                          ELSE "rate_limit_buckets"."attempts" + 1 END,
        "resetAt" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${nowAt} THEN ${resetAt}
                         ELSE "rate_limit_buckets"."resetAt" END,
        "blockedUntil" = CASE
          WHEN "rate_limit_buckets"."resetAt" <= ${nowAt} THEN ${firstBlock}::timestamp(3)
          WHEN "rate_limit_buckets"."blockedUntil" IS NULL
               AND "rate_limit_buckets"."attempts" + 1 >= ${maxFailures} THEN "rate_limit_buckets"."resetAt"
          ELSE "rate_limit_buckets"."blockedUntil" END,
        "updatedAt" = ${nowAt}
      RETURNING "attempts", "resetAt", "blockedUntil"
    `);
    return toBucket(rows[0]);
  },
  async clear(key) {
    await prisma.rateLimitBucket.deleteMany({ where: { key } });
  },
  async blockUntil(key, until) {
    const at = new Date(until);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "rate_limit_buckets"
      SET "blockedUntil" = GREATEST(COALESCE("blockedUntil", ${at}), ${at}), "updatedAt" = NOW()
      WHERE "key" = ${key}
    `);
  },
  async clearPrefix(prefix) {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: prefix } } });
  },
};

let testStore: RateStore | null = null;
/** Postgres everywhere, except tests that ask for the memory mirror. */
export function defaultRateStore(): RateStore {
  if (process.env.RATE_LIMIT_STORE === "memory") return (testStore ??= memoryStore());
  return postgresStore;
}

/** Housekeeping for the daily cron: forget windows that are long over. */
export async function pruneRateLimitBuckets(now: Date = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: dayAgo }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }] },
  });
  return result.count;
}
