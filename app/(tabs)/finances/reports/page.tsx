"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedFetch } from "@/lib/cache";

interface FinanceReportsData {
  monthLabel: string;
  pendingReviews: number;
  topMerchants: Array<{
    id: string;
    name: string;
    totalSpent: number;
    shareOfSpend: number;
  }>;
  budgetRisk: Array<{
    category: string;
    planned: number;
    actual: number;
    remaining: number;
    percentUsed: number;
    status: "on_track" | "warning" | "off_track";
  }>;
  possibleSavings: Array<{
    category: string;
    planned: number;
    actual: number;
    remaining: number;
    percentUsed: number;
    status: "on_track" | "warning" | "off_track";
  }>;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function FinanceReportsPage() {
  const { data, initialLoading } = useCachedFetch<FinanceReportsData>(
    useMemo(() => "/api/finance/reports", []),
    { ttl: 60_000 }
  );

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Merchant concentration, budget pressure, and likely places to save.
        </p>
      </div>

      {initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{data?.monthLabel}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.pendingReviews || 0} pending finance review item(s)
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {(data?.topMerchants || []).slice(0, 4).map((merchant) => (
                  <div key={merchant.id} className="rounded-2xl border border-border/30 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{merchant.name}</p>
                      <p className="text-sm font-semibold">{formatCOP(merchant.totalSpent)}</p>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary/50">
                      <div
                        className="h-1.5 rounded-full bg-cyan-500/70"
                        style={{ width: `${Math.min(merchant.shareOfSpend, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm font-semibold">Budget Pressure</p>
                {(data?.budgetRisk || []).map((risk) => (
                  <div key={risk.category} className="rounded-2xl border border-border/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium capitalize">{risk.category}</p>
                      <p
                        className={`text-xs font-medium ${
                          risk.status === "off_track"
                            ? "text-red-400"
                            : risk.status === "warning"
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {risk.percentUsed}% used
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Planned {formatCOP(risk.planned)} · Actual {formatCOP(risk.actual)} · Remaining {formatCOP(risk.remaining)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm font-semibold">Possible Savings</p>
                {(data?.possibleSavings || []).map((item) => (
                  <div key={item.category} className="rounded-2xl border border-border/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium capitalize">{item.category}</p>
                      <p className="text-sm font-semibold">{formatCOP(item.actual)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      You have {formatCOP(item.remaining)} of budget room left here.
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
