"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Play,
  Pause,
  Square,
  Check,
  Clock,
  Flame,
  Trophy,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Timer,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Calorie Estimation ─────────────────────────────────────────────
// MET values for common exercises
const MET_VALUES: Record<string, number> = {
  strength: 5.0,
  cardio: 7.0,
  run: 9.8,
  walk: 3.5,
  hike: 6.0,
  cycling: 7.5,
  swimming: 8.0,
  yoga: 3.0,
  hiit: 8.0,
  other: 5.0,
};

/** Estimate calories burned: MET * weight(kg) * hours */
export function estimateCaloriesBurned(
  workoutType: string,
  durationMinutes: number,
  bodyWeightKg: number = 80 // default if unknown
): number {
  const met = MET_VALUES[workoutType] || MET_VALUES.other;
  return Math.round(met * bodyWeightKg * (durationMinutes / 60));
}

// ─── Types ──────────────────────────────────────────────────────────

interface ExerciseData {
  name: string;
  sets: number;
  reps: string | number;
  targetWeightKg?: number;
  restSeconds?: number;
}

interface SetLog {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed: boolean;
}

interface ExerciseLog {
  name: string;
  sets: SetLog[];
  personalRecord?: boolean;
}

interface ActiveWorkoutProps {
  exercises: ExerciseData[];
  dayLabel: string;
  estimatedDuration: number;
  estimatedCalories: number;
  workoutType?: string;
  onComplete: (data: {
    durationMinutes: number;
    caloriesBurned: number;
    actualExercises: ExerciseLog[];
    completedSets: number;
    totalSets: number;
  }) => void;
  onCancel: () => void;
  personalRecords?: Record<string, { weight: number; reps: number; date: string }>;
}

