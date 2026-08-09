"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ExternalLink, Loader2, RefreshCw } from "lucide-react";

type Status = {
  ai: { ok: boolean; kind: string | null; detail: string; latencyMs: number | null };
  db: { ok: boolean; detail: string; latencyMs: number | null };
  models: { chat: string; coach: string; transcribe: string };
  spend: {
    todayUsd: number;
    todayCalls: number;
    last30dUsd: number;
    last30dCalls: number;
  } | null;
  billingUrl: string;
  checkedAt: string;
};

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-green-400" : "bg-red-400 animate-pulse"
      }`}
    />
  );
}

function usd(n: number) {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}

export function AIStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/status");
      setStatus(await res.json());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-400" />
            AI &amp; System Status
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={check}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1">Test</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status && !loading && (
          <p className="text-xs text-red-400">
            Couldn&apos;t reach the app server. Check your connection.
          </p>
        )}
        {status && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Dot ok={status.ai.ok} /> OpenAI
                </span>
                <span className="text-xs text-muted-foreground">
                  {status.ai.ok
                    ? `Connected · ${status.ai.latencyMs}ms`
                    : status.ai.detail}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Dot ok={status.db.ok} /> Database
                </span>
                <span className="text-xs text-muted-foreground">
                  {status.db.ok
                    ? `Connected · ${status.db.latencyMs}ms`
                    : status.db.detail}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Everyday model</span>
                <span className="font-mono">{status.models.chat}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coach model</span>
                <span className="font-mono">{status.models.coach}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Voice</span>
                <span className="font-mono">{status.models.transcribe}</span>
              </div>
            </div>

            {status.spend && (
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">AI spend (metered locally)</p>
                  <p className="text-sm font-semibold">
                    {usd(status.spend.todayUsd)} today
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      · {usd(status.spend.last30dUsd)} last 30d ·{" "}
                      {status.spend.last30dCalls} calls
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-white/5 pt-2">
              <p className="text-[10px] text-muted-foreground max-w-[60%]">
                OpenAI doesn&apos;t expose remaining balance to apps — spend is
                estimated from per-call tokens at published rates.
              </p>
              <a
                href={status.billingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-300 hover:underline shrink-0"
              >
                Top up <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
