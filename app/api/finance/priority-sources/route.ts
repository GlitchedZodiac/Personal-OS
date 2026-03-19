import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePrioritySourcesSeeded } from "@/lib/finance/priority-sources";
import { normalizeMerchantName } from "@/lib/finance/pipeline-utils";
import { upsertVaultSecret } from "@/lib/finance/vault";

function resolvePasswordSecretKey(body: Record<string, unknown>) {
  const explicit = typeof body.passwordSecretKey === "string" ? body.passwordSecretKey : null;
  if (explicit) return explicit;

  const base =
    normalizeMerchantName(
      String(body.institution || body.provider || body.label || "finance-source")
    ) || "finance-source";

  return `pdf:${base}:default`;
}

export async function GET() {
  try {
    await ensurePrioritySourcesSeeded();
    const sources = await prisma.financePrioritySource.findMany({
      orderBy: [{ parserPriority: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ prioritySources: sources });
  } catch (error) {
    console.error("Finance priority sources error:", error);
    return NextResponse.json({ error: "Failed to load priority sources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const passwordSecretKey = body.password ? resolvePasswordSecretKey(body) : body.passwordSecretKey ?? null;
    const source = await prisma.financePrioritySource.create({
      data: {
        label: body.label,
        sourceRole: body.sourceRole,
        institution: body.institution ?? null,
        provider: body.provider ?? null,
        senderEmailPattern: body.senderEmailPattern ?? null,
        senderDomainPattern: body.senderDomainPattern ?? null,
        subjectPattern: body.subjectPattern ?? null,
        defaultDisposition: body.defaultDisposition ?? "capture_only",
        parserPriority: body.parserPriority ?? 100,
        isPinned: body.isPinned ?? true,
        active: body.active ?? true,
        passwordSecretKey,
        notes: body.notes ?? null,
      },
    });

    if (body.password && passwordSecretKey) {
      await upsertVaultSecret(passwordSecretKey, "pdf_password", String(body.password), {
        label: `${source.label} PDF password`,
        context: {
          institution: source.institution,
          provider: source.provider,
          sourceRole: source.sourceRole,
          senderEmailPattern: source.senderEmailPattern,
          senderDomainPattern: source.senderDomainPattern,
        },
      });
    }

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error("Finance priority source create error:", error);
    return NextResponse.json({ error: "Failed to create priority source" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Priority source id is required" }, { status: 400 });
    }

    const passwordSecretKey =
      body.password !== undefined
        ? resolvePasswordSecretKey(body)
        : body.passwordSecretKey ?? undefined;

    const source = await prisma.financePrioritySource.update({
      where: { id: body.id },
      data: {
        label: body.label ?? undefined,
        sourceRole: body.sourceRole ?? undefined,
        institution: body.institution ?? undefined,
        provider: body.provider ?? undefined,
        senderEmailPattern: body.senderEmailPattern ?? undefined,
        senderDomainPattern: body.senderDomainPattern ?? undefined,
        subjectPattern: body.subjectPattern ?? undefined,
        defaultDisposition: body.defaultDisposition ?? undefined,
        parserPriority: body.parserPriority ?? undefined,
        isPinned: body.isPinned ?? undefined,
        active: body.active ?? undefined,
        passwordSecretKey,
        notes: body.notes ?? undefined,
      },
    });

    if (body.password && passwordSecretKey) {
      await upsertVaultSecret(passwordSecretKey, "pdf_password", String(body.password), {
        label: `${source.label} PDF password`,
        context: {
          institution: source.institution,
          provider: source.provider,
          sourceRole: source.sourceRole,
          senderEmailPattern: source.senderEmailPattern,
          senderDomainPattern: source.senderDomainPattern,
        },
      });
    }

    return NextResponse.json(source);
  } catch (error) {
    console.error("Finance priority source update error:", error);
    return NextResponse.json({ error: "Failed to update priority source" }, { status: 500 });
  }
}
