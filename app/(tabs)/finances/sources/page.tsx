"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pin, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";
import { invalidateCache, setCacheEntry, useCachedFetch } from "@/lib/cache";
import { FINANCE_HELP } from "@/lib/finance/help";

interface FinanceRule {
  id: string;
  name: string;
  priority: number;
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
  requiresCurrencyReview: boolean;
  category?: string | null;
  document: {
    subject?: string | null;
  };
}

interface LearningSummary {
  latestSummary: string | null;
  latestAt: string | null;
  count: number;
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
  notes?: string | null;
  reviewed: boolean;
  isPriority: boolean;
  prioritySourceRole?: string | null;
  priorityInstitution?: string | null;
  documentCount: number;
  signalCount: number;
  ignoredCount: number;
  provisionalCount: number;
  settledCount: number;
  failedCount: number;
  isBiller: boolean;
  isIncomeSource: boolean;
  isRecurring: boolean;
  exampleSubtypes: string[];
  rules: FinanceRule[];
  signals: FinanceSignalPreview[];
  learningSummary: LearningSummary;
}

interface FinanceSourcesResponse {
  sections: {
    needsReview: FinanceSource[];
    reviewed: FinanceSource[];
  };
  summary: {
    needsReviewCount: number;
    reviewedCount: number;
    priorityCount: number;
    totalCount: number;
  };
}

interface SourceDraft {
  label: string;
  notes: string;
  categoryHint: string;
  subcategoryHint: string;
  countryHint: string;
  currencyHint: string;
  localeHint: string;
  isBiller: boolean;
  isIncomeSource: boolean;
  isRecurring: boolean;
  prioritySourceRole: string;
  priorityInstitution: string;
  password: string;
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
  const subtype = typeof rule.conditions.messageSubtype === "string" ? rule.conditions.messageSubtype.replace(/_/g, " ") : null;
  const action =
    typeof rule.actions.action === "string"
      ? rule.actions.action.replace(/_/g, " ")
      : typeof rule.actions.defaultDisposition === "string"
        ? String(rule.actions.defaultDisposition).replace(/_/g, " ")
        : "custom";
  return [action, subtype].filter(Boolean).join(" - ");
}

function buildDraft(source: FinanceSource): SourceDraft {
  return {
    label: source.label,
    notes: source.notes || "",
    categoryHint: source.categoryHint || "",
    subcategoryHint: source.subcategoryHint || "",
    countryHint: source.countryHint || "",
    currencyHint: source.currencyHint || "",
    localeHint: source.localeHint || "",
    isBiller: source.isBiller,
    isIncomeSource: source.isIncomeSource,
    isRecurring: source.isRecurring,
    prioritySourceRole: source.prioritySourceRole || "",
    priorityInstitution: source.priorityInstitution || "",
    password: "",
  };
}

function formatWhen(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <button type="button" className="flex w-full items-center justify-between text-left" onClick={onToggle}>
          <div>
            <p className="text-base font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{count} sources</p>
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open && children}
      </CardContent>
    </Card>
  );
}

