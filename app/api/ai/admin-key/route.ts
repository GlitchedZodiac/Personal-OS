import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The OpenAI ADMIN key integration — the only way OpenAI exposes real
// spend (/v1/organization/costs needs an org admin key, not a project
// key). WRITE-ONLY: Michael pastes it in Settings, it lives in
// integration_secrets, and no GET ever returns the value — only whether
// one is connected. Cookie-gated like every /api route.

const SECRET_NAME = "openai_admin_key";

export async function GET() {
  const row = await prisma.integrationSecret.findUnique({
    where: { name: SECRET_NAME },
    select: { updatedAt: true },
  });
  return NextResponse.json({
    connected: Boolean(row),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key.startsWith("sk-") || key.length < 20) {
      return NextResponse.json(
        { error: "That doesn't look like an OpenAI key (sk-…)" },
        { status: 400 }
      );
    }

    // Prove it can actually read costs before storing — a project key
    // passes the sk- shape but 401s here.
    const monthStart = Math.floor(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) / 1000
    );
    const probe = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${monthStart}&limit=31`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!probe.ok) {
      return NextResponse.json(
        {
          error:
            probe.status === 401
              ? "Key rejected — costs need an ORG ADMIN key (platform.openai.com → Settings → Organization → Admin keys)."
              : `OpenAI answered ${probe.status} — try again in a minute.`,
        },
        { status: 400 }
      );
    }

    await prisma.integrationSecret.upsert({
      where: { name: SECRET_NAME },
      create: { name: SECRET_NAME, value: key },
      update: { value: key },
    });
    return NextResponse.json({ connected: true });
  } catch (error) {
    console.error("Admin key store error:", error);
    return NextResponse.json({ error: "Failed to store key" }, { status: 500 });
  }
}

export async function DELETE() {
  await prisma.integrationSecret.deleteMany({ where: { name: SECRET_NAME } });
  return NextResponse.json({ connected: false });
}
