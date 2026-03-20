"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PiggyBank, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateCache, useCachedFetch } from "@/lib/cache";

interface PocketRule {
  id: string;
  name?: string | null;
  percentOfIncome: number;
  priority: number;
  active: boolean;
}

interface Pocket {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  currentBalance: number;
  targetAmount?: number | null;
  active: boolean;
  allocationRules: PocketRule[];
}

interface PendingRun {
  id: string;
  runType: string;
  grossAmount: number;
  notes?: string | null;
  suggestedAllocations?: Array<{ pocketId: string; amount: number; percentOfIncome: number }>;
  sourceTransaction?: {
    id: string;
    description: string;
    amount: number;
    transactedAt: string;
  } | null;
}

interface PocketResponse {
  pockets: Pocket[];
  pendingRuns: PendingRun[];
  primaryAccount: {
    id: string;
    name: string;
    balance: number;
  };
  primaryCashBalance: number;
  totalPocketBalance: number;
  unassignedCash: number;
  allocationPercentTotal: number;
  rulesComplete: boolean;
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FinancePocketsPage() {
  const [savingPocketId, setSavingPocketId] = useState<string | null>(null);
  const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
  const [draftPercents, setDraftPercents] = useState<Record<string, string>>({});

  const { data, initialLoading, refresh } = useCachedFetch<PocketResponse>(
    useMemo(() => "/api/finance/pockets", []),
    { ttl: 20_000 }
  );

  const saveRule = async (pocket: Pocket) => {
    const rule = pocket.allocationRules[0];
    const value = draftPercents[pocket.id] ?? String(rule?.percentOfIncome ?? 0);
    const percentOfIncome = Number(value);

    if (!Number.isFinite(percentOfIncome) || percentOfIncome < 0) {
      toast.error("Enter a valid percentage");
      return;
    }

    setSavingPocketId(pocket.id);
    try {
      const res = await fetch("/api/finance/paycheck-allocation-rules", {
        method: rule?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule?.id,
          pocketId: pocket.id,
          percentOfIncome,
          priority: rule?.priority ?? pocket.allocationRules[0]?.priority ?? 0,
          name: rule?.name || `${pocket.name} allocation`,
          active: true,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save percentage");
      }

      toast.success(`Saved ${pocket.name} at ${percentOfIncome}%`);
      invalidateCache("/api/finance/pockets");
      invalidateCache("/api/finance/paycheck-allocation-rules");
      invalidateCache("/api/finance/summary");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save percentage");
    } finally {
      setSavingPocketId(null);
    }
  };

  const confirmRun = async (runId: string) => {
    setConfirmingRunId(runId);
    try {
      const res = await fetch(`/api/finance/paycheck-allocation-runs/${runId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to confirm allocation");
      }

      toast.success("Pocket balances updated");
      invalidateCache("/api/finance/pockets");
      invalidateCache("/api/finance/summary");
      invalidateCache("/api/finance/transactions");
      invalidateCache("/api/finance/pending-categorization");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to confirm allocation");
    } finally {
      setConfirmingRunId(null);
    }
  };

  return (
    <div className="space-y-4 px-4 pb-36 pt-12 lg:pb-8">
      <div className="flex items-center gap-3">
        <Link href="/finances">
          <button className="rounded-xl p-2 transition-colors hover:bg-secondary/50">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Pockets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Split paycheck income into your five bolsillos, then deduct cash expenses from the right one after categorizing them.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-emerald-400" />
              Primary Cash
            </div>
            {initialLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold">{formatCOP(data?.primaryCashBalance || 0)}</p>
                <p className="text-xs text-muted-foreground">
                  {data?.primaryAccount?.name || "Bancolombia Available Cash"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PiggyBank className="h-4 w-4 text-cyan-400" />
              Pocketed Cash
            </div>
            {initialLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold">{formatCOP(data?.totalPocketBalance || 0)}</p>
                <p className="text-xs text-muted-foreground">
                  Confirmed across the five canonical pockets
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={(data?.unassignedCash || 0) < 0 ? "border-red-500/30" : undefined}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <RefreshCw className="h-4 w-4 text-amber-400" />
              Unassigned Cash
            </div>
            {initialLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p
                  className={`text-2xl font-bold ${
                    (data?.unassignedCash || 0) < 0 ? "text-red-400" : ""
                  }`}
                >
                  {formatCOP(data?.unassignedCash || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cash already in the bank but not yet assigned to a pocket
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Paycheck Split Percentages</p>
              <p className="mt-1 text-xs text-muted-foreground">
                These percentages are used every time a Gusto paycheck lands or when you seed your current cash balance.
              </p>
            </div>
            {!initialLoading && (
              <div className="text-right">
                <p
                  className={`text-sm font-semibold ${
                    data?.rulesComplete ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {data?.allocationPercentTotal || 0}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data?.rulesComplete ? "Ready to confirm" : "Must total 100%"}
                </p>
              </div>
            )}
          </div>

          {initialLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-36 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {(data?.pockets || []).map((pocket) => {
                const rule = pocket.allocationRules[0];
                const draftValue =
                  draftPercents[pocket.id] ?? String(rule?.percentOfIncome ?? 0);

                return (
                  <div key={pocket.id} className="rounded-2xl border border-border/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{pocket.name}</p>
                        {pocket.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">{pocket.description}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCOP(pocket.currentBalance)}</p>
                        <p className="text-[11px] text-muted-foreground">current balance</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end gap-2">
                      <label className="flex-1">
                        <span className="mb-1 block text-[11px] text-muted-foreground">
                          % of paycheck
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border/40 bg-background px-3 py-2 text-sm"
                          value={draftValue}
                          onChange={(event) =>
                            setDraftPercents((current) => ({
                              ...current,
                              [pocket.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        disabled={savingPocketId === pocket.id}
                        onClick={() => saveRule(pocket)}
                      >
                        {savingPocketId === pocket.id ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm font-semibold">Pending Allocation Prompts</p>
          {initialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : data?.pendingRuns?.length ? (
            <div className="space-y-3">
              {data.pendingRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-border/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {run.runType === "initial_seed"
                          ? "Seed current cash into pockets"
                          : run.sourceTransaction?.description || "Paycheck allocation"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {run.runType === "initial_seed"
                          ? "Use your saved percentages to reflect the current bank balance in your bolsillos."
                          : run.sourceTransaction?.transactedAt
                          ? new Date(run.sourceTransaction.transactedAt).toLocaleDateString()
                          : "New paycheck"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatCOP(run.grossAmount)}</p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(run.suggestedAllocations || []).map((allocation, index) => {
                      const pocket = data.pockets.find((item) => item.id === allocation.pocketId);
                      return (
                        <div
                          key={`${run.id}:${allocation.pocketId}:${index}`}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span>
                            {pocket?.name || "Pocket"} - {allocation.percentOfIncome}%
                          </span>
                          <span>{formatCOP(allocation.amount)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      {data.rulesComplete
                        ? "Confirm after you have mirrored the split in your bank pockets."
                        : "Set your five percentages to a full 100% before confirming."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={confirmingRunId === run.id || !data.rulesComplete}
                      onClick={() => confirmRun(run.id)}
                    >
                      {confirmingRunId === run.id ? "Confirming..." : "Confirm Allocation"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No pending paycheck or seed prompts right now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
