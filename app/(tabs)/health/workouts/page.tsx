"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ArrowLeft,
  Plus,
  Clock,
  Flame,
  Dumbbell,
  Sparkles,
  RefreshCw,
  Loader2,
  MapPin,
  Heart,
  Mountain,
  TrendingUp,
  Zap,
  Timer,
  Pencil,
  Trophy,
  ThumbsUp,
  Route,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/voice-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RouteMap } from "@/components/route-map";
import { WhisperButton } from "@/components/whisper-button";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCachedFetch, invalidateHealthCache } from "@/lib/cache";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────
interface StravaExerciseData {
  name?: string;
  stravaType?: string;
  sportType?: string;
  distance?: number;
  distanceKm?: number;
  distanceMi?: number;
  elevationGain?: number;
  elevHigh?: number;
  elevLow?: number;
  avgHeartrate?: number;
  maxHeartrate?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgWatts?: number;
  maxWatts?: number;
  avgCadence?: number;
  sufferScore?: number;
  achievements?: number;
  kudos?: number;
  prs?: number;
  polyline?: string;
  movingTime?: number;
  elapsedTime?: number;
  // Legacy fields
  sets?: number;
  reps?: number;
  weightKg?: number;
}

interface WorkoutEntry {
  id: string;
  startedAt: string;
  durationMinutes: number;
  workoutType: string;
  description: string | null;
  caloriesBurned: number | null;
  exercises: StravaExerciseData[] | null;
  source: string;
  stravaActivityId: string | null;
}

// ─── Config ────────────────────────────────────────────────────────────
const workoutConfig: Record<
  string,
  { icon: string; color: string; bgColor: string; gradient: string }
