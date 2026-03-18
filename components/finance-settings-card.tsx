"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppSettings } from "@/lib/settings";

interface FinanceSettingsCardProps {
  settings: AppSettings;
  updateSettings: (updater: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
}

interface GoogleStatus {
  connected: boolean;
  configured?: boolean;
  oauthConfigured?: boolean;
  vaultConfigured?: boolean;
  setupMessage?: string | null;
  email?: string;
  syncStatus?: string;
  lastSyncAt?: string;
  lastBackfillAt?: string;
  lastError?: string;
  syncIntervalMinutes?: number;
  syncLookbackMonths?: number;
}

export function FinanceSettingsCard({
  settings,
  updateSettings,
}: FinanceSettingsCardProps) {
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/google/status");
      const data = await res.json();
      setGoogleStatus(data);
    } catch {
      setGoogleStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get("finance_google") === "connected") {
      toast.success("Gmail connected for finance sync");
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("finance_google") === "error") {
      toast.error(`Finance Gmail error: ${params.get("message") || "unknown"}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const connect = () => {
    window.location.href = "/api/finance/google/auth";
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Gmail from the finance module?")) return;
    const res = await fetch("/api/finance/google/status", { method: "DELETE" });
    if (res.ok) {
      toast.success("Gmail disconnected");
      fetchStatus();
    } else {
      toast.error("Failed to disconnect Gmail");
    }
  };

  const sync = async (fullRescan = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/finance/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullRescan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(`Gmail sync complete: ${data.transactions} transaction(s) processed`);
      fetchStatus();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Card className="border-emerald-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-500" />
            Finance Defaults
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Control how inbox sync, review, and receipt flows behave.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Input
                value={settings.finance.defaultCurrency}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    finance: { ...settings.finance, defaultCurrency: event.target.value.toUpperCase() || "COP" },
                  })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Sync Minutes</Label>
              <Input
                type="number"
                value={settings.finance.syncIntervalMinutes}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    finance: {
                      ...settings.finance,
                      syncIntervalMinutes: Math.max(5, parseInt(event.target.value || "15", 10)),
                    },
                  })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Gmail Lookback Months</Label>
              <Input
                type="number"
                value={settings.finance.gmailLookbackMonths}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    finance: {
                      ...settings.finance,
                      gmailLookbackMonths: Math.max(1, parseInt(event.target.value || "12", 10)),
                    },
                  })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Review Threshold</Label>
              <Input
                type="number"
                step="0.05"
                value={settings.finance.autoReviewThreshold}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    finance: {
                      ...settings.finance,
                      autoReviewThreshold: Math.min(1, Math.max(0.1, parseFloat(event.target.value || "0.75"))),
                    },
                  })
                }
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={settings.finance.receiptRequireReview}
              onChange={(event) =>
                updateSettings({
                  ...settings,
                  finance: {
                    ...settings.finance,
                    receiptRequireReview: event.target.checked,
                  },
                })
              }
            />
            Require review for receipt imports
          </label>
        </CardContent>
      </Card>

      <Card className="border-blue-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-400" />
            Gmail Expense Sync
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Direct inbox monitoring for receipts, statements, refunds, and bill notices.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking Gmail connection...
            </div>
          ) : googleStatus?.connected ? (
            <>
              <div className="rounded-2xl border border-border/30 p-3">
                <p className="text-sm font-medium">{googleStatus.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Status: {googleStatus.syncStatus}
                  {googleStatus.lastSyncAt ? ` · Last sync ${new Date(googleStatus.lastSyncAt).toLocaleString()}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Every {googleStatus.syncIntervalMinutes ?? settings.finance.syncIntervalMinutes} min
                  {" · "}
                  Lookback {googleStatus.syncLookbackMonths ?? settings.finance.gmailLookbackMonths} month(s)
                </p>
                {googleStatus.lastError && (
                  <p className="text-xs text-red-400 mt-2">{googleStatus.lastError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => sync(false)} disabled={syncing} className="flex-1">
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Sync Now
                </Button>
                <Button onClick={() => sync(true)} disabled={syncing} variant="outline">
                  Full Re-scan
                </Button>
              </div>
              <Button onClick={disconnect} variant="ghost" size="sm" className="w-full text-muted-foreground">
                <Unplug className="h-3 w-3 mr-1.5" />
                Disconnect Gmail
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Connect Gmail so finance can monitor purchase receipts, bills, statements, refunds, and attachment-based payment notices.
              </p>
              {googleStatus?.setupMessage && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                  <p className="font-medium text-amber-300">Setup needed before Gmail connect</p>
                  <p className="mt-1">{googleStatus.setupMessage}</p>
                  <p className="mt-2 text-amber-200/80">
                    Required server env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FINANCE_VAULT_MASTER_KEY
                  </p>
                </div>
              )}
              <Button
                onClick={connect}
                className="w-full"
                disabled={googleStatus?.configured === false}
              >
                Connect Gmail
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-cyan-500" />
            Finance AI Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.aiInstructions.finance || ""}
            onChange={(event) =>
              updateSettings({
                ...settings,
                aiInstructions: {
                  ...settings.aiInstructions,
                  finance: event.target.value,
                },
              })
            }
            placeholder="e.g. Classify coffee shops as dining_out, flag tax-deductible business expenses, and keep finance advice concise."
            rows={4}
          />
        </CardContent>
      </Card>
    </>
  );
}
