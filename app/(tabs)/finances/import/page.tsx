"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Upload,
  FileText,
  Bot,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface Account {
  id: string;
  name: string;
  accountType: string;
}

interface ImportResult {
  imported: number;
  transactions: Array<{
    transactedAt: string;
    amount: number;
    description: string;
    category: string;
    type: string;
  }>;
  netAmount: number;
}

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [csvText, setCsvText] = useState("");
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((data) => {
        const accts = data.accounts || [];
        setAccounts(accts);
        if (accts.length > 0) setSelectedAccount(accts[0].id);
      })
      .catch(console.error);
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        setCsvText(ev.target?.result as string);
      };
      reader.readAsText(file);
    },
    []
  );

  const handleImport = async () => {
    if (!csvText || !selectedAccount) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/finance/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          accountId: selectedAccount,
          useAI,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finances">
          <button className="p-2 -ml-2 rounded-xl hover:bg-secondary/50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-purple-400" />
            Import Transactions
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Import from Bancolombia CSV export or paste data
          </p>
        </div>
      </div>

      {/* Instructions */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium">How to export from Bancolombia:</p>
          <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Log into Bancolombia Sucursal Virtual</li>
            <li>Go to &quot;Movimientos&quot; or &quot;Extractos&quot;</li>
            <li>Select the account and date range</li>
            <li>Download as CSV or Excel</li>
            <li>Upload the file below or paste the content</li>
          </ol>
        </CardContent>
      </Card>

      {/* Account Selector */}
      {accounts.length > 0 ? (
        <div className="space-y-1">
          <label className="text-xs font-medium">Target Account</label>
          <select
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm"
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.accountType.replace("_", " ")})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Card className="border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-400">
              No accounts found. Please{" "}
              <Link href="/finances" className="underline">
                add an account
              </Link>{" "}
              first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* File Upload */}
      <div className="space-y-2">
        <label className="text-xs font-medium">Upload CSV File</label>
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-purple-500/30 rounded-xl cursor-pointer hover:bg-purple-500/5 transition-colors">
          <FileText className="h-6 w-6 text-purple-400 mb-1" />
          <span className="text-[10px] text-muted-foreground">
            Click to upload CSV or Excel file
          </span>
          <input
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Or paste text */}
      <div className="space-y-1">
        <label className="text-xs font-medium">Or Paste Transaction Data</label>
        <textarea
          className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs min-h-[120px] placeholder:text-muted-foreground/50 font-mono"
          placeholder={"Fecha,Descripción,Monto\n2026-02-15,Éxito Groceries,-85000\n2026-02-14,Nómina,+5000000"}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
      </div>

      {/* AI Categorization Toggle */}
      <label className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          checked={useAI}
          onChange={(e) => setUseAI(e.target.checked)}
          className="rounded"
        />
        <div className="flex-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
            AI Smart Categorization
          </p>
          <p className="text-[10px] text-muted-foreground">
            Uses GPT-5.2 to categorize transactions automatically (slower but more accurate)
          </p>
        </div>
      </label>

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={loading || !csvText || !selectedAccount}
        className="w-full py-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {useAI ? "AI is processing..." : "Importing..."}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Import Transactions
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <p className="text-xs font-medium text-emerald-400">
                Successfully imported {result.imported} transactions
              </p>
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {result.transactions.slice(0, 20).map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1 text-[10px]"
                >
                  <span className="truncate flex-1">{tx.description}</span>
                  <span className="text-muted-foreground mx-2">{tx.category}</span>
                  <span
                    className={cn(
                      "font-medium",
                      tx.type === "income" ? "text-green-400" : "text-foreground"
                    )}
                  >
                    {new Intl.NumberFormat("es-CO", {
                      style: "currency",
                      currency: "COP",
                      minimumFractionDigits: 0,
                    }).format(tx.amount)}
                  </span>
                </div>
              ))}
              {result.transactions.length > 20 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1">
                  ...and {result.transactions.length - 20} more
                </p>
              )}
            </div>
            <Link href="/finances/transactions">
              <button className="w-full text-xs py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                View Transactions →
              </button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
