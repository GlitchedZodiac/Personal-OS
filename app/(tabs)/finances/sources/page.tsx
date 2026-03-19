"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";
import { invalidateCache, useCachedFetch } from "@/lib/cache";
import { FINANCE_HELP } from "@/lib/finance/help";

interface FinanceRule {
  id: string;
  name: string;
  ruleType: string;
  priority: number;
  isActive: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
}

interface FinanceSignalPreview {
  id: string;
  kind: string;
  messageSubtype: string;
  settlementStatus: string;
  description: string;
  amount?: number | null;
  sourceAmount?: number | null;
  sourceCurrency?: string | null;
  fxRate?: number | null;
  requiresCurrencyReview: boolean;
  promotionState: string;
  category?: string | null;
  document: {
    subject?: string | null;
    sender?: string | null;
  };
}

interface FinanceSource {
  id: string;
  label: string;
  senderEmail?: string | null;
  senderDomain?: string | null;
  trustLevel: string;
  defaultDisposition: string;
  categoryHint?: string | null;
  subcategoryHint?: string | null;
  countryHint?: string | null;
  currencyHint?: string | null;
  localeHint?: string | null;
  documentCount: number;
  signalCount: number;
  confirmedCount: number;
  ignoredCount: number;
  autoPostCount: number;
  provisionalCount: number;
  settledCount: number;
  failedCount: number;
  isBiller: boolean;
  isIncomeSource: boolean;
  isRecurring: boolean;
  exampleSubtypes: string[];
  merchant?: { id: string; name: string } | null;
  rules: FinanceRule[];
  signals: FinanceSignalPreview[];
}

function formatCOP(value?: number | null) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value || 0));
}

function formatSignalAmount(signal: FinanceSignalPreview) {
  if (signal.amount == null && signal.sourceAmount == null) return "No amount";
  if (signal.sourceCurrency && signal.sourceCurrency !== "COP" && signal.sourceAmount != null) {
    return `${signal.sourceCurrency} ${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(signal.sourceAmount)} -> ${signal.amount != null ? formatCOP(signal.amount) : "review"}`;
  }

  return formatCOP(signal.amount ?? signal.sourceAmount ?? 0);
}

function summarizeRule(rule: FinanceRule) {
  const conditions = rule.conditions || {};
  const actions = rule.actions || {};
  const subtype =
    typeof conditions.messageSubtype === "string" ? conditions.messageSubtype.replace(/_/g, " ") : null;
  const subject =
    Array.isArray(conditions.subjectIncludes) && conditions.subjectIncludes[0]
      ? String(conditions.subjectIncludes[0])
      : null;
  const action =
    typeof actions.action === "string"
      ? actions.action.replace(/_/g, " ")
      : typeof actions.defaultDisposition === "string"
      ? String(actions.defaultDisposition).replace(/_/g, " ")
      : "custom";

  return [action, subtype, subject].filter(Boolean).join(" · ");
}

