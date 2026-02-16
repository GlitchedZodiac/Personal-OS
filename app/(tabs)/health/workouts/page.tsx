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
import { ArrowLeft, Plus, Clock, Flame, Dumbbell, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCachedFetch, invalidateHealthCache } from "@/lib/cache";

interface Exercise {
  name: string;
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
  exercises: Exercise[] | null;
  source: string;
}

const workoutConfig: Record<
  string,
  { icon: string; color: string; bgColor: string }
> = {
  strength: {
    icon: "💪",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
  },
  cardio: {
    icon: "❤️",
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  run: {
    icon: "🏃",
    color: "text-green-400",
    bgColor: "bg-green-500/10 border-green-500/20",
  },
  walk: {
    icon: "🚶",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  hike: {
    icon: "🥾",
    color: "text-lime-400",
    bgColor: "bg-lime-500/10 border-lime-500/20",
  },
  cycling: {
    icon: "🚴",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  swimming: {
    icon: "🏊",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
  },
  yoga: {
    icon: "🧘",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
  },
  hiit: {
    icon: "🔥",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
  },
  other: {
    icon: "⚡",
    color: "text-gray-400",
    bgColor: "bg-gray-500/10 border-gray-500/20",
  },
};

export default function WorkoutsPage() {
  const { data: entries, loading, refresh: fetchEntries } =
    useCachedFetch<WorkoutEntry[]>("/api/health/workouts", { ttl: 60_000 });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({
    workoutType: "strength",
    durationMinutes: "",
    description: "",
    caloriesBurned: "",
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
      if (res.ok && data.synced > 0) {
        invalidateHealthCache();
        fetchEntries();
      }
    } catch {
      // silent
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
      }
    } catch (error) {
      console.error("Failed to add entry:", error);
    }
  };

  const safeEntries = entries ?? [];

  // Summary
  const totalMinutes = safeEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const totalCalBurned = safeEntries.reduce(
    (sum, e) => sum + (e.caloriesBurned || 0),
    0
  );

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
                <Label>Description</Label>
                <Input
                  value={newEntry.description}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, description: e.target.value })
                  }
                  placeholder="e.g., Upper body - bench press, rows..."
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
              Strava connected — sync your latest activities
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
                      {Math.round(totalCalBurned)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      cal burned
                    </p>
                  </div>
                )}
              </div>
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

            return (
              <Card
                key={entry.id}
                className={cn("border overflow-hidden", cfg.bgColor)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type & date */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{cfg.icon}</span>
                        <span
                          className={cn("font-semibold capitalize", cfg.color)}
                        >
                          {entry.workoutType}
                        </span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {format(new Date(entry.startedAt), "MMM d, h:mm a")}
                        </Badge>
                      </div>

                      {/* Description */}
                      {entry.description && (
                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                          {entry.description}
                        </p>
                      )}

                      {/* Stats row */}
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">
                            {entry.durationMinutes} min
                          </span>
                        </div>
                        {entry.caloriesBurned && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Flame className="h-3.5 w-3.5 text-orange-400" />
                            <span className="font-medium">
                              {Math.round(entry.caloriesBurned)} cal
                            </span>
                          </div>
                        )}
                        {entry.source === "ai" && (
                          <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary">
                            AI
                          </Badge>
                        )}
                        {entry.source === "strava" && (
                          <Badge className="text-[9px] h-4 px-1.5 bg-orange-500/10 text-orange-400">
                            Strava
                          </Badge>
                        )}
                      </div>

                      {/* Exercises */}
                      {entry.exercises && entry.exercises.length > 0 && (
                        <div className="mt-3 space-y-1.5 pl-1 border-l-2 border-border/30">
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

                    {/* Delete */}
                    <ConfirmDelete
                      onConfirm={() => handleDelete(entry.id)}
                      itemName={`${entry.workoutType} workout`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Voice Input */}
      <VoiceInput onDataLogged={() => { invalidateHealthCache(); fetchEntries(); }} />
    </div>
  );
}
