"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  Filter,
  Clock,
  Mic,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Star,
  Pencil,
  Zap,
  X,
} from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import Link from "next/link";
import { addDays, format, isToday, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getSettings, getMacroGrams, fetchServerSettings } from "@/lib/settings";
import { useCachedFetch, invalidateHealthCache } from "@/lib/cache";

interface FoodEntry {
  id: string;
  loggedAt: string;
  mealType: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
  source: string;
}

interface FavoriteFood {
  id: string;
  foodDescription: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  usageCount: number;
}

const mealConfig: Record<
  string,
  { label: string; icon: string; color: string; bgColor: string; order: number }
> = {
  breakfast: {
    label: "Breakfast",
    icon: "🌅",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    order: 0,
  },
  lunch: {
    label: "Lunch",
    icon: "☀️",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/20",
    order: 1,
  },
  dinner: {
    label: "Dinner",
    icon: "🌙",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    order: 2,
  },
  snack: {
    label: "Snack",
    icon: "🍿",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    order: 3,
  },
};

function MacroBar({
  protein,
  carbs,
  fat,
}: {
  protein: number;
  carbs: number;
  fat: number;
}) {
  const total = protein * 4 + carbs * 4 + fat * 9;
  if (total === 0) return null;
  const pPct = ((protein * 4) / total) * 100;
  const cPct = ((carbs * 4) / total) * 100;
  const fPct = ((fat * 9) / total) * 100;

  return (
    <div className="w-full h-1.5 rounded-full bg-secondary/50 overflow-hidden flex">
      <div
        className="h-full bg-blue-400 transition-all"
        style={{ width: `${pPct}%` }}
      />
      <div
        className="h-full bg-amber-400 transition-all"
        style={{ width: `${cPct}%` }}
      />
      <div
        className="h-full bg-rose-400 transition-all"
        style={{ width: `${fPct}%` }}
      />
    </div>
  );
}

