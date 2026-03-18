"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedFetch, invalidateCache } from "@/lib/cache";

interface FinanceSource {
  id: string;
  label: string;
  senderEmail?: string | null;
  senderDomain?: string | null;
  trustLevel: string;
  defaultDisposition: string;
  categoryHint?: string | null;
  documentCount: number;
  signalCount: number;
  confirmedCount: number;
  ignoredCount: number;
  autoPostCount: number;
  isBiller: boolean;
  isIncomeSource: boolean;
  isRecurring: boolean;
  merchant?: { id: string; name: string } | null;
  signals: Array<{
    id: string;
    kind: string;
    description: string;
    amount?: number | null;
    promotionState: string;
    category?: string | null;
  }>;
}

function formatCOP(value?: number | null) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value || 0));
}

export default function FinanceSourcesPage() {
  const [savingId, setSavingId] = useState<string | null>(null);
  const { data, initialLoading, refresh } = useCachedFetch<{ sources: FinanceSource[] }>(
    useMemo(() => "/api/finance/sources", []),
    { ttl: 30_000 }
  );

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
      invalidateCache("/api/finance/sources");
      invalidateCache("/api/finance/inbox");
      invalidateCache("/api/finance/summary");
      refresh();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Train your usual suspects here so Gmail capture gets cleaner over time.
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
                  </div>
                  <Badge variant="outline">
                    {source.defaultDisposition.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{source.trustLevel}</Badge>
                  {source.isBiller && <Badge variant="secondary">biller</Badge>}
                  {source.isIncomeSource && <Badge variant="secondary">income</Badge>}
                  {source.isRecurring && <Badge variant="secondary">recurring</Badge>}
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Confirmed</p>
                    <p className="mt-1 font-semibold">{source.confirmedCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Ignored</p>
                    <p className="mt-1 font-semibold">{source.ignoredCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="text-muted-foreground">Auto-posted</p>
                    <p className="mt-1 font-semibold">{source.autoPostCount}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
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
                    Trust & Auto-post
                  </Button>
                </div>

                {source.signals.length > 0 && (
                  <div className="space-y-2">
                    {source.signals.map((signal) => (
                      <div key={signal.id} className="rounded-2xl border border-border/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{signal.description}</p>
                          <p className="text-sm font-semibold">
                            {signal.amount != null ? formatCOP(signal.amount) : "No amount"}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {signal.kind} · {signal.category || "uncategorized"} · {signal.promotionState}
                        </p>
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
