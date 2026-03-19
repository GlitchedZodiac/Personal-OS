import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildFinanceSourcesResponse } from "@/lib/finance/source-view";
import { recordFinanceLearningEvent } from "@/lib/finance/learning";
import { normalizeMerchantName } from "@/lib/finance/pipeline-utils";
import { upsertVaultSecret } from "@/lib/finance/vault";

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function getJsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function inferRuleActionFromSignal(signal: {
  kind: string;
  messageSubtype: string;
  settlementStatus: string;
}) {
  if (signal.settlementStatus === "failed" || signal.messageSubtype === "payment_failed") {
    return "mark_failed_payment";
  }
  if (signal.kind === "bill_due" || signal.kind === "statement") {
    return "bill_notice";
  }
  if (signal.messageSubtype === "order_confirmation" || signal.settlementStatus === "provisional") {
    return "provisional_purchase";
  }
  if (signal.kind === "refund") {
    return "refund_notice";
  }
  if (signal.kind === "income") {
    return "income_notice";
  }
  return "settle_charge";
}

function inferClassificationFromSignalKind(kind: string) {
  if (kind === "statement") return "statement";
  if (kind === "bill_due") return "bill_notice";
  if (kind === "refund") return "refund_notice";
  if (kind === "income") return "income_notice";
  if (kind === "transfer") return "transfer_notice";
  return "expense_receipt";
}

function normalizeSubjectSnippet(value: string | null | undefined) {
  return (value || "").trim().slice(0, 56);
}

function resolvePasswordSecretKey(input: {
  explicit?: string | null;
  institution?: string | null;
  label?: string | null;
}) {
  if (input.explicit) return input.explicit;
  const normalized = normalizeMerchantName(input.institution || input.label || "finance-source");
  return `pdf:${normalized || "finance-source"}:default`;
}

