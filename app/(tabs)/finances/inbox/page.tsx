"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceQuickCapture } from "@/components/finance-quick-capture";
import { useCachedFetch, invalidateCache } from "@/lib/cache";

interface SourceItem {
  id: string;
  label: string;
  senderEmail?: string | null;
  senderDomain?: string | null;
  trustLevel: string;
  defaultDisposition: string;
  documentCount: number;
  signalCount: number;
}

interface SignalItem {
  id: string;
  kind: string;
  description: string;
  amount?: number | null;
  category?: string | null;
  promotionState: string;
  confidence?: number | null;
  dueDate?: string | null;
  source?: SourceItem | null;
  merchant?: { id: string; name: string } | null;
  document: {
    id: string;
    sender?: string | null;
    subject?: string | null;
    filename?: string | null;
    classification: string;
    processingStage: string;
    status: string;
    passwordSecretKey?: string | null;
  };
  reviewItems?: Array<{ id: string; kind: string; title: string }>;
}

interface InboxData {
  counts: {
    newSources: number;
    pendingTransactions: number;
    upcomingBills: number;
    ignoredNoise: number;
    pendingReviews: number;
  };
  sections: {
    newSources: SourceItem[];
    pendingTransactions: SignalItem[];
    upcomingBills: SignalItem[];
    ignoredNoise: Array<{
      id: string;
      sender?: string | null;
      subject?: string | null;
      classification: string;
      sourceRef?: SourceItem | null;
    }>;
  };
}

function formatCOP(value?: number | null) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value || 0));
}

export default function FinanceInboxPage() {
  const [passwordBySignal, setPasswordBySignal] = useState<Record<string, string>>({});
  const { data, initialLoading, refresh } = useCachedFetch<InboxData>(
    useMemo(() => "/api/finance/inbox", []),
    { ttl: 20_000 }
  );

  const applyAction = async (
    action: string,
    payload: { signalId?: string; documentId?: string; payload?: Record<string, unknown> }
  ) => {
    const res = await fetch("/api/finance/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        signalId: payload.signalId,
        documentId: payload.documentId,
        payload: payload.payload,
      }),
    });

    if (res.ok) {
      invalidateCache("/api/finance/inbox");
      invalidateCache("/api/finance/summary");
      invalidateCache("/api/finance/transactions?status=posted");
      invalidateCache("/api/finance/transactions?status=pending");
      refresh();
    }
  };

  const SectionCard = ({
    title,
    count,
    children,
  }: {
    title: string;
    count: number;
    children: React.ReactNode;
  }) => (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{title}</p>
          <Badge variant="outline">{count}</Badge>
        </div>
        {children}
      </CardContent>
    </Card>
  );

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Finance Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Documents land here first. Only confirmed or trusted items should hit the ledger.
          </p>
        </div>
        <Link href="/finances/sources" className="hidden lg:block">
          <Button variant="outline">Open Sources</Button>
        </Link>
      </div>

      <FinanceQuickCapture onSaved={refresh} compact />

      {initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="New Sources"
            count={data?.counts.newSources || 0}
          >
            <div className="space-y-3">
              {(data?.sections.newSources || []).map((source) => (
                <div key={source.id} className="rounded-2xl border border-border/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{source.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {source.senderEmail || source.senderDomain || "manual"} · {source.documentCount} docs
                      </p>
                    </div>
                    <Badge variant="secondary">{source.defaultDisposition.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              ))}
              <Link href="/finances/sources">
                <Button variant="outline" className="w-full">
                  Curate Sources
                </Button>
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            title="Pending Transactions"
            count={data?.counts.pendingTransactions || 0}
          >
            <div className="space-y-3">
              {(data?.sections.pendingTransactions || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.source?.label || item.document.sender || "Unknown source"} ·{" "}
                        {item.category || "uncategorized"} · {item.kind}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {item.amount != null ? formatCOP(item.amount) : "No amount"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {Math.round((item.confidence || 0) * 100)}% confidence
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => applyAction("confirm", { signalId: item.id })}>
                      Confirm & Post
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyAction("ignore", { signalId: item.id })}
                    >
                      Ignore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyAction("create_rule", { signalId: item.id })}
                    >
                      Learn Rule
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Upcoming Bills"
            count={data?.counts.upcomingBills || 0}
          >
            <div className="space-y-3">
              {(data?.sections.upcomingBills || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.source?.label || item.document.sender || "Unknown source"} · due{" "}
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "unknown"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {item.amount != null ? formatCOP(item.amount) : "Pending"}
                    </p>
                  </div>

                  {item.document.status === "password_required" && (
                    <div className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="text-xs text-muted-foreground">
                        Password needed for {item.document.filename || "attachment"}.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={passwordBySignal[item.id] || ""}
                          onChange={(event) =>
                            setPasswordBySignal((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Bank PDF password"
                        />
                        <Button
                          variant="outline"
                          onClick={() =>
                            applyAction("attach_password", {
                              signalId: item.id,
                              payload: {
                                password: passwordBySignal[item.id],
                                passwordSecretKey: item.document.passwordSecretKey,
                              },
                            })
                          }
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Ignored / Noise"
            count={data?.counts.ignoredNoise || 0}
          >
            <div className="space-y-3">
              {(data?.sections.ignoredNoise || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/30 p-4">
                  <p className="text-sm font-medium">{item.subject || "Ignored document"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.sourceRef?.label || item.sender || "Unknown source"} · {item.classification}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
