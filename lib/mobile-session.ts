import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/security";

const SESSION_TTL_DAYS = 30;
const REFRESH_TTL_DAYS = 90;

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createDeviceSession(input: {
  deviceLabel: string;
  platform?: string | null;
  deviceType?: string | null;
}) {
  const accessToken = createOpaqueToken();
  const refreshToken = createOpaqueToken();

  const session = await prisma.deviceSession.create({
    data: {
      deviceLabel: input.deviceLabel,
      platform: input.platform || null,
      deviceType: input.deviceType || null,
      tokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt: addDays(SESSION_TTL_DAYS),
      refreshExpiresAt: addDays(REFRESH_TTL_DAYS),
      lastSeenAt: new Date(),
    },
  });

  return {
    session,
    accessToken,
    refreshToken,
  };
}

export async function refreshDeviceSession(refreshToken: string) {
  const tokenHash = hashOpaqueToken(refreshToken);
  const existing = await prisma.deviceSession.findFirst({
    where: {
      refreshTokenHash: tokenHash,
      revokedAt: null,
      refreshExpiresAt: { gt: new Date() },
    },
  });

  if (!existing) return null;

  const nextAccessToken = createOpaqueToken();
  const nextRefreshToken = createOpaqueToken();

  const session = await prisma.deviceSession.update({
    where: { id: existing.id },
    data: {
      tokenHash: hashOpaqueToken(nextAccessToken),
      refreshTokenHash: hashOpaqueToken(nextRefreshToken),
      expiresAt: addDays(SESSION_TTL_DAYS),
      refreshExpiresAt: addDays(REFRESH_TTL_DAYS),
      lastSeenAt: new Date(),
    },
  });

  return {
    session,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
}

export function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export async function requireMobileSession(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const tokenHash = hashOpaqueToken(token);
  const session = await prisma.deviceSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) return null;

  await prisma.deviceSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session;
}