function matchesRuleCandidate(
  rule: {
    conditions: Prisma.JsonValue;
    actions: Prisma.JsonValue;
  },
  candidate: {
    action: string;
    messageSubtype: string;
    subjectSnippet: string;
  }
) {
  const conditions = getJsonRecord(rule.conditions);
  const actions = getJsonRecord(rule.actions);
  const subjectIncludes = Array.isArray(conditions?.subjectIncludes)
    ? conditions?.subjectIncludes.map((value) => String(value))
    : [];

  return (
    actions?.action === candidate.action &&
    conditions?.messageSubtype === candidate.messageSubtype &&
    subjectIncludes.includes(candidate.subjectSnippet)
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const action = body.action as
      | "classify_source"
      | "edit_source"
      | "learn_from_example"
      | "dismiss_example"
      | "pin_priority_source";

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    if (action === "classify_source" || action === "edit_source") {
      const source = await prisma.financeSource.update({
        where: { id },
        data: {
          label: body.fields?.label ?? undefined,
          trustLevel: body.fields?.trustLevel ?? undefined,
          defaultDisposition: body.fields?.defaultDisposition ?? undefined,
          categoryHint: body.fields?.categoryHint ?? undefined,
          subcategoryHint: body.fields?.subcategoryHint ?? undefined,
          countryHint: body.fields?.countryHint ?? undefined,
          currencyHint: body.fields?.currencyHint ?? undefined,
          localeHint: body.fields?.localeHint ?? undefined,
          isBiller: body.fields?.isBiller ?? undefined,
          isIncomeSource: body.fields?.isIncomeSource ?? undefined,
          isRecurring: body.fields?.isRecurring ?? undefined,
          isPriority: body.fields?.isPriority ?? undefined,
          prioritySourceRole: body.fields?.prioritySourceRole ?? undefined,
          priorityInstitution: body.fields?.priorityInstitution ?? undefined,
          notes: body.fields?.notes ?? undefined,
          reviewedAt: new Date(),
        },
      });

      await recordFinanceLearningEvent({
        sourceId: source.id,
        kind: "source_classified",
        summary: `Updated source settings for ${source.label}`,
        metadata: toJsonValue(body.fields || {}),
      });
    }

    if (action === "dismiss_example") {
      const signalId = body.signalId as string | undefined;
      if (!signalId) {
        return NextResponse.json({ error: "signalId is required" }, { status: 400 });
      }

      const signal = await prisma.financeSignal.findUnique({
        where: { id: signalId },
        select: { id: true, sourceId: true, description: true },
      });

      if (!signal || signal.sourceId !== id) {
        return NextResponse.json({ error: "Signal not found for source" }, { status: 404 });
      }

      await prisma.financeSignal.update({
        where: { id: signalId },
        data: {
          status: "resolved",
          promotionState: "dismissed",
        },
      });

      await prisma.financeSource.update({
        where: { id },
        data: { reviewedAt: new Date() },
      });

      await recordFinanceLearningEvent({
        sourceId: id,
        signalId,
        kind: "example_dismissed",
        summary: `Dismissed example ${signal.description}`,
        markSourceReviewed: true,
      });
    }

    if (action === "learn_from_example") {
      const signalId = body.signalId as string | undefined;
      if (!signalId) {
        return NextResponse.json({ error: "signalId is required" }, { status: 400 });
      }

      const signal = await prisma.financeSignal.findUnique({
        where: { id: signalId },
        include: {
          document: true,
        },
      });

      if (!signal || signal.sourceId !== id) {
        return NextResponse.json({ error: "Signal not found for source" }, { status: 404 });
      }

      const actionName = (body.ruleAction as string | undefined) || inferRuleActionFromSignal(signal);
      const subjectSnippet = normalizeSubjectSnippet(signal.document.subject || signal.description);
      const existingRules = await prisma.financeRule.findMany({
        where: { sourceId: id, learned: true, isActive: true },
        select: {
          id: true,
          conditions: true,
          actions: true,
        },
      });

      let rule = existingRules.find((candidate) =>
        matchesRuleCandidate(candidate, {
          action: actionName,
          messageSubtype: signal.messageSubtype,
          subjectSnippet,
        })
      );

      if (!rule) {
        rule = await prisma.financeRule.create({
          data: {
            name: `${signal.document.sender || "Source"} ${actionName.replace(/_/g, " ")}`,
            ruleType: "source_override",
            learned: true,
            sourceId: id,
            merchantId: signal.merchantId ?? null,
            priority: 200,
            conditions: toJsonValue({
              sourceId: id,
              messageSubtype: signal.messageSubtype,
              subjectIncludes: subjectSnippet ? [subjectSnippet] : [],
              requiresAmount: signal.sourceAmount != null || signal.amount != null,
              requiresOrderRef: signal.orderRef != null ? true : undefined,
            }),
            actions: toJsonValue({
              action: actionName,
              signalKind: signal.kind,
              classification: inferClassificationFromSignalKind(signal.kind),
              type: signal.type,
              category: signal.category,
              subcategory: signal.subcategory,
            }),
          },
        });
      }

      await prisma.financeSignal.update({
        where: { id: signal.id },
        data: {
          matchedRuleId: rule.id,
          status: "resolved",
        },
      });

      await prisma.financeSource.update({
        where: { id },
        data: {
          reviewedAt: new Date(),
          trustLevel: "learning",
        },
      });

      await recordFinanceLearningEvent({
        sourceId: id,
        ruleId: rule.id,
        signalId: signal.id,
        kind: "rule_learned",
        summary: `Learned ${actionName.replace(/_/g, " ")} from ${subjectSnippet || signal.description}`,
        metadata: toJsonValue({
          action: actionName,
          messageSubtype: signal.messageSubtype,
          signalKind: signal.kind,
        }),
      });
    }

    if (action === "pin_priority_source") {
      const source = await prisma.financeSource.findUnique({
        where: { id },
      });

      if (!source) {
        return NextResponse.json({ error: "Source not found" }, { status: 404 });
      }

      const senderEmailPattern = body.fields?.senderEmailPattern || source.senderEmail || null;
      const senderDomainPattern = body.fields?.senderDomainPattern || source.senderDomain || null;
      const subjectPattern = body.fields?.subjectPattern || null;
      const sourceRole = body.fields?.sourceRole || source.prioritySourceRole || "bank_transaction";
      const institution =
        body.fields?.institution || source.priorityInstitution || source.senderDomain || null;
      const passwordSecretKey = resolvePasswordSecretKey({
        explicit: body.fields?.passwordSecretKey || null,
        institution,
        label: source.label,
      });

      const existing = await prisma.financePrioritySource.findFirst({
        where: {
          label: source.label,
          sourceRole,
        },
      });

      const registry = existing
        ? await prisma.financePrioritySource.update({
            where: { id: existing.id },
            data: {
              senderEmailPattern,
              senderDomainPattern,
              subjectPattern,
              institution,
              defaultDisposition: body.fields?.defaultDisposition || source.defaultDisposition,
              parserPriority: body.fields?.parserPriority ?? 300,
              isPinned: body.fields?.isPinned ?? true,
              active: body.fields?.active ?? true,
              passwordSecretKey: body.fields?.password || body.fields?.passwordSecretKey ? passwordSecretKey : null,
            },
          })
        : await prisma.financePrioritySource.create({
            data: {
              label: source.label,
              sourceRole,
              institution,
              provider: body.fields?.provider ?? null,
              senderEmailPattern,
              senderDomainPattern,
              subjectPattern,
              defaultDisposition: body.fields?.defaultDisposition || source.defaultDisposition,
              parserPriority: body.fields?.parserPriority ?? 300,
              isPinned: body.fields?.isPinned ?? true,
              active: body.fields?.active ?? true,
              passwordSecretKey: body.fields?.password || body.fields?.passwordSecretKey ? passwordSecretKey : null,
            },
          });

      if (body.fields?.password) {
        await upsertVaultSecret(passwordSecretKey, "pdf_password", String(body.fields.password), {
          label: `${source.label} PDF password`,
          context: {
            institution: registry.institution,
            provider: registry.provider,
            sourceRole: registry.sourceRole,
            senderEmailPattern,
            senderDomainPattern,
          },
        });
      }

      await prisma.financeSource.update({
        where: { id },
        data: {
          isPriority: true,
          prioritySourceRole: registry.sourceRole,
          priorityInstitution: registry.institution || registry.provider,
          defaultDisposition:
            source.defaultDisposition === "capture_only"
              ? registry.defaultDisposition
              : undefined,
          reviewedAt: new Date(),
        },
      });

      await recordFinanceLearningEvent({
        sourceId: id,
        kind: "priority_source_pinned",
        summary: `Pinned ${source.label} as a priority source`,
        metadata: toJsonValue({
          sourceRole: registry.sourceRole,
          institution: registry.institution,
        }),
      });
    }

    const payload = await buildFinanceSourcesResponse(prisma);
    return NextResponse.json({ success: true, payload });
  } catch (error) {
    console.error("Finance source action error:", error);
    return NextResponse.json({ error: "Failed to apply finance source action" }, { status: 500 });
  }
}
