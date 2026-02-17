"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowLeft,
  PiggyBank,
  Plus,
  Target,
  X,
  Check,
  Pencil,
  Trash2,
  PartyPopper,
} from "lucide-react";
import Link from "next/link";

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline?: string;
  icon?: string;
  color?: string;
  isCompleted: boolean;
  notes?: string;
}

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

export default function GoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [addAmount, setAddAmount] = useState<{ id: string; amount: string } | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAddContribution = async (goalId: string, amount: number) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;

    try {
      await fetch("/api/finance/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: goalId,
          currentAmount: goal.currentAmount + amount,
        }),
      });
      setAddAmount(null);
      fetchGoals();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this savings goal?")) return;
    try {
      await fetch(`/api/finance/goals?id=${id}`, { method: "DELETE" });
      fetchGoals();
    } catch (e) {
      console.error(e);
    }
  };

  const activeGoals = goals.filter((g) => !g.isCompleted);
  const completedGoals = goals.filter((g) => g.isCompleted);

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
            <PiggyBank className="h-5 w-5 text-amber-400" />
            Savings Goals
          </h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="p-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <GoalForm
          onClose={() => setShowAdd(false)}
          onSave={() => {
            setShowAdd(false);
            fetchGoals();
          }}
        />
      )}

      {editGoal && (
        <GoalForm
          goal={editGoal}
          onClose={() => setEditGoal(null)}
          onSave={() => {
            setEditGoal(null);
            fetchGoals();
          }}
        />
      )}

      {/* Active Goals */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : activeGoals.length > 0 ? (
        <div className="space-y-3">
          {activeGoals.map((goal) => {
            const pct = goal.targetAmount > 0
              ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
              : 0;
            const remaining = goal.targetAmount - goal.currentAmount;

            return (
              <Card key={goal.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{goal.icon || "🎯"}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{goal.name}</p>
                      {goal.deadline && (
                        <p className="text-[10px] text-muted-foreground">
                          Target: {format(new Date(goal.deadline), "MMM yyyy")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditGoal(goal)}
                        className="p-1 rounded hover:bg-secondary"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(goal.id)}
                        className="p-1 rounded hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="font-medium">{pct}% reached</span>
                      <span className="text-muted-foreground">
                        {formatCOP(remaining, true)} to go
                      </span>
                    </div>
                    <div className="w-full bg-secondary/50 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatCOP(goal.currentAmount, true)}</span>
                      <span>{formatCOP(goal.targetAmount, true)}</span>
                    </div>
                  </div>

                  {/* Add contribution */}
                  {addAmount?.id === goal.id ? (
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs"
                        type="number"
                        placeholder="Amount to add"
                        value={addAmount.amount}
                        onChange={(e) =>
                          setAddAmount({ id: goal.id, amount: e.target.value })
                        }
                        autoFocus
                      />
                      <button
                        onClick={() =>
                          handleAddContribution(
                            goal.id,
                            parseFloat(addAmount.amount) || 0
                          )
                        }
                        className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setAddAmount(null)}
                        className="p-1.5 rounded-lg bg-secondary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddAmount({ id: goal.id, amount: "" })}
                      className="w-full text-[10px] py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                      + Add Contribution
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !showAdd ? (
        <Card className="border-dashed border-amber-500/30">
          <CardContent className="p-6 text-center space-y-3">
            <PiggyBank className="h-8 w-8 text-amber-400/30 mx-auto" />
            <p className="text-xs text-muted-foreground">No savings goals yet</p>
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              Create Your First Goal
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <PartyPopper className="h-3 w-3" />
            Completed Goals
          </h3>
          {completedGoals.map((goal) => (
            <Card key={goal.id} className="opacity-60">
              <CardContent className="p-3 flex items-center gap-3">
                <span>{goal.icon || "🎉"}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium line-through">{goal.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatCOP(goal.targetAmount, true)} reached!
                  </p>
                </div>
                <Check className="h-4 w-4 text-emerald-400" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goal Form ──────────────────────────────────────────────────────────

function GoalForm({
  goal,
  onClose,
  onSave,
}: {
  goal?: SavingsGoal;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: goal?.name || "",
    targetAmount: goal?.targetAmount ? String(goal.targetAmount) : "",
    currentAmount: goal?.currentAmount ? String(goal.currentAmount) : "0",
    deadline: goal?.deadline ? format(new Date(goal.deadline), "yyyy-MM-dd") : "",
    icon: goal?.icon || "🎯",
    notes: goal?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name || !form.targetAmount) return;
    setSaving(true);
    try {
      await fetch("/api/finance/goals", {
        method: goal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(goal ? { id: goal.id } : {}),
          name: form.name,
          targetAmount: parseFloat(form.targetAmount),
          currentAmount: parseFloat(form.currentAmount) || 0,
          deadline: form.deadline || undefined,
          icon: form.icon,
          notes: form.notes || undefined,
        }),
      });
      onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const icons = ["🎯", "🏠", "✈️", "🚗", "💻", "📚", "💍", "🎓", "🏖️", "💰", "🎮", "👶"];

  return (
    <Card className="border-amber-500/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            {goal ? "Edit Goal" : "New Savings Goal"}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {icons.map((ic) => (
            <button
              key={ic}
              onClick={() => setForm((p) => ({ ...p, icon: ic }))}
              className={cn(
                "p-1.5 rounded-lg transition-colors text-sm",
                form.icon === ic ? "bg-amber-500/20" : "bg-secondary/30 hover:bg-secondary/50"
              )}
            >
              {ic}
            </button>
          ))}
        </div>

        <input
          className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
          placeholder="Goal name (e.g. Emergency Fund)"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
            type="number"
            placeholder="Target amount"
            value={form.targetAmount}
            onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))}
          />
          <input
            className="bg-secondary/50 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50"
            type="number"
            placeholder="Current amount"
            value={form.currentAmount}
            onChange={(e) => setForm((p) => ({ ...p, currentAmount: e.target.value }))}
          />
        </div>

        <input
          className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm"
          type="date"
          placeholder="Deadline (optional)"
          value={form.deadline}
          onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.targetAmount}
            className="flex-1 text-xs py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : goal ? "Update Goal" : "Create Goal"}
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