> = {
  strength: {
    icon: "💪",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    gradient: "from-blue-500/10 to-blue-500/5",
  },
  cardio: {
    icon: "❤️",
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    gradient: "from-red-500/10 to-red-500/5",
  },
  run: {
    icon: "🏃",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/20",
    gradient: "from-green-500/10 to-green-500/5",
  },
  walk: {
    icon: "🚶",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    gradient: "from-emerald-500/10 to-emerald-500/5",
  },
  hike: {
    icon: "🥾",
    color: "text-lime-400",
    bgColor: "bg-lime-500/10 border-lime-500/20",
    gradient: "from-lime-500/10 to-lime-500/5",
  },
  cycling: {
    icon: "🚴",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    gradient: "from-amber-500/10 to-amber-500/5",
  },
  swimming: {
    icon: "🏊",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
    gradient: "from-cyan-500/10 to-cyan-500/5",
  },
  yoga: {
    icon: "🧘",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    gradient: "from-purple-500/10 to-purple-500/5",
  },
  hiit: {
    icon: "🔥",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
    gradient: "from-orange-500/10 to-orange-500/5",
  },
  other: {
    icon: "⚡",
    color: "text-gray-400",
    bgColor: "bg-gray-500/10 border-gray-500/20",
    gradient: "from-gray-500/10 to-gray-500/5",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────
function formatPace(avgSpeedMs: number, type: string): string {
  if (type === "run" || type === "walk" || type === "hike") {
    const paceMinPerKm = 1000 / 60 / avgSpeedMs;
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
    return `${paceMin}:${paceSec.toString().padStart(2, "0")} /km`;
  }
  if (type === "cycling") {
    const speedKmh = avgSpeedMs * 3.6;
    return `${speedKmh.toFixed(1)} km/h`;
  }
  return "";
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Component ──────────────────────────────────────────────────────────
export default function WorkoutsPage() {
  const { data: entries, loading, refresh: fetchEntries } =
    useCachedFetch<WorkoutEntry[]>("/api/health/workouts", { ttl: 60_000 });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkoutEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState({
    workoutType: "strength",
    durationMinutes: "",
    description: "",
    caloriesBurned: "",
  });
  const [editForm, setEditForm] = useState({
    workoutType: "",
    durationMinutes: "",
    description: "",
    caloriesBurned: "",
    startedAt: "",
  });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then((d) => setStravaConnected(d.connected))
      .catch(() => {});
  }, []);

  const handleStravaSync = async () => {
    setStravaSyncing(true);
    try {
      const res = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullSync: false }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Synced ${data.synced} activities`);
        if (data.synced > 0) {
          invalidateHealthCache();
          fetchEntries();
        }
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setStravaSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/health/workouts?id=${id}`, {
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

  const handleAddManual = async () => {
    try {
      const res = await fetch("/api/health/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newEntry,
          durationMinutes: parseInt(newEntry.durationMinutes) || 0,
          caloriesBurned: newEntry.caloriesBurned
            ? parseFloat(newEntry.caloriesBurned)
            : null,
          source: "manual",
        }),
      });
      if (res.ok) {
        setShowAddDialog(false);
        setNewEntry({
          workoutType: "strength",
          durationMinutes: "",
          description: "",
          caloriesBurned: "",
        });
        invalidateHealthCache();
        fetchEntries();
        toast.success("Workout logged!");
      }
    } catch (error) {
      console.error("Failed to add entry:", error);
    }
  };

  const openEditDialog = (entry: WorkoutEntry) => {
    setEditingEntry(entry);
    setEditForm({
      workoutType: entry.workoutType,
      durationMinutes: entry.durationMinutes.toString(),
      description: entry.description || "",
      caloriesBurned: entry.caloriesBurned?.toString() || "",
      startedAt: format(new Date(entry.startedAt), "yyyy-MM-dd'T'HH:mm"),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    try {
      const res = await fetch("/api/health/workouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          workoutType: editForm.workoutType,
          durationMinutes: parseInt(editForm.durationMinutes) || 0,
          description: editForm.description || null,
          caloriesBurned: editForm.caloriesBurned
            ? parseFloat(editForm.caloriesBurned)
            : null,
          startedAt: editForm.startedAt ? new Date(editForm.startedAt).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        setEditingEntry(null);
        invalidateHealthCache();
        fetchEntries();
        toast.success("Workout updated!");
      }
    } catch (error) {
      console.error("Failed to edit:", error);
      toast.error("Failed to update");
    }
  };

  const handleBulkDeleteNonStrava = async () => {
    const manualEntries = safeEntries.filter((e) => e.source !== "strava");
    if (manualEntries.length === 0) {
      toast.info("No manual workouts to remove.");
      return;
    }
    if (!confirm(`Delete ${manualEntries.length} non-Strava workout${manualEntries.length > 1 ? "s" : ""}? This cannot be undone.`)) return;

    let deleted = 0;
    for (const entry of manualEntries) {
      try {
        const res = await fetch(`/api/health/workouts?id=${entry.id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch {
        // continue
      }
    }
    toast.success(`Removed ${deleted} manual workout${deleted > 1 ? "s" : ""}`);
    invalidateHealthCache();
    fetchEntries();
  };

  const safeEntries = entries ?? [];
  const totalMinutes = safeEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const totalCalBurned = safeEntries.reduce(
    (sum, e) => sum + (e.caloriesBurned || 0),
    0
  );
  const stravaCount = safeEntries.filter((e) => e.source === "strava").length;
  const manualCount = safeEntries.filter((e) => e.source !== "strava").length;

  // Get Strava exercise data from first exercise entry
  const getStravaData = (entry: WorkoutEntry): StravaExerciseData | null => {
    if (!entry.exercises || entry.exercises.length === 0) return null;
    return entry.exercises[0];
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
          <h1 className="text-xl font-bold">Workouts</h1>
          <p className="text-xs text-muted-foreground">
            Track your training sessions
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Log Workout</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Workout Type</Label>
                <Select
                  value={newEntry.workoutType}
                  onValueChange={(v) =>
                    setNewEntry({ ...newEntry, workoutType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(workoutConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.icon} {key.charAt(0).toUpperCase() + key.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    value={newEntry.durationMinutes}
                    onChange={(e) =>
                      setNewEntry({
                        ...newEntry,
                        durationMinutes: e.target.value,
                      })
                    }
                    placeholder="45"
                  />
                </div>
                <div>
                  <Label>Calories Burned</Label>
                  <Input
                    type="number"
                    value={newEntry.caloriesBurned}
                    onChange={(e) =>
                      setNewEntry({
                        ...newEntry,
                        caloriesBurned: e.target.value,
                      })
                    }
                    placeholder="300"
                  />
                </div>
              </div>
              <div>
                <Label className="flex items-center justify-between">
                  Description
                  <WhisperButton
                    size="sm"
                    className="h-6 w-6 p-0"
                    onTranscription={(text) =>
                      setNewEntry((prev) => ({
                        ...prev,
                        description: prev.description
                          ? `${prev.description}\n${text}`
                          : text,
                      }))
                    }
                  />
                </Label>
                <Textarea
                  value={newEntry.description}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, description: e.target.value })
                  }
                  placeholder="Describe your workout — or tap the mic"
                  rows={2}
                  className="mt-1"
                />
              </div>
              <Button onClick={handleAddManual} className="w-full">
                Save Workout
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* AI Plan Banner */}
      <Link href="/health/workouts/plan">
        <Card className="border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">AI Workout Plan</p>
              <p className="text-[10px] text-muted-foreground">
                Get a personalized training plan, track progress, and level up
              </p>
            </div>
            <span className="text-xs text-purple-400">Open →</span>
          </CardContent>
        </Card>
      </Link>

      {/* Strava Sync */}
      {stravaConnected && (
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-3 flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" fill="#FC4C02"/>
            </svg>
            <p className="text-xs text-muted-foreground flex-1">
              {stravaCount > 0
                ? `${stravaCount} Strava activities synced`
                : "Strava connected — sync your latest activities"}
            </p>
            <Button
              onClick={handleStravaSync}
              disabled={stravaSyncing}
              size="sm"
              variant="outline"
              className="h-7 text-xs border-orange-500/30 text-orange-400"
            >
              {stravaSyncing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Sync
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary bar */}
      {safeEntries.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-2xl font-bold">{safeEntries.length}</p>
                  <p className="text-[10px] text-muted-foreground">workouts</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalMinutes}</p>
                  <p className="text-[10px] text-muted-foreground">minutes</p>
                </div>
                {totalCalBurned > 0 && (
                  <div>
                    <p className="text-2xl font-bold">
                      {Math.round(totalCalBurned).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      cal burned
                    </p>
                  </div>
                )}
              </div>
              {/* Bulk delete manual workouts */}
              {manualCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleBulkDeleteNonStrava}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {manualCount} manual
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workout List */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : safeEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Dumbbell className="h-10 w-10 text-primary/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No workouts logged yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use voice input or tap Add to log a workout.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {safeEntries.map((entry) => {
            const cfg =
              workoutConfig[entry.workoutType] || workoutConfig.other;
            const strava = getStravaData(entry);
            const isExpanded = expandedId === entry.id;
            const hasRoute = strava?.polyline;
            const hasDetailedStats = strava && (strava.distance || strava.avgHeartrate || strava.elevationGain);

            return (
              <Card
                key={entry.id}
                className={cn("border overflow-hidden", cfg.bgColor)}
              >
                <CardContent className="p-0">
                  {/* Main card content */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Type, source badge & date */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xl">{cfg.icon}</span>
                          <span
                            className={cn("font-semibold capitalize", cfg.color)}
                          >
                            {entry.workoutType}
                          </span>

                          {/* Source badges */}
                          {entry.source === "strava" && (
                            <Badge className="text-[9px] h-4 px-1.5 bg-orange-500/15 text-orange-400 border-orange-500/30">
                              <svg className="h-2.5 w-2.5 mr-0.5" viewBox="0 0 24 24">
                                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" fill="#FC4C02"/>
                              </svg>
                              Strava
                            </Badge>
                          )}
                          {entry.source === "ai" && (
                            <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary">
                              AI
                            </Badge>
                          )}

                          <Badge variant="outline" className="text-[10px] ml-auto">
                            {format(new Date(entry.startedAt), "MMM d, h:mm a")}
                          </Badge>
                        </div>

                        {/* Strava activity name */}
                        {strava?.name && entry.source === "strava" && (
                          <p className="text-sm font-medium mb-1">{strava.name}</p>
                        )}

                        {/* Quick stats row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">
                              {entry.durationMinutes} min
                            </span>
                          </div>

                          {entry.caloriesBurned && entry.caloriesBurned > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Flame className="h-3.5 w-3.5 text-orange-400" />
                              <span className="font-medium">
                                {Math.round(entry.caloriesBurned)} cal
                              </span>
                            </div>
                          )}

                          {strava?.distanceKm && strava.distanceKm > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Route className="h-3.5 w-3.5 text-blue-400" />
                              <span className="font-medium">
                                {strava.distanceKm} km ({strava.distanceMi} mi)
                              </span>
                            </div>
                          )}

                          {strava?.elevationGain && strava.elevationGain > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Mountain className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="font-medium">
                                {Math.round(strava.elevationGain)}m ↑
                              </span>
                            </div>
                          )}

                          {strava?.avgHeartrate && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Heart className="h-3.5 w-3.5 text-red-400" />
                              <span className="font-medium">
                                {Math.round(strava.avgHeartrate)} bpm
                              </span>
                            </div>
                          )}

                          {strava?.avgSpeed && strava.avgSpeed > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                              <span className="font-medium">
                                {formatPace(strava.avgSpeed, entry.workoutType)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Achievements row */}
                        {(strava?.prs || strava?.achievements || strava?.kudos) && (
                          <div className="flex gap-3 mt-2">
                            {strava.prs && strava.prs > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-amber-400">
                                <Trophy className="h-3 w-3" />
                                {strava.prs} PR{strava.prs > 1 ? "s" : ""}
                              </div>
                            )}
                            {strava.achievements && strava.achievements > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-yellow-400">
                                <Zap className="h-3 w-3" />
                                {strava.achievements} achievement{strava.achievements > 1 ? "s" : ""}
                              </div>
                            )}
                            {strava.kudos && strava.kudos > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-orange-400">
                                <ThumbsUp className="h-3 w-3" />
                                {strava.kudos} kudo{strava.kudos > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Description (non-Strava or collapsed) */}
                        {entry.description && !strava?.name && (
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                            {entry.description}
                          </p>
                        )}

                        {/* Expand indicator */}
                        {(hasRoute || hasDetailedStats) && (
                          <p className="text-[10px] text-muted-foreground/50 mt-2">
                            {isExpanded ? "Tap to collapse ▲" : "Tap for details ▼"}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(entry);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <ConfirmDelete
                          onConfirm={() => handleDelete(entry.id)}
                          itemName={`${entry.workoutType} workout`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className={cn("border-t border-border/30 p-4 space-y-3 bg-gradient-to-b", cfg.gradient)}>
                      {/* Route map */}
                      {hasRoute && (
                        <RouteMap
                          polyline={strava!.polyline!}
                          width={350}
                          height={160}
                          className="w-full"
                        />
                      )}

                      {/* Detailed stats grid */}
                      {hasDetailedStats && (
                        <div className="grid grid-cols-2 gap-2">
                          {strava?.movingTime && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Timer className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">Moving Time</span>
                              </div>
                              <p className="text-sm font-semibold">{formatDuration(strava.movingTime)}</p>
                            </div>
                          )}

                          {strava?.elapsedTime && strava.movingTime && strava.elapsedTime !== strava.movingTime && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">Elapsed</span>
                              </div>
                              <p className="text-sm font-semibold">{formatDuration(strava.elapsedTime)}</p>
                            </div>
                          )}

                          {strava?.maxHeartrate && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Heart className="h-3 w-3 text-red-400" />
                                <span className="text-[10px] text-muted-foreground">Max HR</span>
                              </div>
                              <p className="text-sm font-semibold">{strava.maxHeartrate} bpm</p>
                            </div>
                          )}

                          {strava?.maxSpeed && strava.maxSpeed > 0 && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp className="h-3 w-3 text-cyan-400" />
                                <span className="text-[10px] text-muted-foreground">Max Speed</span>
                              </div>
                              <p className="text-sm font-semibold">
                                {formatPace(strava.maxSpeed, entry.workoutType) || `${(strava.maxSpeed * 3.6).toFixed(1)} km/h`}
                              </p>
                            </div>
                          )}

                          {strava?.elevHigh != null && strava.elevLow != null && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Mountain className="h-3 w-3 text-emerald-400" />
                                <span className="text-[10px] text-muted-foreground">Elevation Range</span>
                              </div>
                              <p className="text-sm font-semibold">
                                {Math.round(strava.elevLow)}m — {Math.round(strava.elevHigh)}m
                              </p>
                            </div>
                          )}

                          {strava?.avgWatts && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Zap className="h-3 w-3 text-yellow-400" />
                                <span className="text-[10px] text-muted-foreground">Avg Power</span>
                              </div>
                              <p className="text-sm font-semibold">{Math.round(strava.avgWatts)}W</p>
                            </div>
                          )}

                          {strava?.avgCadence && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <RefreshCw className="h-3 w-3 text-violet-400" />
                                <span className="text-[10px] text-muted-foreground">Avg Cadence</span>
                              </div>
                              <p className="text-sm font-semibold">{Math.round(strava.avgCadence)} rpm</p>
                            </div>
                          )}

                          {strava?.sufferScore && (
                            <div className="bg-black/10 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Flame className="h-3 w-3 text-orange-400" />
                                <span className="text-[10px] text-muted-foreground">Suffer Score</span>
                              </div>
                              <p className="text-sm font-semibold">{strava.sufferScore}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Full description for Strava */}
                      {entry.description && strava?.name && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {entry.description}
                        </p>
                      )}

                      {/* Legacy exercise list (manual workouts) */}
                      {entry.exercises && entry.source !== "strava" && entry.exercises.length > 0 && (
                        <div className="space-y-1.5 pl-1 border-l-2 border-border/30">
                          {entry.exercises.map((ex, i) => (
                            <div
                              key={i}
                              className="pl-3 flex items-center gap-2 text-xs"
                            >
                              <span className="font-medium">{ex.name}</span>
                              {ex.sets && (
                                <span className="text-muted-foreground">
                                  {ex.sets}×{ex.reps || "?"}
                                </span>
                              )}
                              {ex.weightKg && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] h-4 px-1"
                                >
                                  {ex.weightKg}kg
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date & Time</Label>
              <Input
                type="datetime-local"
                value={editForm.startedAt}
                onChange={(e) =>
                  setEditForm({ ...editForm, startedAt: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Workout Type</Label>
              <Select
                value={editForm.workoutType}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, workoutType: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(workoutConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.icon} {key.charAt(0).toUpperCase() + key.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={editForm.durationMinutes}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      durationMinutes: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Calories Burned</Label>
                <Input
                  type="number"
                  value={editForm.caloriesBurned}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      caloriesBurned: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label className="flex items-center justify-between">
                Description
                <WhisperButton
                  size="sm"
                  className="h-6 w-6 p-0"
                  onTranscription={(text) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: prev.description
                        ? `${prev.description}\n${text}`
                        : text,
                    }))
                  }
                />
              </Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="Describe your workout — or tap the mic to dictate"
                rows={3}
                className="mt-1"
              />
            </div>
            <Button onClick={handleSaveEdit} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Input */}
      <VoiceInput onDataLogged={() => { invalidateHealthCache(); fetchEntries(); }} />
    </div>
  );
}
