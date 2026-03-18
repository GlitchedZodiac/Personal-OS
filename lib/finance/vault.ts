import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type VaultPayload = unknown;

interface EncryptedPayload {
  cipherText: string;
  iv: string;
  authTag: string;
}

function getVaultKey(): Buffer {
  const raw = process.env.FINANCE_VAULT_MASTER_KEY?.trim();
  if (!raw) {
    throw new Error("FINANCE_VAULT_MASTER_KEY is not configured");
  }

  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  return crypto.createHash("sha256").update(raw).digest();
}

function encryptValue(value: VaultPayload): EncryptedPayload {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plainText = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);

  return {
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptValue<T>(payload: EncryptedPayload): T {
  const key = getVaultKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export async function upsertVaultSecret(
  secretKey: string,
  kind: string,
  value: VaultPayload,
  options?: { label?: string; context?: Record<string, unknown>; keyVersion?: number }
) {
  const encrypted = encryptValue(value);

  return prisma.financeVaultSecret.upsert({
    where: { secretKey },
    create: {
      secretKey,
      kind,
      label: options?.label ?? null,
      context: options?.context as Prisma.InputJsonValue | undefined,
      keyVersion: options?.keyVersion ?? 1,
      ...encrypted,
    },
    update: {
      kind,
      label: options?.label ?? undefined,
      context: options?.context as Prisma.InputJsonValue | undefined,
      keyVersion: options?.keyVersion ?? undefined,
      ...encrypted,
    },
  });
}

export async function getVaultSecret<T>(secretKey: string): Promise<T | null> {
  const row = await prisma.financeVaultSecret.findUnique({ where: { secretKey } });
  if (!row) return null;
  return decryptValue<T>({
    cipherText: row.cipherText,
    iv: row.iv,
    authTag: row.authTag,
  });
}

export async function deleteVaultSecret(secretKey: string) {
  return prisma.financeVaultSecret.deleteMany({ where: { secretKey } });
}