// ─── Timer Display ──────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Rest Timer ─────────────────────────────────────────────────────

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);

  const pct = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <Timer className="h-5 w-5 text-blue-400" />
      <p className="text-3xl font-bold font-mono text-blue-400">{formatTime(remaining)}</p>
      <div className="w-32 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-blue-400 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={onDone}>
        <SkipForward className="h-3 w-3" /> Skip Rest
      </Button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ActiveWorkout({
  exercises,
  dayLabel,
  estimatedDuration,
  estimatedCalories,
  workoutType = "strength",
  onComplete,
  onCancel,
  personalRecords = {},
}: ActiveWorkoutProps) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>(() =>
    exercises.map((ex) => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        setNumber: i + 1,
        reps: typeof ex.reps === "number" ? ex.reps : parseInt(String(ex.reps)) || 10,
        weightKg: ex.targetWeightKg || 0,
        completed: false,
      })),
    }))
  );
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const [newPRs, setNewPRs] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, isPaused]);

  const startWorkout = () => {
    setIsActive(true);
    setIsPaused(false);
  };

  const togglePause = () => setIsPaused((p) => !p);

  // Complete a set
  const completeSet = useCallback(
    (exIndex: number, setIndex: number) => {
      setExerciseLogs((prev) => {
        const next = [...prev];
        const exercise = { ...next[exIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], completed: true };
        exercise.sets = sets;
        next[exIndex] = exercise;

        // Check for PR
        const completedSet = sets[setIndex];
        const prKey = exercise.name.toLowerCase();
        const currentPR = personalRecords[prKey];
        if (
          completedSet.weightKg > 0 &&
          (!currentPR || completedSet.weightKg > currentPR.weight)
        ) {
          exercise.personalRecord = true;
          setNewPRs((prs) => [...new Set([...prs, exercise.name])]);
        }

        return next;
      });

      // Show rest timer after completing a set (not on last set of exercise)
      const exercise = exercises[exIndex];
      if (setIndex < exercise.sets - 1) {
        setRestDuration(exercise.restSeconds || 90);
        setShowRestTimer(true);
      }
    },
    [exercises, personalRecords]
  );

  // Update set values
  const updateSet = (exIndex: number, setIndex: number, field: "reps" | "weightKg", value: number) => {
    setExerciseLogs((prev) => {
      const next = [...prev];
      const exercise = { ...next[exIndex] };
      const sets = [...exercise.sets];
      sets[setIndex] = { ...sets[setIndex], [field]: value };
      exercise.sets = sets;
      next[exIndex] = exercise;
      return next;
    });
  };

  const totalSets = exerciseLogs.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exerciseLogs.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );
  const progressPct = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const handleFinish = () => {
    const durationMinutes = Math.ceil(elapsed / 60);
    const caloriesBurned = estimateCaloriesBurned(workoutType, durationMinutes);

    onComplete({
      durationMinutes,
      caloriesBurned,
      actualExercises: exerciseLogs,
      completedSets,
      totalSets,
    });

    if (newPRs.length > 0) {
      toast.success(`New PR${newPRs.length > 1 ? "s" : ""}! ${newPRs.join(", ")} 🏆`);
    }
  };

  const currentExercise = exercises[currentExIndex];
  const currentLog = exerciseLogs[currentExIndex];

  // ─── Pre-start screen ───────────────────────────────────────────
  if (!isActive) {
    return (
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="p-5 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-bold">{dayLabel}</h3>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> ~{estimatedDuration} min
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3" /> ~{estimatedCalories} cal
              </span>
              <span className="flex items-center gap-1">
                <Dumbbell className="h-3 w-3" /> {exercises.length} exercises
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/20 text-sm">
                <span className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">
                  {i + 1}
                </span>
                <span className="flex-1 font-medium">{ex.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ex.sets}×{ex.reps}
                  {ex.targetWeightKg ? ` @ ${ex.targetWeightKg}kg` : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button onClick={startWorkout} className="flex-1 gap-2">
              <Play className="h-4 w-4" /> Start Workout
            </Button>
            <Button onClick={onCancel} variant="outline" className="px-4">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Active workout ──────────────────────────────────────────────
  return (
    <Card className="border-green-500/20 bg-green-500/5">
      <CardContent className="p-4 space-y-4">
        {/* Timer + Progress Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold font-mono">{formatTime(elapsed)}</p>
            <p className="text-[10px] text-muted-foreground">
              {completedSets}/{totalSets} sets • {Math.round(estimateCaloriesBurned(workoutType, Math.ceil(elapsed / 60)))} cal
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={togglePause}
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              onClick={handleFinish}
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full bg-green-600 hover:bg-green-700"
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Rest Timer Overlay */}
        {showRestTimer && (
          <RestTimer seconds={restDuration} onDone={() => setShowRestTimer(false)} />
        )}

        {/* PR Alerts */}
        {newPRs.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-400">New Personal Record!</p>
              <p className="text-[10px] text-muted-foreground">{newPRs.join(", ")}</p>
            </div>
          </div>
        )}

        {/* Exercise Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {exercises.map((ex, i) => {
            const log = exerciseLogs[i];
            const allDone = log.sets.every((s) => s.completed);
            const someDone = log.sets.some((s) => s.completed);
            return (
              <button
                key={i}
                onClick={() => setCurrentExIndex(i)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                  i === currentExIndex
                    ? "bg-primary text-primary-foreground"
                    : allDone
                    ? "bg-green-500/20 text-green-400"
                    : someDone
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-secondary/30 text-muted-foreground"
                )}
              >
                {allDone && <Check className="h-3 w-3 inline mr-1" />}
                {ex.name.length > 12 ? ex.name.slice(0, 12) + "…" : ex.name}
              </button>
            );
          })}
        </div>

        {/* Current Exercise Detail */}
        {currentExercise && currentLog && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{currentExercise.name}</h4>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentExIndex === 0}
                  onClick={() => setCurrentExIndex((i) => i - 1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentExIndex === exercises.length - 1}
                  onClick={() => setCurrentExIndex((i) => i + 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* PR reference */}
            {personalRecords[currentExercise.name.toLowerCase()] && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Trophy className="h-3 w-3 text-amber-400" />
                PR: {personalRecords[currentExercise.name.toLowerCase()].weight}kg ×{" "}
                {personalRecords[currentExercise.name.toLowerCase()].reps}
              </p>
            )}

            {/* Set rows */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 text-[10px] text-muted-foreground px-1">
                <span>Set</span>
                <span>Weight (kg)</span>
                <span>Reps</span>
                <span></span>
              </div>
              {currentLog.sets.map((set, si) => (
                <div
                  key={si}
                  className={cn(
                    "grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 items-center px-1 py-1.5 rounded-lg transition-colors",
                    set.completed ? "bg-green-500/10" : "bg-secondary/20"
                  )}
                >
                  <span className="text-xs font-bold text-center">{set.setNumber}</span>
                  <Input
                    type="number"
                    value={set.weightKg || ""}
                    onChange={(e) =>
                      updateSet(currentExIndex, si, "weightKg", parseFloat(e.target.value) || 0)
                    }
                    className="h-8 text-center text-sm"
                    disabled={set.completed}
                  />
                  <Input
                    type="number"
                    value={set.reps || ""}
                    onChange={(e) =>
                      updateSet(currentExIndex, si, "reps", parseInt(e.target.value) || 0)
                    }
                    className="h-8 text-center text-sm"
                    disabled={set.completed}
                  />
                  <Button
                    onClick={() => completeSet(currentExIndex, si)}
                    disabled={set.completed}
                    variant={set.completed ? "default" : "outline"}
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      set.completed && "bg-green-600 hover:bg-green-700"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
