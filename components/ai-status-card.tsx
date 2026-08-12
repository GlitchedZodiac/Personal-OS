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

type RealSpend = {
  available: boolean;
  adminKeyConnected?: boolean;
  monthSpendUsd?: number;
  monthStart?: string;
  message?: string;
};

export function AIStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [realSpend, setRealSpend] = useState<RealSpend | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/status");
      setStatus(await res.json());
      const bal = await fetch("/api/ai/balance");
      setRealSpend(await bal.json());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const connectKey = useCallback(async () => {
    setConnecting(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/ai/admin-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyDraft.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setKeyError(body.error ?? "Couldn't connect the key");
      } else {
        setKeyDraft("");
        await check();
      }
    } finally {
      setConnecting(false);
    }
  }, [keyDraft, check]);

  const disconnectKey = useCallback(async () => {
    await fetch("/api/ai/admin-key", { method: "DELETE" });
    await check();
  }, [check]);

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

            {/* Real spend via the org admin key (write-only integration) */}
            {realSpend?.available && realSpend.monthSpendUsd != null ? (
              <div className="flex items-end justify-between rounded-lg bg-secondary/50 px-3 py-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    OpenAI real spend · since {realSpend.monthStart}
                  </p>
                  <p className="text-sm font-semibold">{usd(realSpend.monthSpendUsd)}</p>
                </div>
                <button
                  onClick={disconnectKey}
                  className="text-[10px] text-muted-foreground hover:underline"
                >
                  disconnect key
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 border-t border-white/5 pt-2">
                <p className="text-[10px] text-muted-foreground">
                  {realSpend?.adminKeyConnected
                    ? String((realSpend as { message?: string }).message ?? "Admin key issue — reconnect below.")
                    : "Spend above is estimated. For REAL month-to-date costs, paste an org ADMIN key (platform.openai.com → Settings → Organization → Admin keys). Stored write-only in your database, never shown again."}
                </p>
                <div className="flex gap-1.5">
                  <input
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder="sk-admin-…"
                    type="password"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={connecting || keyDraft.trim().length < 20}
                    onClick={connectKey}
                  >
                    {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Connect"}
                  </Button>
                </div>
                {keyError && <p className="text-[10px] text-red-400">{keyError}</p>}
              </div>
            )}

            <div className="flex items-center justify-end border-t border-white/5 pt-2">
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
