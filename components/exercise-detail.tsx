"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Clock, Dumbbell, Target, X } from "lucide-react";

export interface ExerciseData {
  name: string;
  sets: number;
  reps: number;
  targetWeightKg: number;
  restSeconds: number;
  instructions: string;
  muscleGroup: string;
  imageKey: string;
}

// Static exercise icons/images by category
const EXERCISE_ICONS: Record<string, string> = {
  bench_press: "🏋️",
  squat: "🦵",
  deadlift: "💪",
  overhead_press: "🙆",
  barbell_row: "🚣",
  pull_up: "🧗",
  lat_pulldown: "🔽",
  bicep_curl: "💪",
  tricep_extension: "💪",
  lateral_raise: "🤷",
  leg_press: "🦵",
  leg_curl: "🦵",
  leg_extension: "🦵",
  calf_raise: "🦶",
  plank: "🧘",
  crunch: "🏋️‍♂️",
  cable_fly: "🔄",
  dumbbell_fly: "🦅",
  pushup: "💪",
  lunge: "🚶",
  hip_thrust: "🍑",
  face_pull: "🎯",
  shrug: "🤷",
  dip: "⬇️",
  romanian_deadlift: "💪",
  front_squat: "🦵",
  incline_press: "🏋️",
  decline_press: "🏋️",
  hammer_curl: "🔨",
  preacher_curl: "💪",
  skull_crusher: "💀",
  cable_crossover: "🔄",
  chest_press_machine: "🏋️",
  seated_row: "🚣",
  t_bar_row: "🚣",
  good_morning: "🌅",
  step_up: "⬆️",
  goblet_squat: "🏆",
  kettlebell_swing: "⚡",
  burpee: "🔥",
  mountain_climber: "⛰️",
  battle_ropes: "🪢",
  box_jump: "📦",
  resistance_band: "🔗",
  stretch: "🧘",
  cardio_generic: "❤️",
};

const MUSCLE_GROUP_COLORS: Record<string, string> = {
  chest: "bg-red-500/20 text-red-400 border-red-500/30",
  back: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  legs: "bg-green-500/20 text-green-400 border-green-500/30",
  shoulders: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  arms: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  biceps: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  triceps: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  core: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  glutes: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  calves: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  full_body: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  cardio: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

interface ExerciseDetailProps {
  exercise: ExerciseData | null;
  open: boolean;
  onClose: () => void;
  units?: "metric" | "imperial";
}

export function ExerciseDetail({ exercise, open, onClose, units = "metric" }: ExerciseDetailProps) {
  if (!exercise) return null;

  const icon = EXERCISE_ICONS[exercise.imageKey] || "🏋️";
  const muscleColor = MUSCLE_GROUP_COLORS[exercise.muscleGroup] || MUSCLE_GROUP_COLORS.full_body;
  const weightDisplay = units === "imperial"
    ? `${Math.round(exercise.targetWeightKg * 2.205)} lbs`
    : `${exercise.targetWeightKg} kg`;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-left text-lg">{exercise.name}</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-5 pb-6 overflow-y-auto">
          {/* Exercise icon + muscle group */}
          <div className="flex items-center gap-4">
            <div className="text-5xl w-16 h-16 flex items-center justify-center bg-secondary/30 rounded-2xl">
              {icon}
            </div>
            <div className="space-y-1.5">
              <Badge className={cn("text-xs border", muscleColor)}>
                {exercise.muscleGroup.replace("_", " ")}
              </Badge>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Dumbbell className="h-3 w-3" /> {weightDisplay}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" /> {exercise.sets}×{exercise.reps}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {exercise.restSeconds}s rest
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{exercise.sets}</p>
              <p className="text-[10px] text-muted-foreground">Sets</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{exercise.reps}</p>
              <p className="text-[10px] text-muted-foreground">Reps</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{weightDisplay.split(" ")[0]}</p>
              <p className="text-[10px] text-muted-foreground">{units === "imperial" ? "lbs" : "kg"}</p>
            </div>
          </div>

          {/* Estimated volume */}
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Volume</span>
              <span className="text-sm font-bold">
                {(exercise.sets * exercise.reps * exercise.targetWeightKg).toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">kg</span>
              </span>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              📋 How To Perform
            </h3>
            <div className="bg-secondary/20 rounded-xl p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {exercise.instructions}
              </p>
            </div>
          </div>

          {/* Tips */}
          <div>
            <h3 className="text-sm font-semibold mb-2">💡 Quick Tips</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Rest {exercise.restSeconds} seconds between sets for optimal recovery</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Focus on controlled movement — don&apos;t rush the reps</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>If you can complete all sets easily, increase weight next session</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>If you can&apos;t complete the target reps, reduce weight slightly</span>
              </li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Compact exercise card used in the workout day view */
export function ExerciseCard({
  exercise,
  index,
  onClick,
  units = "metric",
}: {
  exercise: ExerciseData;
  index: number;
  onClick: () => void;
  units?: "metric" | "imperial";
}) {
  const icon = EXERCISE_ICONS[exercise.imageKey] || "🏋️";
  const muscleColor = MUSCLE_GROUP_COLORS[exercise.muscleGroup] || MUSCLE_GROUP_COLORS.full_body;
  const weightDisplay = units === "imperial"
    ? `${Math.round(exercise.targetWeightKg * 2.205)} lbs`
    : `${exercise.targetWeightKg} kg`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors group"
    >
      <div className="text-2xl w-10 h-10 flex items-center justify-center bg-secondary/40 rounded-lg group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{exercise.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {exercise.sets}×{exercise.reps}
          </span>
          <span className="text-xs font-medium">{weightDisplay}</span>
          <Badge className={cn("text-[9px] h-4 px-1.5 border", muscleColor)}>
            {exercise.muscleGroup}
          </Badge>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        tap for details →
      </span>
    </button>
  );
}
