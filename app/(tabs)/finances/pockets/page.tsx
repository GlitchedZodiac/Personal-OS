"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PiggyBank, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateCache, useCachedFetch } from "@/lib/cache";

interface Pocket {
  id: string;
  name: string;
  description?: string | null;
  currentBalance: number;
  targetAmount?: number | null;
  active: boolean;
  allocationRules: Array<{
    id: string;
    name?: string | null;
    percentOfIncome: number;
    priority: number;
    active: boolean;
  }>;
}

interface PendingRun {
  id: string;
  grossAmount: number;
  suggestedAllocations?: Array<{ pocketId: string; amount: number; percentOfIncome: number }>;
  sourceTransaction?: {
    id: string;
    description: string;
    amount: number;
    transactedAt: string;
  } | null;
}

interface PocketsResponse {
  pockets: Pocket[];
  pendingRuns: PendingRun[];
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
  const [saving, setSaving] = useState(false);
  const [pocketForm, setPocketForm] = useState({
    name: "",
    description: "",
    targetAmount: "",
  });
  const [ruleForm, setRuleForm] = useState({
    pocketId: "",
    percentOfIncome: "",
    priority: "",
    name: "",
  });

  const { data, initialLoading, refresh } = useCachedFetch<PocketsResponse>(
    useMemo(() => "/api/finance/pockets", []),
    { ttl: 30_000 }
  );

  const createPocket = async () => {
    if (!pocketForm.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/pockets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pocketForm.name,
          description: pocketForm.description || null,
          targetAmount: pocketForm.targetAmount ? Number(pocketForm.targetAmount) : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to create pocket");
      toast.success(`Added ${pocketForm.name}`);
      setPocketForm({ name: "", description: "", targetAmount: "" });
      invalidateCache("/api/finance/pockets");
      invalidateCache("/api/finance/summary");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create pocket");
    } finally {
      setSaving(false);
    }
  };

  const createRule = async () => {
    if (!ruleForm.pocketId || !ruleForm.percentOfIncome) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/paycheck-allocation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pocketId: ruleForm.pocketId,
          percentOfIncome: Number(ruleForm.percentOfIncome),
          priority: ruleForm.priority ? Number(ruleForm.priority) : 0,
          name: ruleForm.name || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to create allocation rule");
      toast.success("Added paycheck allocation rule");
      setRuleForm({ pocketId: "", percentOfIncome: "", priority: "", name: "" });
      invalidateCache("/api/finance/pockets");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create allocation rule");
    } finally {
      setSaving(false);
    }
  };

  const confirmRun = async (runId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/paycheck-allocation-runs/${runId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to confirm allocation");
      toast.success("Pocket allocations confirmed");
      invalidateCache("/api/finance/pockets");
      invalidateCache("/api/finance/summary");
      invalidateCache("/api/finance/transactions");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to confirm allocation");
    } finally {
      setSaving(false);
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
            Set aside paycheck percentages into bolsillos without counting those moves as spending.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-emerald-400" />
              <p className="text-sm font-semibold">Add Pocket</p>
            </div>
            <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Emergency fund, taxes, travel, etc." value={pocketForm.name} onChange={(event) => setPocketForm((current) => ({ ...current, name: event.target.value }))} />
            <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Description (optional)" value={pocketForm.description} onChange={(event) => setPocketForm((current) => ({ ...current, description: event.target.value }))} />
            <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" type="number" placeholder="Target amount (optional)" value={pocketForm.targetAmount} onChange={(event) => setPocketForm((current) => ({ ...current, targetAmount: event.target.value }))} />
            <Button onClick={createPocket} disabled={saving || !pocketForm.name}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Add Pocket"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-cyan-400" />
              <p className="text-sm font-semibold">Paycheck Allocation Rule</p>
            </div>
            <select className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" value={ruleForm.pocketId} onChange={(event) => setRuleForm((current) => ({ ...current, pocketId: event.target.value }))}>
              <option value="">Choose pocket</option>
              {(data?.pockets || []).map((pocket) => (
                <option key={pocket.id} value={pocket.id}>{pocket.name}</option>
              ))}
            </select>
            <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Rule label (optional)" value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" type="number" placeholder="% of paycheck" value={ruleForm.percentOfIncome} onChange={(event) => setRuleForm((current) => ({ ...current, percentOfIncome: event.target.value }))} />
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" type="number" placeholder="Priority order" value={ruleForm.priority} onChange={(event) => setRuleForm((current) => ({ ...current, priority: event.target.value }))} />
            </div>
            <Button onClick={createRule} disabled={saving || !ruleForm.pocketId || !ruleForm.percentOfIncome}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Allocation Rule
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm font-semibold">Pending Paycheck Prompts</p>
          {initialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data?.pendingRuns?.length ? (
            <div className="space-y-3">
              {data.pendingRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-border/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{run.sourceTransaction?.description || "Manual income"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {run.sourceTransaction?.transactedAt ? new Date(run.sourceTransaction.transactedAt).toLocaleDateString() : "New paycheck"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatCOP(run.grossAmount)}</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(run.suggestedAllocations || []).map((allocation, index) => {
                      const pocket = data.pockets.find((item) => item.id === allocation.pocketId);
                      return (
                        <div key={`${run.id}:${allocation.pocketId}:${index}`} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pocket?.name || "Pocket"} - {allocation.percentOfIncome}% suggested</span>
                          <span>{formatCOP(allocation.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Button className="mt-3" size="sm" variant="outline" disabled={saving} onClick={() => confirmRun(run.id)}>
                    Confirm Allocation
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No pending paycheck allocation prompts right now.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm font-semibold">Pocket Balances</p>
          {initialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data?.pockets?.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.pockets.map((pocket) => (
                <div key={pocket.id} className="rounded-2xl border border-border/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{pocket.name}</p>
                      {pocket.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{pocket.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCOP(pocket.currentBalance)}</p>
                      {pocket.targetAmount ? (
                        <p className="text-[11px] text-muted-foreground">target {formatCOP(pocket.targetAmount)}</p>
                      ) : null}
                    </div>
                  </div>
                  {pocket.allocationRules.length > 0 && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {pocket.allocationRules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between">
                          <span>{rule.name || "Paycheck rule"} - priority {rule.priority}</span>
                          <span>{rule.percentOfIncome}% </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add your first bolsillo to start reserving income outside the expense budget.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
