import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "@/lib/prisma";

export function createRequestPrismaClient() {
  return new PrismaClient({ adapter: createPrismaAdapter() });
}

export async function withRequestPrisma<T>(callback: (prisma: PrismaClient) => Promise<T>) {
  const prisma = createRequestPrismaClient();
  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