function MealSection({
  mealType,
  entries,
  onDelete,
  onRelog,
  onSaveFavorite,
  onEdit,
  collapsed,
  onToggle,
}: {
  mealType: string;
  entries: FoodEntry[];
  onDelete: (id: string) => void;
  onRelog: (entry: FoodEntry) => void;
  onSaveFavorite: (entry: FoodEntry) => void;
  onEdit: (entry: FoodEntry) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const config = mealConfig[mealType] || mealConfig.snack;
  const subtotal = entries.reduce((sum, e) => sum + e.calories, 0);
  const subProtein = entries.reduce((sum, e) => sum + e.proteinG, 0);
  const subCarbs = entries.reduce((sum, e) => sum + e.carbsG, 0);
  const subFat = entries.reduce((sum, e) => sum + e.fatG, 0);

  return (
    <div className={cn("rounded-xl border", config.bgColor)}>
      {/* Section header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{config.icon}</span>
          <span className={cn("font-semibold text-sm", config.color)}>
            {config.label}
          </span>
          <Badge variant="secondary" className="text-[10px] h-5">
            {entries.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{Math.round(subtotal)}</span>
          <span className="text-xs text-muted-foreground">cal</span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-background/60 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {entry.foodDescription}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(entry.loggedAt), "h:mm a")}
                    </span>
                    {(entry.source === "ai" || entry.source === "voice") && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] h-4 px-1 bg-primary/10 text-primary"
                      >
                        <Mic className="h-2 w-2 mr-0.5" />
                        AI
                      </Badge>
                    )}
                    {entry.source === "photo" && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] h-4 px-1 bg-amber-500/10 text-amber-400"
                      >
                        📸 Photo
                      </Badge>
                    )}
                  </div>
                </div>
                <span className="text-base font-bold whitespace-nowrap">
                  {Math.round(entry.calories)}
                </span>
              </div>

              {/* Macro bar */}
              <MacroBar
                protein={entry.proteinG}
                carbs={entry.carbsG}
                fat={entry.fatG}
              />

              {/* Macro numbers & actions */}
              <div className="flex items-center justify-between">
                <div className="flex gap-3 text-[10px]">
                  <span className="text-blue-400">
                    P {Math.round(entry.proteinG)}g
                  </span>
                  <span className="text-amber-400">
                    C {Math.round(entry.carbsG)}g
                  </span>
                  <span className="text-rose-400">
                    F {Math.round(entry.fatG)}g
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(entry)}
                    className="p-1 rounded hover:bg-blue-500/10 transition-colors"
                    title="Edit entry"
                  >
                    <Pencil className="h-3 w-3 text-blue-400/70" />
                  </button>
                  <button
                    onClick={() => onSaveFavorite(entry)}
                    className="p-1 rounded hover:bg-amber-500/10 transition-colors"
                    title="Save to favorites"
                  >
                    <Star className="h-3 w-3 text-amber-400/70" />
                  </button>
                  <button
                    onClick={() => onRelog(entry)}
                    className="p-1 rounded hover:bg-secondary/80 transition-colors"
                    title="Log again"
                  >
                    <RotateCcw className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <ConfirmDelete
                    onConfirm={() => onDelete(entry.id)}
                    itemName={entry.foodDescription}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Section subtotals */}
          <div className="flex items-center justify-between px-2 pt-1 text-[10px] text-muted-foreground">
            <div className="flex gap-3">
              <span>P {Math.round(subProtein)}g</span>
              <span>C {Math.round(subCarbs)}g</span>
              <span>F {Math.round(subFat)}g</span>
            </div>
            <span className="font-medium">{Math.round(subtotal)} cal</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FoodLogPage() {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const [searchQuery, setSearchQuery] = useState("");
  const [mealFilter, setMealFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [collapsedMeals, setCollapsedMeals] = useState<Record<string, boolean>>(
    {}
  );
  const [newEntry, setNewEntry] = useState({
    mealType: "lunch",
    foodDescription: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    notes: "",
  });
  const [calTarget, setCalTarget] = useState(2000);
  const [macroTargets, setMacroTargets] = useState({ proteinG: 150, carbsG: 200, fatG: 67 });
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickLogLoading, setQuickLogLoading] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<FoodEntry | null>(null);
  const [editForm, setEditForm] = useState({
    foodDescription: "",
    mealType: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    loggedAt: "",
    notes: "",
  });

  // Build cached fetch URL from current filters
  const foodUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFilter) params.set("date", dateFilter);
    params.set("tzOffsetMinutes", String(tzOffsetMinutes));
    if (mealFilter !== "all") params.set("mealType", mealFilter);
    if (searchQuery) params.set("search", searchQuery);
    return `/api/health/food?${params.toString()}`;
  }, [dateFilter, mealFilter, searchQuery, tzOffsetMinutes]);

  const { data: entries, initialLoading, refresh: fetchEntries } =
    useCachedFetch<FoodEntry[]>(foodUrl, { ttl: 60_000 });

  const { data: favorites, refresh: refreshFavorites } =
    useCachedFetch<FavoriteFood[]>("/api/health/favorites", { ttl: 300_000 });

  useEffect(() => {
    const local = getSettings();
    setCalTarget(local.calorieTarget);
    setMacroTargets(getMacroGrams(local));

    fetchServerSettings().then((s) => {
      setCalTarget(s.calorieTarget);
      setMacroTargets(getMacroGrams(s));
    });
  }, []);

  const getLoggedAtForSelectedDate = () => {
    const now = new Date();
    const [year, month, day] = dateFilter.split("-").map(Number);
    if (!year || !month || !day) return now.toISOString();
    return new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    ).toISOString();
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/health/food?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        invalidateHealthCache();
        fetchEntries();
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const handleRelog = async (entry: FoodEntry) => {
    try {
      const res = await fetch("/api/health/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loggedAt: getLoggedAtForSelectedDate(),
          mealType: entry.mealType,
          foodDescription: entry.foodDescription,
          calories: entry.calories,
          proteinG: entry.proteinG,
          carbsG: entry.carbsG,
          fatG: entry.fatG,
          notes: "Re-logged",
          source: entry.source,
        }),
      });
      if (res.ok) {
        invalidateHealthCache();
        fetchEntries();
      }
    } catch (error) {
      console.error("Failed to relog:", error);
    }
  };

  const handleSaveFavorite = async (entry: FoodEntry) => {
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: entry.foodDescription,
          mealType: entry.mealType,
          calories: entry.calories,
          proteinG: entry.proteinG,
          carbsG: entry.carbsG,
          fatG: entry.fatG,
          logNow: false,
        }),
      });
      if (res.ok) {
        const { toast } = await import("sonner");
        toast.success(`⭐ Saved "${entry.foodDescription}" to favorites!`);
      }
    } catch (error) {
      console.error("Failed to save favorite:", error);
    }
  };

  const handleStartEdit = (entry: FoodEntry) => {
    setEditEntry(entry);
    setEditForm({
      foodDescription: entry.foodDescription,
      mealType: entry.mealType,
      calories: String(entry.calories),
      proteinG: String(entry.proteinG),
      carbsG: String(entry.carbsG),
      fatG: String(entry.fatG),
      loggedAt: format(new Date(entry.loggedAt), "yyyy-MM-dd'T'HH:mm"),
      notes: entry.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    try {
      const res = await fetch(`/api/health/food?id=${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: editForm.foodDescription,
          mealType: editForm.mealType,
          calories: parseFloat(editForm.calories) || 0,
          proteinG: parseFloat(editForm.proteinG) || 0,
          carbsG: parseFloat(editForm.carbsG) || 0,
          fatG: parseFloat(editForm.fatG) || 0,
          loggedAt: editForm.loggedAt ? new Date(editForm.loggedAt).toISOString() : undefined,
          notes: editForm.notes || null,
        }),
      });
      if (res.ok) {
        setEditEntry(null);
        invalidateHealthCache();
        fetchEntries();
        const { toast } = await import("sonner");
        toast.success("Food entry updated!");
      }
    } catch (error) {
      console.error("Failed to update:", error);
    }
  };

  const handleAddManual = async () => {
    try {
      const res = await fetch("/api/health/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loggedAt: getLoggedAtForSelectedDate(),
          ...newEntry,
          calories: parseFloat(newEntry.calories) || 0,
          proteinG: parseFloat(newEntry.proteinG) || 0,
          carbsG: parseFloat(newEntry.carbsG) || 0,
          fatG: parseFloat(newEntry.fatG) || 0,
          source: "manual",
        }),
      });
      if (res.ok) {
        setShowAddDialog(false);
        setNewEntry({
          mealType: "lunch",
          foodDescription: "",
          calories: "",
          proteinG: "",
          carbsG: "",
          fatG: "",
          notes: "",
        });
        invalidateHealthCache();
        fetchEntries();
      }
    } catch (error) {
      console.error("Failed to add entry:", error);
    }
  };

  const handleQuickLog = async (fav: FavoriteFood) => {
    setQuickLogLoading(fav.id);
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loggedAt: getLoggedAtForSelectedDate(),
          foodDescription: fav.foodDescription,
          mealType: fav.mealType,
          calories: fav.calories,
          proteinG: fav.proteinG,
          carbsG: fav.carbsG,
          fatG: fav.fatG,
          logNow: true,
        }),
      });
      if (res.ok) {
        invalidateHealthCache();
        fetchEntries();
        refreshFavorites();
        const { toast } = await import("sonner");
        toast.success(`⚡ Logged "${fav.foodDescription}"!`);
      }
    } catch (error) {
      console.error("Quick log failed:", error);
    } finally {
      setQuickLogLoading(null);
    }
  };

  const handleDeleteFavorite = async (id: string) => {
    try {
      const res = await fetch(`/api/health/favorites?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        refreshFavorites();
        const { toast } = await import("sonner");
        toast.success("Removed from favorites");
      }
    } catch (error) {
      console.error("Failed to delete favorite:", error);
    }
  };

  const toggleMealCollapse = (mealType: string) => {
    setCollapsedMeals((prev) => ({
      ...prev,
      [mealType]: !prev[mealType],
    }));
  };

  // Group entries by meal type
  const safeEntries = entries ?? [];
  const groupedEntries = safeEntries.reduce<Record<string, FoodEntry[]>>(
    (groups, entry) => {
      const key = entry.mealType || "snack";
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
      return groups;
    },
    {}
  );

  // Sort meal groups by order
  const sortedMealTypes = Object.keys(groupedEntries).sort(
    (a, b) =>
      (mealConfig[a]?.order ?? 99) - (mealConfig[b]?.order ?? 99)
  );

  const totals = safeEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.proteinG,
      carbs: acc.carbs + e.carbsG,
      fat: acc.fat + e.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const calPct = Math.min((totals.calories / calTarget) * 100, 100);
  const proteinPct = macroTargets.proteinG > 0 ? Math.min((totals.protein / macroTargets.proteinG) * 100, 100) : 0;
  const carbsBarPct = macroTargets.carbsG > 0 ? Math.min((totals.carbs / macroTargets.carbsG) * 100, 100) : 0;
  const fatBarPct = macroTargets.fatG > 0 ? Math.min((totals.fat / macroTargets.fatG) * 100, 100) : 0;
  const selectedDate = new Date(`${dateFilter}T00:00:00`);

  const goToPreviousDay = () => {
    setDateFilter(format(subDays(selectedDate, 1), "yyyy-MM-dd"));
  };

  const goToNextDay = () => {
    setDateFilter(format(addDays(selectedDate, 1), "yyyy-MM-dd"));
  };

  const goToToday = () => {
    setDateFilter(format(new Date(), "yyyy-MM-dd"));
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Food Log</h1>
          <p className="text-xs text-muted-foreground">
            {format(selectedDate, "EEEE, MMM d")}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className={cn("h-9 w-9", showQuickLog && "border-amber-500/50 text-amber-400")}
          onClick={() => setShowQuickLog(!showQuickLog)}
          title="Quick log favorites"
        >
          <Zap className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Food Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Meal Type</Label>
                <Select
                  value={newEntry.mealType}
                  onValueChange={(v) =>
                    setNewEntry({ ...newEntry, mealType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">🌅 Breakfast</SelectItem>
                    <SelectItem value="lunch">☀️ Lunch</SelectItem>
                    <SelectItem value="dinner">🌙 Dinner</SelectItem>
                    <SelectItem value="snack">🍿 Snack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Food Description</Label>
                <Input
                  value={newEntry.foodDescription}
                  onChange={(e) =>
                    setNewEntry({
                      ...newEntry,
                      foodDescription: e.target.value,
                    })
                  }
                  placeholder="e.g., Arroz con pollo, bandeja paisa..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Calories</Label>
                  <Input
                    type="number"
                    value={newEntry.calories}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, calories: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Protein (g)</Label>
                  <Input
                    type="number"
                    value={newEntry.proteinG}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, proteinG: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Carbs (g)</Label>
                  <Input
                    type="number"
                    value={newEntry.carbsG}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, carbsG: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Fat (g)</Label>
                  <Input
                    type="number"
                    value={newEntry.fatG}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, fatG: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  value={newEntry.notes}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, notes: e.target.value })
                  }
                  placeholder="Any notes..."
                />
              </div>
              <Button onClick={handleAddManual} className="w-full">
                Save Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Always-visible date navigation for history */}
      <Card className="border-border/50">
        <CardContent className="p-3 flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPreviousDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="flex-1 h-8"
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday(selectedDate) && (
            <Button variant="secondary" size="sm" className="h-8" onClick={goToToday}>
              Today
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Daily Summary Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">
                {Math.round(totals.calories)}
              </p>
              <p className="text-xs text-muted-foreground">
                of {calTarget} kcal target
              </p>
            </div>
            {totals.calories < calTarget && (
              <div className="text-right">
                <p className="text-sm font-semibold text-green-500">
                  {Math.round(calTarget - totals.calories)}
                </p>
                <p className="text-[10px] text-muted-foreground">remaining</p>
              </div>
            )}
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                calPct >= 100
                  ? "bg-red-500"
                  : calPct >= 80
                  ? "bg-orange-500"
                  : "bg-green-500"
              )}
              style={{ width: `${calPct}%` }}
            />
          </div>

          {/* Macro progress bars */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-muted-foreground">Protein</span>
              </div>
              <p className="text-sm font-semibold">{Math.round(totals.protein)}g</p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-0.5">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-700" style={{ width: `${proteinPct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{Math.round(totals.protein)} / {macroTargets.proteinG}g</p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-muted-foreground">Carbs</span>
              </div>
              <p className="text-sm font-semibold">{Math.round(totals.carbs)}g</p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-0.5">
                <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${carbsBarPct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{Math.round(totals.carbs)} / {macroTargets.carbsG}g</p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-[10px] text-muted-foreground">Fat</span>
              </div>
              <p className="text-sm font-semibold">{Math.round(totals.fat)}g</p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-0.5">
                <div className="h-full bg-rose-400 rounded-full transition-all duration-700" style={{ width: `${fatBarPct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{Math.round(totals.fat)} / {macroTargets.fatG}g</p>
            </div>
          </div>
        </CardContent>
      </Card>

            {/* Filters (collapsible) */}
      {showFilters && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          <Select value={mealFilter} onValueChange={setMealFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Meals</SelectItem>
              <SelectItem value="breakfast">Breakfast</SelectItem>
              <SelectItem value="lunch">Lunch</SelectItem>
              <SelectItem value="dinner">Dinner</SelectItem>
              <SelectItem value="snack">Snack</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search foods..."
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Quick Log Favorites Panel */}
      {showQuickLog && (
        <Card className="animate-in slide-in-from-top-2 duration-200 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Quick Log
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowQuickLog(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!favorites || favorites.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No favorites yet! Tap ⭐ on any food entry to save it.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 group"
                  >
                    <button
                      onClick={() => handleQuickLog(fav)}
                      disabled={quickLogLoading === fav.id}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-sm font-medium truncate">
                        {fav.foodDescription}
                      </p>
                      <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{Math.round(fav.calories)} cal</span>
                        <span className="text-blue-400">P{Math.round(fav.proteinG)}g</span>
                        <span className="text-amber-400">C{Math.round(fav.carbsG)}g</span>
                        <span className="text-rose-400">F{Math.round(fav.fatG)}g</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {fav.usageCount > 1 && (
                        <span className="text-[9px] text-muted-foreground">
                          ×{fav.usageCount}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                        onClick={() => handleQuickLog(fav)}
                        disabled={quickLogLoading === fav.id}
                      >
                        {quickLogLoading === fav.id ? (
                          <div className="h-3 w-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-1.5 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteFavorite(fav.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Meal-grouped entries */}
      {initialLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : safeEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No food entries yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the microphone or Add to log food.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedMealTypes.map((mealType) => (
            <MealSection
              key={mealType}
              mealType={mealType}
              entries={groupedEntries[mealType]}
              onDelete={handleDelete}
              onRelog={handleRelog}
              onSaveFavorite={handleSaveFavorite}
              onEdit={handleStartEdit}
              collapsed={!!collapsedMeals[mealType]}
              onToggle={() => toggleMealCollapse(mealType)}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Food Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date & Time</Label>
              <Input
                type="datetime-local"
                value={editForm.loggedAt}
                onChange={(e) => setEditForm({ ...editForm, loggedAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Meal Type</Label>
              <Select
                value={editForm.mealType}
                onValueChange={(v) => setEditForm({ ...editForm, mealType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">🌅 Breakfast</SelectItem>
                  <SelectItem value="lunch">☀️ Lunch</SelectItem>
                  <SelectItem value="dinner">🌙 Dinner</SelectItem>
                  <SelectItem value="snack">🍿 Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Food Description</Label>
              <Input
                value={editForm.foodDescription}
                onChange={(e) => setEditForm({ ...editForm, foodDescription: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Calories</Label>
                <Input
                  type="number"
                  value={editForm.calories}
                  onChange={(e) => setEditForm({ ...editForm, calories: e.target.value })}
                />
              </div>
              <div>
                <Label>Protein (g)</Label>
                <Input
                  type="number"
                  value={editForm.proteinG}
                  onChange={(e) => setEditForm({ ...editForm, proteinG: e.target.value })}
                />
              </div>
              <div>
                <Label>Carbs (g)</Label>
                <Input
                  type="number"
                  value={editForm.carbsG}
                  onChange={(e) => setEditForm({ ...editForm, carbsG: e.target.value })}
                />
              </div>
              <div>
                <Label>Fat (g)</Label>
                <Input
                  type="number"
                  value={editForm.fatG}
                  onChange={(e) => setEditForm({ ...editForm, fatG: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="flex-1">
                Save Changes
              </Button>
              {editEntry && (
                <ConfirmDelete
                  onConfirm={async () => {
                    await handleDelete(editEntry.id);
                    setEditEntry(null);
                  }}
                  itemName="this food entry"
                  trigger={
                    <Button variant="destructive" className="px-3">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Input */}
      <VoiceInput onDataLogged={() => { invalidateHealthCache(); fetchEntries(); }} />
    </div>
  );
}

