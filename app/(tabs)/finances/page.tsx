"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedFetch } from "@/lib/cache";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Receipt,
  Target,
  Bot,
  ChevronRight,
  Banknote,
  BarChart3,
  Upload,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  accountType: string;
  balance: number;
  creditLimit?: number;
  institution?: string;
  icon?: string;
  color?: string;
  currency: string;
}

interface TransactionPreview {
  id: string;
  transactedAt: string;
  amount: number;
  description: string;
  category: string;
  type: string;
  account: { name: string; icon?: string };
}

interface RecurringTx {
  id: string;
  description: string;
  amount: number;
  type: string;
  frequency: string;
  category: string;
  nextDueDate: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  icon?: string;
  color?: string;
}

interface DailySpending {
  date: string;
  fullDate: string;
  amount: number;
}

interface FinanceSummary {
  accounts: Account[];
  overview: {
    netWorth: number;
    totalDebt: number;
    income: number;
    expenses: number;
    savings: number;
    todaySpent: number;
    todayTransactions: number;
  };
  comparison: {
    incomeChange: number;
    expenseChange: number;
  };
  budget: {
    totalBudgeted: number;
    totalSpent: number;
    remaining: number;
    percentUsed: number;
  };
  categoryBreakdown: Array<{ category: string; amount: number; count: number }>;
  recentTransactions: TransactionPreview[];
  recurringTransactions: RecurringTx[];
  savingsGoals: SavingsGoal[];
  dailySpending: DailySpending[];
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

const CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  food: { icon: "🛒", color: "bg-green-500/10 text-green-400" },
  dining_out: { icon: "🍽️", color: "bg-amber-500/10 text-amber-400" },
  transport: { icon: "🚗", color: "bg-purple-500/10 text-purple-400" },
  housing: { icon: "🏠", color: "bg-blue-500/10 text-blue-400" },
  entertainment: { icon: "🎬", color: "bg-pink-500/10 text-pink-400" },
  health: { icon: "💪", color: "bg-red-500/10 text-red-400" },
  education: { icon: "📚", color: "bg-teal-500/10 text-teal-400" },
  shopping: { icon: "🛍️", color: "bg-orange-500/10 text-orange-400" },
  personal: { icon: "✨", color: "bg-violet-500/10 text-violet-400" },
  insurance: { icon: "🛡️", color: "bg-slate-500/10 text-slate-400" },
  debt_payment: { icon: "💳", color: "bg-red-500/10 text-red-400" },
  savings: { icon: "🏦", color: "bg-emerald-500/10 text-emerald-400" },
  income: { icon: "💰", color: "bg-green-500/10 text-green-400" },
  transfer: { icon: "🔄", color: "bg-cyan-500/10 text-cyan-400" },
  other: { icon: "📦", color: "bg-gray-500/10 text-gray-400" },
};

const ACCOUNT_ICONS: Record<string, string> = {
  checking: "🏦",
  savings: "💰",
  credit_card: "💳",
  cash: "💵",
  investment: "📈",
  loan: "📋",
};

// ─── Main Component ─────────────────────────────────────────────────────

