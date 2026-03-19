"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, addMonths, subMonths } from "date-fns";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Target,
  Save,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────

interface BudgetCategory {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryType: string;
  planned: number;
  actual: number;
  transactionCount: number;
  isFixed: boolean;
  difference: number;
  percentUsed: number;
}

interface BudgetData {
  budget: {
    id: string;
    name: string;
    month: number;
    year: number;
    totalIncome: number;
    totalBudget: number;
  };
  categories: BudgetCategory[];
  summary: {
    totalPlanned: number;
    totalActual: number;
    totalIncomePlanned: number;
    totalIncomeActual: number;
    remaining: number;
    percentUsed: number;
    surplus: number;
  };
  plannedObligations?: Array<{
    id: string;
    name: string;
    category: string;
    dueDate: string;
    expectedAmount: number;
    status: string;
    transactionId?: string | null;
  }>;
  planning?: {
    plannedObligationsTotal: number;
    dueObligationCount: number;
  };
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

// ─── Main Component ─────────────────────────────────────────────────────

export default function BudgetPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, { planned: number; isFixed: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [incomePlanned, setIncomePlanned] = useState(0);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "expense",
    icon: "",
    color: "",
  });

  const monthKey = format(currentDate, "yyyy-MM");

  const fetchBudget = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/budgets?month=${monthKey}`);
      const result = await res.json();
      setData(result);

      // Initialize edit values
      const vals: Record<string, { planned: number; isFixed: boolean }> = {};
      for (const cat of result.categories || []) {
        vals[cat.categoryId] = { planned: cat.planned, isFixed: cat.isFixed };
      }
      setEditValues(vals);
      setIncomePlanned(result.summary?.totalIncomePlanned || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const items = Object.entries(editValues).map(([categoryId, val]) => ({
        categoryId,
        planned: val.planned,
        isFixed: val.isFixed,
      }));

      const totalBudget = items.reduce((sum, i) => {
        const cat = data.categories.find((c) => c.categoryId === i.categoryId);
        if (cat?.categoryType === "expense") return sum + i.planned;
        return sum;
      }, 0);

      await fetch("/api/finance/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: currentDate.getMonth() + 1,
          year: currentDate.getFullYear(),
          items,
          totalIncome: incomePlanned,
          totalBudget,
        }),
      });

      setEditMode(false);
      fetchBudget();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const expenseCategories = data?.categories.filter((c) => c.categoryType === "expense") || [];
  const incomeCategories = data?.categories.filter((c) => c.categoryType === "income") || [];
  const savingsCategories = data?.categories.filter((c) => c.categoryType === "savings") || [];

  const handleAddCategory = async () => {
    if (!categoryForm.name) return;
    setSaving(true);
    try {
      await fetch("/api/finance/budget-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.name,
          type: categoryForm.type,
          icon: categoryForm.icon || null,
          color: categoryForm.color || null,
        }),
      });
      setCategoryForm({ name: "", type: "expense", icon: "", color: "" });
      setShowCategoryForm(false);
      fetchBudget();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
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
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-400" />
            Budget
          </h1>
        </div>
        {editMode ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save"}
          </button>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            Edit Budget
          </button>
        )}
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setCurrentDate((d) => subMonths(d, 1))}
          className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold min-w-[140px] text-center">
          {format(currentDate, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setCurrentDate((d) => addMonths(d, 1))}
          className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Summary Card */}
          <Card
            className={cn(
              "border",
              data.summary.surplus >= 0
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-red-500/20 bg-red-500/5"
            )}
          >
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Income</p>
                  <p className="text-sm font-bold text-green-400">
                    {formatCOP(data.summary.totalIncomeActual, true)}
                  </p>
                  {editMode && (
                    <p className="text-[9px] text-muted-foreground">
                      Plan: {formatCOP(incomePlanned, true)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Spent</p>
                  <p className="text-sm font-bold text-red-400">
                    {formatCOP(data.summary.totalActual, true)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    of {formatCOP(data.summary.totalPlanned, true)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Surplus</p>
                  <p
                    className={cn(
                      "text-sm font-bold",
                      data.summary.surplus >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatCOP(data.summary.surplus, true)}
                  </p>
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Budget used</span>
                  <span>{data.summary.percentUsed}%</span>
                </div>
                <div className="w-full bg-secondary/50 rounded-full h-2">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      data.summary.percentUsed > 100
                        ? "bg-red-500"
                        : data.summary.percentUsed > 80
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                    style={{
                      width: `${Math.min(data.summary.percentUsed, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Planned Obligations</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Manual recurring commitments that should shape the budget before they are paid.
                  </p>
                </div>
                <Link href="/finances/obligations" className="text-[11px] text-emerald-400">
                  Open obligations
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/40 p-3">
                  <p className="text-[10px] text-muted-foreground">Planned</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatCOP(data.planning?.plannedObligationsTotal || 0, true)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/40 p-3">
                  <p className="text-[10px] text-muted-foreground">Due</p>
                  <p className="mt-1 text-sm font-semibold">
                    {data.planning?.dueObligationCount || 0}
                  </p>
                </div>
              </div>
              {(data.plannedObligations || []).length > 0 ? (
                <div className="space-y-2">
                  {data.plannedObligations?.slice(0, 5).map((obligation) => (
                    <div key={obligation.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/30 p-3">
                      <div>
                        <p className="text-xs font-medium">{obligation.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Due {format(new Date(obligation.dueDate), "MMM d")} · {obligation.status}
                        </p>
                      </div>
                      <p className="text-xs font-semibold">
                        {formatCOP(obligation.expectedAmount, true)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No manual obligations for this month yet.
                </p>
              )}
            </CardContent>
          </Card>

          {(editMode || showCategoryForm) && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Custom Categories</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Add budget categories directly from the UI for planning lines the defaults missed.
                    </p>
                  </div>
                  {!showCategoryForm && (
                    <button
                      onClick={() => setShowCategoryForm(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Category
                    </button>
                  )}
                </div>
                {showCategoryForm && (
                  <div className="grid gap-3 md:grid-cols-4">
                    <input
                      className="rounded-xl bg-secondary/50 px-3 py-2 text-xs"
                      placeholder="Category name"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                    />
                    <select
                      className="rounded-xl bg-secondary/50 px-3 py-2 text-xs"
                      value={categoryForm.type}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, type: e.target.value }))}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="savings">Savings</option>
                    </select>
                    <input
                      className="rounded-xl bg-secondary/50 px-3 py-2 text-xs"
                      placeholder="Icon (optional)"
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, icon: e.target.value }))}
                    />
                    <input
                      className="rounded-xl bg-secondary/50 px-3 py-2 text-xs"
                      placeholder="Color hex (optional)"
                      value={categoryForm.color}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, color: e.target.value }))}
                    />
                    <div className="md:col-span-4 flex gap-2">
                      <button
                        onClick={handleAddCategory}
                        disabled={saving || !categoryForm.name}
                        className="text-xs px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Category"}
                      </button>
                      <button
                        onClick={() => setShowCategoryForm(false)}
                        className="text-xs px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Expense Categories — Desires vs Actuals */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3" />
              Expenses — Budget vs Actual
            </h3>
            {expenseCategories
              .filter((c) => c.planned > 0 || c.actual > 0 || editMode)
              .map((cat) => {
                const val = editValues[cat.categoryId] || {
                  planned: cat.planned,
                  isFixed: cat.isFixed,
                };
                const overBudget = cat.actual > cat.planned && cat.planned > 0;
                const pct =
                  cat.planned > 0
                    ? Math.round((cat.actual / cat.planned) * 100)
                    : cat.actual > 0
                    ? 100
                    : 0;

                return (
                  <Card
                    key={cat.categoryId}
                    className={cn(
                      "transition-colors",
                      overBudget && "border-red-500/20"
                    )}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.categoryIcon || "📦"}</span>
                        <span className="text-xs font-medium flex-1">
                          {cat.categoryName}
                        </span>
                        {overBudget && (
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                        )}
                        {pct > 0 && pct <= 100 && cat.planned > 0 && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 opacity-50" />
                        )}
                      </div>

                      {editMode ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 bg-secondary/50 rounded px-2 py-1 text-xs"
                            type="number"
                            placeholder="Budget amount"
                            value={val.planned || ""}
                            onChange={(e) =>
                              setEditValues((p) => ({
                                ...p,
                                [cat.categoryId]: {
                                  ...p[cat.categoryId],
                                  planned: parseFloat(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <label className="flex items-center gap-1 text-[10px]">
                            <input
                              type="checkbox"
                              checked={val.isFixed}
                              onChange={(e) =>
                                setEditValues((p) => ({
                                  ...p,
                                  [cat.categoryId]: {
                                    ...p[cat.categoryId],
                                    isFixed: e.target.checked,
                                  },
                                }))
                              }
                              className="rounded"
                            />
                            Fixed
                          </label>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">
                              {formatCOP(cat.actual, true)} spent
                              {cat.transactionCount > 0 &&
                                ` · ${cat.transactionCount} txn${cat.transactionCount > 1 ? "s" : ""}`}
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                overBudget
                                  ? "text-red-400"
                                  : cat.difference > 0
                                  ? "text-emerald-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {cat.planned > 0
                                ? overBudget
                                  ? `${formatCOP(Math.abs(cat.difference), true)} over`
                                  : `${formatCOP(cat.difference, true)} left`
                                : "No budget"}
                            </span>
                          </div>
                          {cat.planned > 0 && (
                            <div className="w-full bg-secondary/50 rounded-full h-1.5">
                              <div
                                className={cn(
                                  "h-1.5 rounded-full transition-all",
                                  pct > 100
                                    ? "bg-red-500"
                                    : pct > 80
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                )}
                                style={{
                                  width: `${Math.min(pct, 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {/* Income Categories */}
          {(incomeCategories.some((c) => c.planned > 0 || c.actual > 0) || editMode) && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Income
              </h3>
              {incomeCategories
                .filter((c) => c.planned > 0 || c.actual > 0 || editMode)
                .map((cat) => {
                  const val = editValues[cat.categoryId] || {
                    planned: cat.planned,
                    isFixed: cat.isFixed,
                  };
                  return (
                    <Card key={cat.categoryId}>
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{cat.categoryIcon || "💰"}</span>
                          <span className="text-xs font-medium flex-1">
                            {cat.categoryName}
                          </span>
                        </div>
                        {editMode ? (
                          <input
                            className="w-full bg-secondary/50 rounded px-2 py-1 text-xs"
                            type="number"
                            placeholder="Expected income"
                            value={val.planned || ""}
                            onChange={(e) =>
                              setEditValues((p) => ({
                                ...p,
                                [cat.categoryId]: {
                                  ...p[cat.categoryId],
                                  planned: parseFloat(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        ) : (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-green-400 font-medium">
                              {formatCOP(cat.actual, true)} received
                            </span>
                            <span className="text-muted-foreground">
                              {cat.planned > 0
                                ? `of ${formatCOP(cat.planned, true)}`
                                : "No target"}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}

          {/* Savings */}
          {(savingsCategories.some((c) => c.planned > 0 || c.actual > 0) || editMode) && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground px-1">
                🏦 Savings
              </h3>
              {savingsCategories.map((cat) => {
                const val = editValues[cat.categoryId] || {
                  planned: cat.planned,
                  isFixed: cat.isFixed,
                };
                return (
                  <Card key={cat.categoryId}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.categoryIcon || "🏦"}</span>
                        <span className="text-xs font-medium flex-1">
                          {cat.categoryName}
                        </span>
                      </div>
                      {editMode ? (
                        <input
                          className="w-full bg-secondary/50 rounded px-2 py-1 text-xs"
                          type="number"
                          placeholder="Savings target"
                          value={val.planned || ""}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              [cat.categoryId]: {
                                ...p[cat.categoryId],
                                planned: parseFloat(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      ) : (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-emerald-400 font-medium">
                            {formatCOP(cat.actual, true)} saved
                          </span>
                          <span className="text-muted-foreground">
                            {cat.planned > 0
                              ? `of ${formatCOP(cat.planned, true)}`
                              : "No target"}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Failed to load budget</p>
        </div>
      )}
    </div>
  );
}
