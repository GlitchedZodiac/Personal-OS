"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  X,
  Check,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface Transaction {
  id: string;
  accountId: string;
  transactedAt: string;
  amount: number;
  description: string;
  category: string;
  subcategory?: string;
  type: string;
  isRecurring: boolean;
  merchant?: string;
  notes?: string;
  source: string;
  tags?: string;
  account: { name: string; icon?: string; color?: string };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatCOP(amount: number, short = false): string {
  if (short && Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const CATEGORIES = [
  "food",
  "dining_out",
  "transport",
  "housing",
  "entertainment",
  "health",
  "education",
  "shopping",
  "personal",
  "insurance",
  "debt_payment",
  "savings",
  "income",
  "transfer",
  "other",
];

const CATEGORY_ICONS: Record<string, string> = {
  food: "🛒",
  dining_out: "🍽️",
  transport: "🚗",
  housing: "🏠",
  entertainment: "🎬",
  health: "💪",
  education: "📚",
  shopping: "🛍️",
  personal: "✨",
  insurance: "🛡️",
  debt_payment: "💳",
  savings: "🏦",
  income: "💰",
  transfer: "🔄",
  other: "📦",
};

// ─── Main Component ─────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ type?: string; category?: string; accountId?: string }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [range, setRange] = useState("30");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);

  // Check URL params for action=add
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "add") setShowAddForm(true);
    }
  }, []);

  // Fetch accounts
  useEffect(() => {
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []))
      .catch(console.error);
  }, []);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range });
      if (filter.type) params.set("type", filter.type);
      if (filter.category) params.set("category", filter.category);
      if (filter.accountId) params.set("accountId", filter.accountId);

      const res = await fetch(`/api/finance/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setIncome(data.income?.total || 0);
      setExpenses(data.expenses?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [range, filter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.merchant?.toLowerCase().includes(q) ||
        tx.account.name.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    for (const tx of filtered) {
      const date = format(new Date(tx.transactedAt), "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(tx);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this transaction?")) return;
      try {
        await fetch(`/api/finance/transactions?id=${id}`, { method: "DELETE" });
        fetchTransactions();
      } catch (e) {
        console.error(e);
      }
    },
    [fetchTransactions]
  );

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finances">
          <button className="p-2 -ml-2 rounded-xl hover:bg-secondary/50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Transactions</h1>
          <p className="text-[10px] text-muted-foreground">
            Last {range} days · {filtered.length} transactions
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Income / Expenses summary */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <div>
              <p className="text-[10px] text-muted-foreground">Income</p>
              <p className="text-sm font-bold text-green-400">{formatCOP(income, true)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <div>
              <p className="text-[10px] text-muted-foreground">Expenses</p>
              <p className="text-sm font-bold text-red-400">{formatCOP(expenses, true)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full bg-secondary/50 rounded-lg pl-9 pr-3 py-2 text-xs placeholder:text-muted-foreground/50"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "p-2 rounded-lg transition-colors",
            showFilters
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-secondary/50 text-muted-foreground"
          )}
        >
          <Filter className="h-4 w-4" />
        </button>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-secondary/50 rounded-lg px-2 text-xs"
        >
          <option value="7">7d</option>
          <option value="30">30d</option>
          <option value="90">90d</option>
          <option value="365">1y</option>
        </select>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground w-full">Type</span>
              {["all", "income", "expense", "transfer"].map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setFilter((p) => ({ ...p, type: t === "all" ? undefined : t }))
                  }
                  className={cn(
                    "text-[10px] px-2 py-1 rounded-full transition-colors",
                    (filter.type || "all") === (t === "all" ? undefined : t) ||
                      (!filter.type && t === "all")
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-secondary/50 text-muted-foreground"
                  )}
                >
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground w-full">Category</span>
              <button
                onClick={() => setFilter((p) => ({ ...p, category: undefined }))}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-full transition-colors",
                  !filter.category
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-secondary/50 text-muted-foreground"
                )}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setFilter((p) => ({ ...p, category: p.category === c ? undefined : c }))
                  }
                  className={cn(
                    "text-[10px] px-2 py-1 rounded-full transition-colors",
                    filter.category === c
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-secondary/50 text-muted-foreground"
                  )}
                >
                  {CATEGORY_ICONS[c]} {c.replace("_", " ")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Transaction Form */}
      {(showAddForm || editingTx) && (
        <TransactionForm
          accounts={accounts}
          transaction={editingTx}
          onClose={() => {
            setShowAddForm(false);
            setEditingTx(null);
          }}
          onSave={() => {
            setShowAddForm(false);
            setEditingTx(null);
            fetchTransactions();
          }}
        />
      )}

      {/* Transaction List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : grouped.length > 0 ? (
        <div className="space-y-4">
          {grouped.map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium text-muted-foreground">
                  {format(new Date(date + "T12:00:00"), "EEEE, MMM d")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatCOP(
                    txs.reduce((s, t) => s + t.amount, 0),
                    true
                  )}
                </p>
              </div>
              <div className="space-y-1">
                {txs.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-secondary/30 transition-colors group"
                  >
                    <span className="text-sm w-6 text-center">
                      {CATEGORY_ICONS[tx.category] || "📦"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{tx.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {tx.account.name}
                        {tx.isRecurring && " · 🔁"}
                        {tx.source !== "manual" && ` · ${tx.source}`}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        tx.type === "income" ? "text-green-400" : "text-foreground"
                      )}
                    >
                      {tx.type === "income" ? "+" : ""}
                      {formatCOP(tx.amount, true)}
                    </p>
                    <div className="hidden group-hover:flex gap-1">
                      <button
                        onClick={() => setEditingTx(tx)}
                        className="p-1 rounded hover:bg-secondary"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="p-1 rounded hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-muted-foreground">No transactions found</p>
          <p className="text-[10px] text-muted-foreground/60">
            Try adjusting your filters or add a new transaction
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Transaction Form ───────────────────────────────────────────────────

function TransactionForm({
  accounts,
  transaction,
  onClose,
  onSave,
}: {
  accounts: Account[];
  transaction: Transaction | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    accountId: transaction?.accountId || accounts[0]?.id || "",
    transactedAt: transaction
      ? format(new Date(transaction.transactedAt), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    amount: transaction ? String(Math.abs(transaction.amount)) : "",
    description: transaction?.description || "",
    category: transaction?.category || "other",
    type: transaction?.type || "expense",
    notes: transaction?.notes || "",
    isRecurring: transaction?.isRecurring || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.accountId || !form.description || !form.amount) return;
    setSaving(true);
    try {
      const method = transaction ? "PATCH" : "POST";
      const body = transaction
        ? { id: transaction.id, ...form, amount: parseFloat(form.amount) }
        : { ...form, amount: parseFloat(form.amount) };

      await fetch("/api/finance/transactions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-emerald-500/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            {transaction ? "Edit Transaction" : "New Transaction"}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Type selector */}
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5">
          {["expense", "income", "transfer"].map((t) => (
            <button
              key={t}
              onClick={() => setForm((p) => ({ ...p, type: t }))}
              className={cn(
                "flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all",
                form.type === t
                  ? t === "income"
                    ? "bg-green-500/20 text-green-400"
                    : t === "expense"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-blue-500/20 text-blue-400"
                  : "text-muted-foreground"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <input
          className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
          placeholder="Description (e.g. Éxito groceries)"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
            placeholder="Amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <input
            className="bg-secondary/50 rounded-lg px-3 py-2 text-sm"
            type="date"
            value={form.transactedAt}
            onChange={(e) => setForm((p) => ({ ...p, transactedAt: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            className="bg-secondary/50 rounded-lg px-3 py-2 text-xs"
            value={form.accountId}
            onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="bg-secondary/50 rounded-lg px-3 py-2 text-xs"
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_ICONS[c]} {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <input
          className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-xs placeholder:text-muted-foreground/50"
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.isRecurring}
            onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked }))}
            className="rounded"
          />
          Recurring transaction
        </label>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.description || !form.amount || !form.accountId}
            className="flex-1 text-xs py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? "Saving..." : transaction ? "Update" : "Add"}
          </button>
          <button
            onClick={onClose}
            className="text-xs py-2 px-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