export default function FinancesPage() {
  const [tab, setTab] = useState<"overview" | "accounts" | "advisor">("overview");

  const summaryUrl = useMemo(() => "/api/finance/summary", []);
  const { data: summary, loading, initialLoading } = useCachedFetch<FinanceSummary>(
    summaryUrl,
    { ttl: 120_000 }
  );

  const empty = !summary || (summary.accounts.length === 0 && summary.recentTransactions.length === 0);

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            Finances
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "MMMM yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/finances/import">
            <button className="p-2 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
              <Upload className="h-4 w-4" />
            </button>
          </Link>
          <Link href="/finances/transactions?action=add">
            <button className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5">
        {[
          { key: "overview" as const, label: "Overview", icon: BarChart3 },
          { key: "accounts" as const, label: "Accounts", icon: CreditCard },
          { key: "advisor" as const, label: "AI Advisor", icon: Bot },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 text-xs font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1.5",
              tab === t.key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === "overview" && (
        <>
          {/* Net Worth Card */}
          <Card className="bg-gradient-to-br from-emerald-500/10 via-background to-background border-emerald-500/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Net Worth</span>
                {summary?.comparison && (
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                      (summary.overview.savings || 0) >= 0
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    )}
                  >
                    {(summary.overview.savings || 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {formatCOP(summary.overview.savings || 0, true)} this month
                  </span>
                )}
              </div>
              {initialLoading ? (
                <Skeleton className="h-8 w-40" />
              ) : (
                <p className="text-3xl font-bold tracking-tight">
                  {formatCOP(summary?.overview.netWorth || 0)}
                </p>
              )}

              {/* Income / Expense / Savings row */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
                <div>
                  <p className="text-[10px] text-muted-foreground">Income</p>
                  {initialLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <p className="text-sm font-semibold text-green-400">
                      {formatCOP(summary?.overview.income || 0, true)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Expenses</p>
                  {initialLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <p className="text-sm font-semibold text-red-400">
                      {formatCOP(summary?.overview.expenses || 0, true)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Debt</p>
                  {initialLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <p className="text-sm font-semibold text-amber-400">
                      {formatCOP(summary?.overview.totalDebt || 0, true)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget Progress */}
          {summary && summary.budget.totalBudgeted > 0 && (
            <Link href="/finances/budget">
              <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-blue-400" />
                      Monthly Budget
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {summary.budget.percentUsed}% used
                    </span>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        summary.budget.percentUsed > 100
                          ? "bg-red-500"
                          : summary.budget.percentUsed > 80
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )}
                      style={{
                        width: `${Math.min(summary.budget.percentUsed, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Spent: {formatCOP(summary.budget.totalSpent, true)}</span>
                    <span>Budget: {formatCOP(summary.budget.totalBudgeted, true)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Quick Links Grid */}
          <div className="grid grid-cols-4 gap-2">
            <Link href="/finances/transactions">
              <Card className="hover:bg-accent/50 transition-all cursor-pointer group tap-scale">
                <CardContent className="p-3 flex flex-col items-center gap-1.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                    <Receipt className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="text-[10px] font-medium">Transactions</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/finances/budget">
              <Card className="hover:bg-accent/50 transition-all cursor-pointer group tap-scale">
                <CardContent className="p-3 flex flex-col items-center gap-1.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    <Target className="h-4 w-4 text-emerald-500" />
                  </div>
                  <span className="text-[10px] font-medium">Budget</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/finances/goals">
              <Card className="hover:bg-accent/50 transition-all cursor-pointer group tap-scale">
                <CardContent className="p-3 flex flex-col items-center gap-1.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                    <PiggyBank className="h-4 w-4 text-amber-500" />
                  </div>
                  <span className="text-[10px] font-medium">Goals</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/finances/import">
              <Card className="hover:bg-accent/50 transition-all cursor-pointer group tap-scale">
                <CardContent className="p-3 flex flex-col items-center gap-1.5">
                  <div className="p-2 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                    <Upload className="h-4 w-4 text-purple-500" />
                  </div>
                  <span className="text-[10px] font-medium">Import</span>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* 7-Day Spending Chart */}
          {summary && summary.dailySpending.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                  Last 7 Days
                </span>
                <div className="flex items-end gap-1.5 h-20">
                  {summary.dailySpending.map((d, i) => {
                    const max = Math.max(...summary.dailySpending.map((s) => s.amount), 1);
                    const height = (d.amount / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-emerald-500/30 hover:bg-emerald-500/50 transition-colors relative group"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-background border rounded px-1 py-0.5 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {formatCOP(d.amount, true)}
                          </div>
                        </div>
                        <span className="text-[9px] text-muted-foreground">{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category Breakdown */}
          {summary && summary.categoryBreakdown.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <span className="text-xs font-medium">Spending by Category</span>
                <div className="space-y-2">
                  {summary.categoryBreakdown.slice(0, 6).map((cat) => {
                    const config = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG.other;
                    const total = summary.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
                    const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                    return (
                      <div key={cat.category} className="flex items-center gap-3">
                        <span className="text-sm w-6 text-center">{config.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="capitalize font-medium">{cat.category.replace("_", " ")}</span>
                            <span className="text-muted-foreground">{formatCOP(cat.amount, true)}</span>
                          </div>
                          <div className="w-full bg-secondary/50 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Transactions */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Recent Transactions</span>
                <Link
                  href="/finances/transactions"
                  className="text-[10px] text-emerald-400 flex items-center gap-0.5"
                >
                  See all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              {initialLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : summary && summary.recentTransactions.length > 0 ? (
                <div className="space-y-1">
                  {summary.recentTransactions.map((tx) => {
                    const config = CATEGORY_CONFIG[tx.category] || CATEGORY_CONFIG.other;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-secondary/30 transition-colors"
                      >
                        <div className={cn("p-1.5 rounded-lg text-sm", config.color)}>
                          {config.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {tx.description}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(tx.transactedAt), "MMM d")} · {tx.account.name}
                          </p>
                        </div>
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            tx.type === "income"
                              ? "text-green-400"
                              : "text-foreground"
                          )}
                        >
                          {tx.type === "income" ? "+" : ""}
                          {formatCOP(tx.amount, true)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 space-y-2">
                  <Banknote className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-xs text-muted-foreground">No transactions yet</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Add your first account and start logging
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Savings Goals */}
          {summary && summary.savingsGoals.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <PiggyBank className="h-3.5 w-3.5 text-amber-400" />
                    Savings Goals
                  </span>
                  <Link
                    href="/finances/goals"
                    className="text-[10px] text-emerald-400 flex items-center gap-0.5"
                  >
                    Manage <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {summary.savingsGoals.map((goal) => {
                    const pct = goal.targetAmount > 0
                      ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
                      : 0;
                    return (
                      <div key={goal.id} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">
                            {goal.icon || "🎯"} {goal.name}
                          </span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="w-full bg-secondary/50 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-amber-500/60"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{formatCOP(goal.currentAmount, true)}</span>
                          <span>{formatCOP(goal.targetAmount, true)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Recurring */}
          {summary && summary.recurringTransactions.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <span className="text-xs font-medium">Upcoming Bills</span>
                <div className="space-y-2">
                  {summary.recurringTransactions.slice(0, 5).map((rtx) => (
                    <div key={rtx.id} className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-xs font-medium">{rtx.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Due {format(new Date(rtx.nextDueDate), "MMM d")} · {rtx.frequency}
                        </p>
                      </div>
                      <p className={cn(
                        "text-xs font-semibold",
                        rtx.type === "income" ? "text-green-400" : "text-foreground"
                      )}>
                        {formatCOP(Math.abs(rtx.amount), true)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State: First-time setup */}
          {!initialLoading && empty && (
            <Card className="border-dashed border-emerald-500/30">
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Welcome to Finances</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start by adding your bank accounts, then log transactions manually or import from CSV.
                  </p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Link href="/finances/accounts">
                    <button className="text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                      Add Account
                    </button>
                  </Link>
                  <Link href="/finances/import">
                    <button className="text-xs px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                      Import CSV
                    </button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══ ACCOUNTS TAB ═══ */}
      {tab === "accounts" && <AccountsTab summary={summary} loading={initialLoading} />}

      {/* ═══ AI ADVISOR TAB ═══ */}
      {tab === "advisor" && <AIAdvisorTab />}
    </div>
  );
}

// ─── Accounts Tab ───────────────────────────────────────────────────────

function AccountsTab({
  summary,
  loading,
}: {
  summary: FinanceSummary | null;
  loading: boolean;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    accountType: "checking",
    institution: "",
    balance: "",
    creditLimit: "",
    interestRate: "",
    currency: "COP",
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!formData.name) return;
    setSaving(true);
    try {
      await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          balance: parseFloat(formData.balance) || 0,
          creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : undefined,
          interestRate: formData.interestRate ? parseFloat(formData.interestRate) : undefined,
        }),
      });
      setShowAddForm(false);
      setFormData({
        name: "",
        accountType: "checking",
        institution: "",
        balance: "",
        creditLimit: "",
        interestRate: "",
        currency: "COP",
      });
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [formData]);

  const accounts = summary?.accounts || [];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Total Assets</p>
            {loading ? (
              <Skeleton className="h-5 w-20 mt-1" />
            ) : (
              <p className="text-sm font-bold text-green-400">
                {formatCOP(
                  accounts
                    .filter((a) => a.accountType !== "credit_card" && a.accountType !== "loan")
                    .reduce((s, a) => s + a.balance, 0),
                  true
                )}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Total Debt</p>
            {loading ? (
              <Skeleton className="h-5 w-20 mt-1" />
            ) : (
              <p className="text-sm font-bold text-red-400">
                {formatCOP(
                  accounts
                    .filter((a) => a.accountType === "credit_card" || a.accountType === "loan")
                    .reduce((s, a) => s + Math.abs(a.balance), 0),
                  true
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <Card key={acc.id} className="hover:bg-accent/30 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{
                    backgroundColor: acc.color ? `${acc.color}20` : "rgba(16,185,129,0.1)",
                  }}
                >
                  {acc.icon || ACCOUNT_ICONS[acc.accountType] || "🏦"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{acc.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {acc.institution || acc.accountType.replace("_", " ")}
                    {acc.creditLimit ? ` · Limit: ${formatCOP(acc.creditLimit, true)}` : ""}
                  </p>
                </div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    acc.balance >= 0 ? "text-foreground" : "text-red-400"
                  )}
                >
                  {formatCOP(acc.balance, true)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Add Account */}
      {showAddForm ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <span className="text-xs font-medium">New Account</span>
            <input
              className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
              placeholder="Account name (e.g. Bancolombia Savings)"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="bg-secondary/50 rounded-lg px-3 py-2 text-sm"
                value={formData.accountType}
                onChange={(e) => setFormData((p) => ({ ...p, accountType: e.target.value }))}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit Card</option>
                <option value="cash">Cash</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
              </select>
              <input
                className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
                placeholder="Institution"
                value={formData.institution}
                onChange={(e) => setFormData((p) => ({ ...p, institution: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
                placeholder="Current balance"
                type="number"
                value={formData.balance}
                onChange={(e) => setFormData((p) => ({ ...p, balance: e.target.value }))}
              />
              {(formData.accountType === "credit_card" || formData.accountType === "loan") && (
                <input
                  className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
                  placeholder="Interest rate %"
                  type="number"
                  value={formData.interestRate}
                  onChange={(e) => setFormData((p) => ({ ...p, interestRate: e.target.value }))}
                />
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !formData.name}
                className="flex-1 text-xs py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Account"}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-xs py-2 px-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 rounded-xl border border-dashed border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/5 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Account
        </button>
      )}
    </div>
  );
}

// ─── AI Advisor Tab ─────────────────────────────────────────────────────

function AIAdvisorTab() {
  const [adviceType, setAdviceType] = useState("monthly_review");
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const advisorTypes = [
    { key: "monthly_review", label: "Monthly Review", icon: "📊" },
    { key: "budget_advice", label: "Budget Planner", icon: "📋" },
    { key: "debt_plan", label: "Debt Strategy", icon: "💳" },
    { key: "savings_plan", label: "Savings Plan", icon: "🏦" },
  ];

  const fetchAdvice = useCallback(async (type: string) => {
    setLoading(true);
    setAdvice(null);
    try {
      const res = await fetch(`/api/finance/ai-advisor?type=${type}`);
      const data = await res.json();
      setAdvice(data.advice);
    } catch (e) {
      console.error(e);
      setAdvice("Failed to generate advice. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium">AI Financial Advisor</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Get personalized financial advice based on your transaction history and budget.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {advisorTypes.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setAdviceType(t.key);
                  fetchAdvice(t.key);
                }}
                className={cn(
                  "p-3 rounded-lg text-left transition-all",
                  adviceType === t.key && advice
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : "bg-secondary/30 hover:bg-secondary/50 border border-transparent"
                )}
              >
                <span className="text-lg">{t.icon}</span>
                <p className="text-[10px] font-medium mt-1">{t.label}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full" />
              <span className="text-xs text-muted-foreground">
                Analyzing your finances...
              </span>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      )}

      {advice && !loading && (
        <Card>
          <CardContent className="p-4">
            <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed whitespace-pre-wrap">
              {advice}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