export default function FinanceSourcesPage() {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState({ needsReview: true, reviewed: false });
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  const [localData, setLocalData] = useState<FinanceSourcesResponse | null>(null);
  const { data, error, initialLoading, refresh } = useCachedFetch<FinanceSourcesResponse>(
    useMemo(() => "/api/finance/sources", []),
    { ttl: 30_000, timeoutMs: 20_000 }
  );

  useEffect(() => {
    if (!data) return;
    setLocalData(data);
    setDrafts((current) => {
      const next = { ...current };
      for (const source of [...data.sections.needsReview, ...data.sections.reviewed]) {
        if (!next[source.id] || editingId !== source.id) next[source.id] = buildDraft(source);
      }
      return next;
    });
  }, [data, editingId]);

  const sourceData = localData || data;

  const updateData = (payload: FinanceSourcesResponse) => {
    setLocalData(payload);
    setCacheEntry("/api/finance/sources", payload);
    invalidateCache("/api/finance/inbox");
    invalidateCache("/api/finance/summary");
    invalidateCache("/api/finance/learning-events");
  };

  const runAction = async (
    sourceId: string,
    action: "classify_source" | "edit_source" | "learn_from_example" | "dismiss_example" | "pin_priority_source",
    body: Record<string, unknown>,
    successMessage: string
  ) => {
    setSavingKey(`${sourceId}:${action}`);
    try {
      const res = await fetch(`/api/finance/sources/${sourceId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to apply source action");
      if (payload.payload) updateData(payload.payload);
      toast.success(successMessage);
    } catch (actionError) {
      console.error(actionError);
      toast.error(actionError instanceof Error ? actionError.message : "Source action failed");
    } finally {
      setSavingKey(null);
    }
  };

  const renderSource = (source: FinanceSource) => {
    const draft = drafts[source.id] || buildDraft(source);
    const learningAt = formatWhen(source.learningSummary?.latestAt);
    const quickActions = [
      { label: "Ignore Source", help: FINANCE_HELP.ignoreSource, fields: { trustLevel: "ignored", defaultDisposition: "always_ignore" }, success: `Ignoring ${source.label} by default` },
      { label: "Capture Only", help: FINANCE_HELP.captureOnly, fields: { trustLevel: "learning", defaultDisposition: "capture_only" }, success: `Set ${source.label} to capture only` },
      { label: "Biller", help: FINANCE_HELP.biller, fields: { trustLevel: "learning", defaultDisposition: "bill_notice", isBiller: true }, success: `Marked ${source.label} as a biller` },
      { label: "Income", help: FINANCE_HELP.income, fields: { trustLevel: "learning", defaultDisposition: "income_notice", isIncomeSource: true }, success: `Marked ${source.label} as an income source` },
    ] as const;
    const exampleActions = [
      { label: "Ignore Similar", action: "ignore", success: `Learned to ignore similar ${source.label} emails` },
      { label: "Make Provisional", action: "provisional_purchase", success: `Learned provisional purchase behavior for ${source.label}` },
      { label: "Auto-settle Similar", action: "settle_charge", success: `Learned to auto-settle similar ${source.label} charges` },
      { label: "Bill Notice", action: "bill_notice", success: `Learned bill-notice behavior for ${source.label}` },
      { label: "Failed Payment", action: "mark_failed_payment", success: `Learned failed-payment behavior for ${source.label}` },
    ] as const;

    return (
      <Card key={source.id}>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">{source.label}</p>
                {source.isPriority && (
                  <Badge variant="secondary" className="gap-1">
                    <Pin className="h-3 w-3" />
                    priority
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.senderEmail || source.senderDomain || "manual"} - {source.documentCount} docs - {source.signalCount} signals
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {source.localeHint || "locale?"} - {source.currencyHint || "currency?"} - {source.countryHint || "country?"}
              </p>
            </div>
            <Badge variant="outline">{source.isPriority ? source.prioritySourceRole?.replace(/_/g, " ") || "priority" : source.defaultDisposition.replace(/_/g, " ")}</Badge>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{source.trustLevel}</Badge>
            {source.isBiller && <Badge variant="secondary">biller</Badge>}
            {source.isIncomeSource && <Badge variant="secondary">income</Badge>}
            {source.isRecurring && <Badge variant="secondary">recurring</Badge>}
            {source.priorityInstitution && <Badge variant="secondary">{source.priorityInstitution}</Badge>}
            {source.exampleSubtypes.slice(0, 3).map((subtype) => (
              <Badge key={subtype} variant="secondary">{subtype.replace(/_/g, " ")}</Badge>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs">
            {[
              ["Settled", source.settledCount],
              ["Provisional", source.provisionalCount],
              ["Failed", source.failedCount],
              ["Ignored", source.ignoredCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-border/40 p-3">
                <p className="text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-cyan-400" />Learning</p>
                <p className="mt-1 text-xs text-muted-foreground">{source.rules.length} learned rules - {source.learningSummary?.count || 0} learning events</p>
              </div>
              {learningAt && <span className="text-[11px] text-muted-foreground">{learningAt}</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{source.learningSummary?.latestSummary || "No visible learning event yet. The first confirm, edit, ignore, or example-based rule will show up here."}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickActions.map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(savingKey)}
                  onClick={() => runAction(source.id, "classify_source", { fields: item.fields }, item.success)}
                >
                  {item.label}
                </Button>
                <HelpTooltip content={item.help} />
              </div>
            ))}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                disabled={Boolean(savingKey)}
                onClick={() =>
                  runAction(source.id, "classify_source", { fields: { trustLevel: "trusted", defaultDisposition: "trusted_autopost" } }, `Trusted ${source.label} for rule-based auto-settle`)
                }
              >
                Trust + Auto-settle
              </Button>
              <HelpTooltip content={FINANCE_HELP.trustAutoSettle} />
            </div>
            <Button size="sm" variant={editingId === source.id ? "secondary" : "ghost"} onClick={() => setEditingId((current) => (current === source.id ? null : source.id))}>
              {editingId === source.id ? "Close Edit" : "Edit Source"}
            </Button>
          </div>

          {editingId === source.id && (
            <div className="space-y-3 rounded-2xl border border-border/40 bg-secondary/10 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Source label", "label"],
                  ["Priority role", "prioritySourceRole"],
                  ["Category hint", "categoryHint"],
                  ["Subcategory hint", "subcategoryHint"],
                  ["Country hint", "countryHint"],
                  ["Currency hint", "currencyHint"],
                  ["Locale hint", "localeHint"],
                  ["Institution / provider", "priorityInstitution"],
                ].map(([label, key]) => (
                  <label key={String(key)} className="space-y-1 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <input
                      className="w-full rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                      value={String(draft[key as keyof SourceDraft] || "")}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [source.id]: { ...draft, [key]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Notes</span>
                <textarea
                  className="min-h-[80px] w-full rounded-2xl border border-border/40 bg-background px-3 py-2 text-sm"
                  value={draft.notes}
                  onChange={(event) => setDrafts((current) => ({ ...current, [source.id]: { ...draft, notes: event.target.value } }))}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">PDF password for protected bank statements</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                    placeholder="Stored in the finance vault"
                    value={draft.password}
                    onChange={(event) => setDrafts((current) => ({ ...current, [source.id]: { ...draft, password: event.target.value } }))}
                  />
                </label>
                <div className="rounded-2xl border border-border/30 p-3 text-xs text-muted-foreground">
                  Use this for encrypted PDF statements like Bancolombia. Saving it here stores the password in the finance vault so future rescans can retry those PDFs automatically.
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                {[
                  ["Biller", "isBiller"],
                  ["Income source", "isIncomeSource"],
                  ["Recurring", "isRecurring"],
                ].map(([label, key]) => (
                  <label key={String(key)} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(draft[key as keyof SourceDraft])}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [source.id]: { ...draft, [key]: event.target.checked },
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={Boolean(savingKey)} onClick={() => runAction(source.id, "edit_source", { fields: { ...draft, password: undefined } }, `Saved source settings for ${draft.label || source.label}`)}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save Source
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(savingKey)}
                  onClick={() =>
                    runAction(
                      source.id,
                      "pin_priority_source",
                      { fields: { sourceRole: draft.prioritySourceRole || "bank_transaction", institution: draft.priorityInstitution || source.label, defaultDisposition: source.defaultDisposition, password: draft.password || undefined } },
                      `${source.label} pinned as a priority source`
                    )
                  }
                >
                  <Pin className="mr-1.5 h-3.5 w-3.5" />
                  Save Priority Rule
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDrafts((current) => ({ ...current, [source.id]: buildDraft(source) }));
                    setEditingId(null);
                  }}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {source.rules.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Rules</p>
                <HelpTooltip content="Rules sit underneath the source default. Use them when one sender mixes promos, order confirmations, charges, statements, and failed payments." />
              </div>
              {source.rules.map((rule) => (
                <div key={rule.id} className="rounded-2xl border border-border/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <Badge variant="outline">P{rule.priority}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{summarizeRule(rule)}</p>
                </div>
              ))}
            </div>
          )}

          {source.signals.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Examples</p>
                <HelpTooltip content={FINANCE_HELP.learnRule} />
              </div>
              {source.signals.map((signal) => (
                <div key={signal.id} className="space-y-3 rounded-2xl border border-border/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{signal.document.subject || signal.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{signal.messageSubtype.replace(/_/g, " ")} - {signal.category || "uncategorized"} - {signal.settlementStatus}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatSignalAmount(signal)}</p>
                      {signal.requiresCurrencyReview && <p className="text-[11px] text-amber-300">currency review</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {exampleActions.map((item) => (
                      <Button
                        key={item.label}
                        size="sm"
                        variant="outline"
                        disabled={Boolean(savingKey)}
                        onClick={() => runAction(source.id, "learn_from_example", { signalId: signal.id, ruleAction: item.action }, item.success)}
                      >
                        {item.label}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" disabled={Boolean(savingKey)} onClick={() => runAction(source.id, "dismiss_example", { signalId: signal.id }, `Dismissed that example for ${source.label}`)}>
                      Dismiss Example
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {source.signals.length === 0 && source.signalCount > 0 && (
            <div className="rounded-2xl border border-border/30 p-3">
              <p className="text-sm font-medium">Examples</p>
              <p className="mt-1 text-xs text-muted-foreground">Stored history exists for this source, but the current examples are already covered by rules or too weak to keep actionable.</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 px-4 pb-36 pt-12 lg:pb-8">
      <div>
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review untouched senders first, keep trained sources editable, and teach mixed senders how to separate promos, bills, payroll, orders, and settled charges.</p>
      </div>

      {sourceData && (
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Needs Review", sourceData.summary.needsReviewCount],
            ["Reviewed", sourceData.summary.reviewedCount],
            ["Priority Sources", sourceData.summary.priorityCount],
            ["Total Tracked", sourceData.summary.totalCount],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">Source view is in fallback mode.</p>
              <p className="mt-1 text-xs text-muted-foreground">Your saved source data is still there, but the richer source payload needs another try.</p>
            </div>
            <Button variant="outline" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {initialLoading && !sourceData ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : sourceData ? (
        <div className="space-y-4">
          <Section title="Needs Review" count={sourceData.sections.needsReview.length} open={sectionOpen.needsReview} onToggle={() => setSectionOpen((current) => ({ ...current, needsReview: !current.needsReview }))}>
            {sourceData.sections.needsReview.length ? <div className="grid gap-4 xl:grid-cols-2">{sourceData.sections.needsReview.map(renderSource)}</div> : <div className="rounded-2xl border border-dashed border-emerald-500/25 p-6 text-sm text-muted-foreground">Everything discovered so far has already been reviewed or trained.</div>}
          </Section>
          <Section title="Reviewed Sources" count={sourceData.sections.reviewed.length} open={sectionOpen.reviewed} onToggle={() => setSectionOpen((current) => ({ ...current, reviewed: !current.reviewed }))}>
            {sourceData.sections.reviewed.length ? <div className="grid gap-4 xl:grid-cols-2">{sourceData.sections.reviewed.map(renderSource)}</div> : <div className="rounded-2xl border border-dashed border-border/30 p-6 text-sm text-muted-foreground">No reviewed sources yet. The first classification, edit, or learned rule will move a source here.</div>}
          </Section>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/40 p-6 text-sm text-muted-foreground">No sources available yet.</div>
      )}
    </div>
  );
}
