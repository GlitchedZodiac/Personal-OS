import { prisma } from "@/lib/prisma";
import { hashPin, verifyPinHash } from "@/lib/security";

const FALLBACK_PIN = process.env.APP_PIN || "1234";

export async function getStoredPinHash() {
  const credential = await prisma.authCredential.findUnique({
    where: { id: "default" },
    select: { pinHash: true },
  });

  return credential?.pinHash || null;
}

export async function ensurePinCredential(pin = FALLBACK_PIN) {
  const pinHash = hashPin(pin);
  return prisma.authCredential.upsert({
    where: { id: "default" },
    create: { id: "default", pinHash },
    update: { pinHash },
  });
}

export async function verifyPin(pin: string) {
  const storedHash = await getStoredPinHash();

  if (storedHash) {
    return verifyPinHash(pin, storedHash);
  }

  const matchesFallback = pin === FALLBACK_PIN;
  if (matchesFallback) {
    await ensurePinCredential(FALLBACK_PIN);
  }

  return matchesFallback;
}

export async function updatePin(currentPin: string, nextPin: string) {
  const valid = await verifyPin(currentPin);
  if (!valid) return false;

  await prisma.authCredential.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      pinHash: hashPin(nextPin),
    },
    update: {
      pinHash: hashPin(nextPin),
    },
  });

  return true;
}
