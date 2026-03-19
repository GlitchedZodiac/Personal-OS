"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Plus, Repeat, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateCache, useCachedFetch } from "@/lib/cache";
import { FINANCE_CATEGORIES } from "@/lib/finance/constants";

interface Account {
  id: string;
  name: string;
}

interface Obligation {
  id: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  subcategory?: string | null;
  frequency: string;
  dueDay?: number | null;
  defaultAccountId?: string | null;
  notes?: string | null;
  active: boolean;
}

interface Occurrence {
  id: string;
  dueDate: string;
  expectedAmount: number;
  status: string;
  paidAt?: string | null;
  transactionId?: string | null;
  obligation: {
    id: string;
    name: string;
    category: string;
    subcategory?: string | null;
    currency: string;
  };
}

interface ObligationsResponse {
  obligations: Obligation[];
  occurrences: Occurrence[];
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FinanceObligationsPage() {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    currency: "COP",
    category: "housing",
    subcategory: "",
    frequency: "monthly",
    dueDay: "",
    defaultAccountId: "",
    notes: "",
  });

  const { data, initialLoading, refresh } = useCachedFetch<ObligationsResponse>(
    useMemo(() => "/api/finance/obligations", []),
    { ttl: 30_000 }
  );
  const { data: accountsData } = useCachedFetch<{ accounts: Account[] }>(
    useMemo(() => "/api/finance/accounts", []),
    { ttl: 60_000 }
  );

  const createObligation = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          dueDay: form.dueDay ? Number(form.dueDay) : null,
          defaultAccountId: form.defaultAccountId || null,
          subcategory: form.subcategory || null,
          notes: form.notes || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to create obligation");

      toast.success(`Added ${form.name}`);
      setForm({
        name: "",
        amount: "",
        currency: "COP",
        category: "housing",
        subcategory: "",
        frequency: "monthly",
        dueDay: "",
        defaultAccountId: "",
        notes: "",
      });
      invalidateCache("/api/finance/obligations");
      invalidateCache("/api/finance/summary");
      invalidateCache("/api/finance/upcoming-payments");
      invalidateCache("/api/finance/budgets");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create obligation");
    } finally {
      setSaving(false);
    }
  };

  const checkOffOccurrence = async (occurrenceId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/obligations/${occurrenceId}/checkoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to mark obligation paid");
      toast.success("Marked obligation as paid and posted the expense");
      invalidateCache("/api/finance/obligations");
      invalidateCache("/api/finance/summary");
      invalidateCache("/api/finance/upcoming-payments");
      invalidateCache("/api/finance/transactions");
      invalidateCache("/api/finance/budgets");
      refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to mark obligation paid");
    } finally {
      setSaving(false);
    }
  };

  const activeObligations = data?.obligations.filter((item) => item.active) || [];
  const dueOccurrences = data?.occurrences.filter((item) => ["due", "overdue"].includes(item.status)) || [];

  return (
    <div className="space-y-4 px-4 pb-36 pt-12 lg:pb-8">
      <div className="flex items-center gap-3">
        <Link href="/finances">
          <button className="rounded-xl p-2 transition-colors hover:bg-secondary/50">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Obligations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track rent, tithing, and any recurring commitment that won&apos;t reliably arrive by email.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-400" />
              <p className="text-sm font-semibold">Add Scheduled Obligation</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Rent, tithing, studio, etc." value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" type="number" placeholder="Amount" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
              <select className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {FINANCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category.replace(/_/g, " ")}</option>
                ))}
              </select>
              <select className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" value={form.frequency} onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value }))}>
                <option value="monthly">monthly</option>
                <option value="biweekly">biweekly</option>
                <option value="weekly">weekly</option>
                <option value="yearly">yearly</option>
              </select>
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Subcategory (optional)" value={form.subcategory} onChange={(event) => setForm((current) => ({ ...current, subcategory: event.target.value }))} />
              <input className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm" type="number" min="1" max="31" placeholder="Due day" value={form.dueDay} onChange={(event) => setForm((current) => ({ ...current, dueDay: event.target.value }))} />
              <select className="rounded-xl border border-border/40 bg-background px-3 py-2 text-sm md:col-span-2" value={form.defaultAccountId} onChange={(event) => setForm((current) => ({ ...current, defaultAccountId: event.target.value }))}>
                <option value="">Use finance inbox fallback account</option>
                {(accountsData?.accounts || []).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
            <textarea className="min-h-[88px] w-full rounded-2xl border border-border/40 bg-background px-3 py-2 text-sm" placeholder="Notes or instructions" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <Button onClick={createObligation} disabled={saving || !form.name || !form.amount}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Add Obligation"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-cyan-400" />
              <p className="text-sm font-semibold">Due This Cycle</p>
            </div>
            {initialLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : dueOccurrences.length > 0 ? (
              <div className="space-y-3">
                {dueOccurrences.slice(0, 8).map((occurrence) => (
                  <div key={occurrence.id} className="rounded-2xl border border-border/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{occurrence.obligation.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {new Date(occurrence.dueDate).toLocaleDateString()} - {occurrence.status}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">{formatCOP(occurrence.expectedAmount)}</p>
                    </div>
                    <Button className="mt-3" size="sm" variant="outline" disabled={saving || Boolean(occurrence.transactionId)} onClick={() => checkOffOccurrence(occurrence.id)}>
                      {occurrence.transactionId ? "Already posted" : "Mark Paid"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No due obligations right now.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold">Active Obligations</p>
          </div>
          {initialLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : activeObligations.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {activeObligations.map((obligation) => (
                <div key={obligation.id} className="rounded-2xl border border-border/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{obligation.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {obligation.frequency} - {obligation.category.replace(/_/g, " ")}
                        {obligation.dueDay ? ` - due day ${obligation.dueDay}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatCOP(obligation.amount)}</p>
                  </div>
                  {obligation.notes && (
                    <p className="mt-2 text-xs text-muted-foreground">{obligation.notes}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add your first manual obligation to start planning bills outside Gmail.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 text-cyan-400" />
          Checking off an occurrence posts the real expense transaction for that month, so your budgets and reports stay aligned with what you actually paid.
        </CardContent>
      </Card>
    </div>
  );
}