export default function FinanceSourcesPage() {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [ruleSavingKey, setRuleSavingKey] = useState<string | null>(null);
  const { data, initialLoading, refresh } = useCachedFetch<{ sources: FinanceSource[] }>(
    useMemo(() => "/api/finance/sources", []),
    { ttl: 30_000 }
  );

  const refreshFinanceCaches = () => {
    invalidateCache("/api/finance/sources");
    invalidateCache("/api/finance/inbox");
    invalidateCache("/api/finance/summary");
    invalidateCache("/api/finance/rules");
    refresh();
  };

  const updateSource = async (id: string, patch: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/finance/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to update source");
      }
      refreshFinanceCaches();
    } finally {
      setSavingId(null);
    }
  };

  const createRuleFromSignal = async (
    source: FinanceSource,
    signal: FinanceSignalPreview,
    action:
      | "ignore"
      | "bill_notice"
      | "provisional_purchase"
      | "settle_charge"
      | "mark_failed_payment"
  ) => {
    const key = `${source.id}:${signal.id}:${action}`;
    setRuleSavingKey(key);
    try {
      const subjectSnippet = signal.document.subject?.slice(0, 56)?.trim();
      const payload = {
        name: `${source.label} ${action.replace(/_/g, " ")}`,
        ruleType: "source_override",
        sourceId: source.id,
        priority: 200,
        learned: true,
        conditions: {
          sourceId: source.id,
          messageSubtype: signal.messageSubtype,
          subjectIncludes: subjectSnippet ? [subjectSnippet] : undefined,
          requiresAmount:
            action === "settle_charge" || action === "bill_notice" ? Boolean(signal.sourceAmount ?? signal.amount) : undefined,
          requiresOrderRef: action === "provisional_purchase" ? false : undefined,
        },
        actions: {
          action,
          signalKind:
            action === "bill_notice"
              ? signal.kind === "statement"
                ? "statement"
                : "bill_due"
              : signal.kind,
          classification:
            action === "bill_notice"
              ? signal.kind === "statement"
                ? "statement"
                : "bill_notice"
              : "expense_receipt",
          type: signal.kind === "income" ? "income" : signal.kind === "transfer" ? "transfer" : "expense",
        },
      };

      const res = await fetch("/api/finance/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create rule");
      }
      refreshFinanceCaches();
    } finally {
      setRuleSavingKey(null);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the source default here, then add second-layer rules for mixed senders like Amazon, payment processors, and billers with promos.
        </p>
      </div>

      {initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(data?.sources || []).map((source) => (
            <Card key={source.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{source.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {source.senderEmail || source.senderDomain || "manual"} · {source.documentCount} docs ·{" "}
                      {source.signalCount} signals
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {source.localeHint || "locale?"} · {source.currencyHint || "currency?"} ·{" "}
                      {source.countryHint || "country?"}
                    </p>
                  </div>
                  <Badge variant="outline">{source.defaultDisposition.replace(/_/g, " ")}</Badge>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{source.trustLevel}</Badge>
                  {source.isBiller && <Badge variant="secondary">biller</Badge>}
                  {source.isIncomeSource && <Badge variant="secondary">income</Badge>}
                  {source.isRecurring && <Badge variant="secondary">recurring</Badge>}
                  {source.exampleSubtypes.slice(0, 3).map((subtype) => (
                    <Badge key={subtype} variant="secondary">
                      {subtype.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Settled</p>
                    <p className="mt-1 font-semibold">{source.settledCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Provisional</p>
                    <p className="mt-1 font-semibold">{source.provisionalCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Failed</p>
                    <p className="mt-1 font-semibold">{source.failedCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Ignored</p>
                    <p className="mt-1 font-semibold">{source.ignoredCount}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === source.id}
                      onClick={() =>
                        updateSource(source.id, {
                          trustLevel: "ignored",
                          defaultDisposition: "always_ignore",
                        })
                      }
                    >
                      Ignore Source
                    </Button>
                    <HelpTooltip content={FINANCE_HELP.ignoreSource} />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === source.id}
                      onClick={() =>
                        updateSource(source.id, {
                          trustLevel: "learning",
                          defaultDisposition: "capture_only",
                        })
                      }
                    >
                      Capture Only
                    </Button>
                    <HelpTooltip content={FINANCE_HELP.captureOnly} />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === source.id}
                      onClick={() =>
                        updateSource(source.id, {
                          trustLevel: "learning",
                          defaultDisposition: "bill_notice",
                          isBiller: true,
                        })
                      }
                    >
                      Biller
                    </Button>
                    <HelpTooltip content={FINANCE_HELP.biller} />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === source.id}
                      onClick={() =>
                        updateSource(source.id, {
                          trustLevel: "learning",
                          defaultDisposition: "income_notice",
                          isIncomeSource: true,
                        })
                      }
                    >
                      Income
                    </Button>
                    <HelpTooltip content={FINANCE_HELP.income} />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      disabled={savingId === source.id}
                      onClick={() =>
                        updateSource(source.id, {
                          trustLevel: "trusted",
                          defaultDisposition: "trusted_autopost",
                        })
                      }
                    >
                      Trust + Auto-settle
                    </Button>
                    <HelpTooltip content={FINANCE_HELP.trustAutoSettle} />
                  </div>
                </div>

                {source.rules.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Rules</p>
                      <HelpTooltip content="Rules sit underneath the source default. Use them when one sender mixes promos, order confirmations, charges, statements, and failed payments." />
                    </div>
                    <div className="space-y-2">
                      {source.rules.map((rule) => (
                        <div key={rule.id} className="rounded-2xl border border-border/30 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{rule.name}</p>
                            <Badge variant="outline">P{rule.priority}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{summarizeRule(rule)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {source.signals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Examples</p>
                    {source.signals.map((signal) => (
                      <div key={signal.id} className="rounded-2xl border border-border/30 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{signal.document.subject || signal.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {signal.messageSubtype.replace(/_/g, " ")} · {signal.category || "uncategorized"} ·{" "}
                              {signal.settlementStatus}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatSignalAmount(signal)}</p>
                            {signal.requiresCurrencyReview && (
                              <p className="text-[11px] text-amber-300">currency review</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ruleSavingKey === `${source.id}:${signal.id}:ignore`}
                            onClick={() => createRuleFromSignal(source, signal, "ignore")}
                          >
                            Ignore Similar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ruleSavingKey === `${source.id}:${signal.id}:provisional_purchase`}
                            onClick={() => createRuleFromSignal(source, signal, "provisional_purchase")}
                          >
                            Make Provisional
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ruleSavingKey === `${source.id}:${signal.id}:settle_charge`}
                            onClick={() => createRuleFromSignal(source, signal, "settle_charge")}
                          >
                            Auto-settle Similar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ruleSavingKey === `${source.id}:${signal.id}:bill_notice`}
                            onClick={() => createRuleFromSignal(source, signal, "bill_notice")}
                          >
                            Bill Notice
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={ruleSavingKey === `${source.id}:${signal.id}:mark_failed_payment`}
                            onClick={() => createRuleFromSignal(source, signal, "mark_failed_payment")}
                          >
                            Failed Payment
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
