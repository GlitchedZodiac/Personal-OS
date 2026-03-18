"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedFetch } from "@/lib/cache";

interface Merchant {
  id: string;
  name: string;
  totalSpent: number;
  totalTax: number;
  totalTip: number;
  transactionCount: number;
  transactions: Array<{
    id: string;
    description: string;
    amount: number;
    category: string;
    transactedAt: string;
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

export default function FinanceMerchantsPage() {
  const { data, initialLoading } = useCachedFetch<{ merchants: Merchant[] }>(
    useMemo(() => "/api/finance/merchants", []),
    { ttl: 60_000 }
  );

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Merchants</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track who you buy from most often and where tax/tip costs are building up.
        </p>
      </div>

      {initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(data?.merchants || []).map((merchant) => (
            <Card key={merchant.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{merchant.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {merchant.transactionCount} transactions · Tax {formatCOP(merchant.totalTax)} · Tip {formatCOP(merchant.totalTip)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-emerald-400">{formatCOP(merchant.totalSpent)}</p>
                </div>

                <div className="space-y-2">
                  {merchant.transactions.map((tx) => (
                    <div key={tx.id} className="rounded-2xl border border-border/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <p className="text-sm font-semibold">{formatCOP(Math.abs(tx.amount))}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {tx.category} · {new Date(tx.transactedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
