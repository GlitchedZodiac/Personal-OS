"use client";

// The one connector setting (2026-10, audit SEC-011 / PLAN D3): may Claude
// read finance data through the connector? Off by default. Self-contained on
// purpose — Settings is being restyled by another lane; this drops in as one
// line and carries its own state, fetches and copy.

import { useEffect, useState } from "react";
import { toast } from "sonner";

export function McpFinanceToggle() {
  const [allow, setAllow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/health/mcp-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setAllow(Boolean(body?.allowFinance)))
      .catch(() => setAllow(false));
  }, []);

  const flip = async (next: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/health/mcp-token", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowFinance: next }),
      });
      if (!res.ok) throw new Error("save failed");
      setAllow(next);
      toast.success(next ? "Claude can read finance data" : "Finance data is off for Claude");
    } catch {
      toast.error("Couldn't save that — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-[16px] bg-card p-4">
      <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground">WHAT CLAUDE MAY READ</p>
      <label className="mt-2 flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[#232227]"
          checked={allow === true}
          disabled={allow === null || busy}
          onChange={(e) => flip(e.target.checked)}
          aria-describedby="mcp-finance-help"
        />
        <span>
          <span className="block text-[13px] font-semibold text-foreground">Allow finance over MCP</span>
          <span id="mcp-finance-help" className="mt-0.5 block text-[12px] leading-[1.6] text-muted-foreground">
            Accounts, transactions, budgets, pockets and obligations. Off, Claude gets a clear
            &ldquo;finance is off&rdquo; answer instead of the numbers. Health, training, spirit and
            journal are always readable.
          </span>
        </span>
      </label>
    </div>
  );
}
