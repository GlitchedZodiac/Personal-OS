"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceQuickCapture } from "@/components/finance-quick-capture";
import { useCachedFetch, invalidateCache } from "@/lib/cache";

interface ReviewItem {
  id: string;
  kind: string;
  status: string;
  title: string;
  detail?: string | null;
  transaction?: {
    id: string;
    description: string;
    amount: number;
    category: string;
    merchant?: string | null;
    notes?: string | null;
    account: { name: string };
  } | null;
  document?: {
    id: string;
    sender?: string | null;
    filename?: string | null;
    status: string;
    passwordSecretKey?: string | null;
  } | null;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function FinanceInboxPage() {
  const [passwordByReview, setPasswordByReview] = useState<Record<string, string>>({});
  const { data, initialLoading, refresh } = useCachedFetch<{ items: ReviewItem[] }>(
    useMemo(() => "/api/finance/inbox?status=pending", []),
    { ttl: 20_000 }
  );

  const applyAction = async (reviewId: string, action: string, payload?: Record<string, unknown>) => {
    const res = await fetch("/api/finance/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, action, payload }),
    });

    if (res.ok) {
      invalidateCache("/api/finance/inbox?status=pending");
      invalidateCache("/api/finance/summary");
      refresh();
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 lg:pb-8 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Finance Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review uncertain imports, duplicates, refunds, and password-protected documents.
          </p>
        </div>
        <Badge variant="outline" className="hidden lg:inline-flex">
          {data?.items?.length || 0} pending
        </Badge>
      </div>

      <FinanceQuickCapture onSaved={refresh} compact />

      {initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : data?.items?.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <Badge variant="outline">{item.kind.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                  </div>
                </div>

                {item.transaction && (
                  <div className="rounded-2xl border border-border/40 p-3 text-sm space-y-1">
                    <p className="font-medium">{item.transaction.description}</p>
                    <p className="text-muted-foreground">
                      {formatCOP(Math.abs(item.transaction.amount))} · {item.transaction.category} · {item.transaction.account.name}
                    </p>
                  </div>
                )}

                {item.document?.status === "password_required" && (
                  <div className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      Password needed for {item.document.filename || "attachment"}.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={passwordByReview[item.id] || ""}
                        onChange={(event) =>
                          setPasswordByReview((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="Bank PDF password"
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          applyAction(item.id, "attach_password", {
                            password: passwordByReview[item.id],
                            passwordSecretKey: item.document?.passwordSecretKey,
                          })
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => applyAction(item.id, "confirm")}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "ignore")}>
                    Ignore
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "duplicate")}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "refund")}>
                    Refund
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "create_rule")}>
                    Learn Rule
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No finance review items right now.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
