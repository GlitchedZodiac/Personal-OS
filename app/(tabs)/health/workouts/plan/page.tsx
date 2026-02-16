"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Loader2,
  Mic,
  Sparkles,
  Target,
  Trophy,
  TrendingUp,
  User,
  XCircle,
  Zap,
  Bot,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import {
  ExerciseCard,
  ExerciseDetail,
  type ExerciseData,
} from "@/components/exercise-detail";
import {
  WorkoutVoiceInput,
  type ChatMessage,
  type WorkoutChatResponse,
} from "@/components/workout-voice-input";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isBefore,
} from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────

interface ScheduleDay {
  dayIndex: number;
  label: string;
  workoutType: string;
  estimatedDuration: number;
  estimatedCalories: number;
  warmup?: string;
  exercises: ExerciseData[];
}

interface WorkoutPlan {
  id: string;
  name: string;
  goal: string;
  fitnessLevel: string;
  daysPerWeek: number;
  schedule: ScheduleDay[];
  isActive: boolean;
  completions: Completion[];
}

interface Completion {
  id: string;
  planId: string;
  scheduledDate: string;
  dayIndex: number;
  dayLabel: string;
  completed: boolean;
  feedback: string | null;
  actualExercises: ExerciseData[] | null;
  caloriesBurned: number | null;
  durationMinutes: number | null;
  userNotes: string | null;
  aiSuggestion: string | null;
}

interface StreakData {
  currentStreak: number;
  totalWorkouts: number;
  thisWeek: number;
  thisMonth: number;
}

interface TrendData {
  volumeTrend: Array<{
    date: string;
    totalVolume: number;
    caloriesBurned: number;
  }>;
  personalRecords: Record<
    string,
    { weight: number; date: string; reps: number }
  >;
  totalCompletions: number;
}

// ─── Helper: Map schedule days to calendar week days ────────────────

function getScheduledDaysForWeek(
  schedule: ScheduleDay[],
  weekStart: Date,
  daysPerWeek: number
): Array<{ date: Date; scheduleDay: ScheduleDay | null }> {
  const dayMap: number[] = [];
  if (daysPerWeek === 2) dayMap.push(1, 4);
  else if (daysPerWeek === 3) dayMap.push(1, 3, 5);
  else if (daysPerWeek === 4) dayMap.push(0, 1, 3, 4);
  else if (daysPerWeek === 5) dayMap.push(0, 1, 2, 3, 4);
  else if (daysPerWeek === 6) dayMap.push(0, 1, 2, 3, 4, 5);
  else dayMap.push(0, 2, 4);

  const week: Array<{ date: Date; scheduleDay: ScheduleDay | null }> = [];
  let scheduleIdx = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (dayMap.includes(i) && scheduleIdx < schedule.length) {
      week.push({ date, scheduleDay: schedule[scheduleIdx] });
      scheduleIdx++;
    } else {
      week.push({ date, scheduleDay: null });
    }
  }

  return week;
}

// ─── Conversation bubble ────────────────────────────────────────────

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-primary/20" : "bg-purple-500/20"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-purple-400" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md"
            : "bg-secondary/60 text-foreground rounded-tl-md"
        )}
      >
        {content}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function WorkoutPlanPage() {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<{
    date: Date;
    scheduleDay: ScheduleDay;
  } | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseData | null>(
    null
  );
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0,
    totalWorkouts: 0,
    thisWeek: 0,
    thisMonth: 0,
  });
  const [trends, setTrends] = useState<TrendData>({
    volumeTrend: [],
    personalRecords: {},
    totalCompletions: 0,
  });
  const [units, setUnits] = useState<"metric" | "imperial">("metric");

  // ─── Conversation state (persisted to sessionStorage) ──────────
  const CHAT_STORAGE_KEY = "workout-plan-chat";
  const [conversation, setConversation] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem(CHAT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [pendingPlan, setPendingPlan] = useState<WorkoutChatResponse | null>(
    null
  );
  const [savingPlan, setSavingPlan] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persist conversation to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversation));
    } catch {
      // sessionStorage full or unavailable — ignore
    }
  }, [conversation]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/health/workout-plan?active=true");
      if (res.ok) {
        const plans = await res.json();
        if (Array.isArray(plans) && plans.length > 0) {
          setPlan(plans[0]);
          fetchTrends(plans[0].id);
        } else {
          setPlan(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch plan:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStreak = useCallback(async () => {
    try {
      const res = await fetch("/api/health/workout-plan/streak");
      if (res.ok) {
        const data = await res.json();
        setStreak(data);
      }
    } catch (error) {
      console.error("Failed to fetch streak:", error);
    }
  }, []);

  const fetchTrends = async (planId: string) => {
    try {
      const res = await fetch(
        `/api/health/workout-plan/trends?planId=${planId}`
      );
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (error) {
      console.error("Failed to fetch trends:", error);
    }
  };

  useEffect(() => {
    const settings = getSettings();
    setUnits(settings.units);
    fetchPlan();
    fetchStreak();
  }, [fetchPlan, fetchStreak]);

  // ─── Handle AI response ────────────────────────────────────────

  const handleAIResponse = useCallback(
    async (response: WorkoutChatResponse, userMessage: string) => {
      // Add user message to conversation
      setConversation((prev) => [
        ...prev,
        { role: "user", content: userMessage },
      ]);

      if (response.type === "generate_plan" && response.schedule) {
        // Show the plan and ask for confirmation
        setPendingPlan(response);
        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: response.message },
        ]);
      } else if (response.type === "modify_plan" && response.updatedSchedule) {
        // Auto-save modification
        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: response.message },
        ]);

        if (plan) {
          try {
            await fetch("/api/health/workout-plan", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: plan.id,
                schedule: response.updatedSchedule,
              }),
            });
            toast.success("Plan updated!");
            fetchPlan();
          } catch {
            toast.error("Failed to save changes.");
          }
        }
      } else if (response.type === "log_feedback") {
        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: response.message },
        ]);

        // Apply suggested adjustments to plan if any
        if (response.suggestedAdjustments && plan && response.dayIndex !== undefined) {
          const updatedSchedule = [...plan.schedule];
          const dayToUpdate = updatedSchedule[response.dayIndex];
          if (dayToUpdate) {
            const updatedExercises = dayToUpdate.exercises.map((ex) => {
              const adj = response.suggestedAdjustments?.find(
                (a) =>
                  a.exerciseName.toLowerCase() === ex.name.toLowerCase()
              );
              if (adj) {
                return {
                  ...ex,
                  targetWeightKg: adj.newWeightKg ?? ex.targetWeightKg,
                  sets: adj.newSets ?? ex.sets,
                  reps: adj.newReps ?? ex.reps,
                };
              }
              return ex;
            });

            updatedSchedule[response.dayIndex] = {
              ...dayToUpdate,
              exercises: updatedExercises,
            };

            try {
              await fetch("/api/health/workout-plan", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: plan.id,
                  schedule: updatedSchedule,
                }),
              });
              toast.success("Progressive adjustments applied!");
              fetchPlan();
            } catch {
              toast.error("Failed to apply adjustments.");
            }
          }
        }
      } else {
        // answer type
        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: response.message },
        ]);
      }
    },
    [plan, fetchPlan]
  );

  // ─── Save generated plan ───────────────────────────────────────

  const handleAcceptPlan = async () => {
    if (!pendingPlan) return;
    setSavingPlan(true);

    try {
      const saveRes = await fetch("/api/health/workout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pendingPlan.name || "AI Training Plan",
          goal: pendingPlan.goal || "general_fitness",
          fitnessLevel: pendingPlan.fitnessLevel || "intermediate",
          daysPerWeek: pendingPlan.daysPerWeek || 3,
          schedule: pendingPlan.schedule,
          aiGenerated: true,
        }),
      });

      if (saveRes.ok) {
        toast.success("Workout plan saved! Let's get to work 💪");
        setPendingPlan(null);
        setConversation([]);
        try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
        fetchPlan();
        fetchStreak();
      } else {
        toast.error("Failed to save plan.");
      }
    } catch {
      toast.error("Failed to save plan.");
    } finally {
      setSavingPlan(false);
    }
  };

  // ─── Complete a workout day ────────────────────────────────────

  const handleComplete = async (date: Date, scheduleDay: ScheduleDay) => {
    if (!plan) return;

    try {
      const res = await fetch("/api/health/workout-plan/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          scheduledDate: date.toISOString(),
          dayIndex: scheduleDay.dayIndex,
          dayLabel: scheduleDay.label,
          completed: true,
          actualExercises: scheduleDay.exercises,
          caloriesBurned: scheduleDay.estimatedCalories,
          durationMinutes: scheduleDay.estimatedDuration,
        }),
      });

      if (res.ok) {
        toast.success("Workout completed! 💪");
        fetchPlan();
        fetchStreak();
      }
    } catch (error) {
      console.error("Complete error:", error);
      toast.error("Failed to save completion");
    }
  };

  // Calendar helpers
  const now = new Date();
  const currentWeekStart = startOfWeek(addDays(now, weekOffset * 7), {
    weekStartsOn: 1,
  });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

  const scheduledWeek = plan
    ? getScheduledDaysForWeek(
        plan.schedule,
        currentWeekStart,
        plan.daysPerWeek
      )
    : [];

  const isCompletedOnDate = (date: Date, dayIndex: number): boolean => {
    if (!plan) return false;
    return plan.completions.some(
      (c) =>
        c.dayIndex === dayIndex &&
        isSameDay(new Date(c.scheduledDate), date) &&
        c.completed
    );
  };

  const prCount = Object.keys(trends.personalRecords).length;

  // ─── Loading State ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 pt-12 pb-36 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading workout plan...
          </p>
        </div>
      </div>
    );
  }

  // ─── No Plan State — Voice-first ──────────────────────────────

  if (!plan && !pendingPlan) {
    return (
      <div className="px-4 pt-12 pb-36 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/health/workouts">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Workout Plan</h1>
            <p className="text-xs text-muted-foreground">
              AI-powered training
            </p>
          </div>
        </div>

        {/* Conversation history */}
        {conversation.length > 0 ? (
          <div className="space-y-3">
            {conversation.map((msg, i) => (
              <ChatBubble key={i} role={msg.role} content={msg.content} />
            ))}
            <div ref={chatEndRef} />
          </div>
        ) : (
          /* Empty state — encourage voice interaction */
          <Card className="border-dashed border-purple-500/20">
            <CardContent className="py-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Mic className="h-8 w-8 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Tell me what you want</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Just talk or type — I&apos;ll build your plan.
                </p>
              </div>

              {/* Example prompts */}
              <div className="space-y-2 text-left max-w-xs mx-auto">
                <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide text-center mb-2">
                  Try saying something like:
                </p>
                {[
                  "I want to build muscle, 4 days a week, I have a full gym",
                  "Create a 3-day beginner plan with just dumbbells",
                  "I want to lose weight, I can train 5 days, 30 min each",
                  "Quiero ganar músculo, 4 días, tengo un gym completo",
                ].map((example, i) => (
                  <button
                    key={i}
                    className="w-full text-left text-xs text-muted-foreground bg-secondary/30 hover:bg-secondary/50 rounded-xl px-3 py-2.5 transition-colors"
                    onClick={async () => {
                      // Send example as text
                      const settings = getSettings();
                      setConversation((prev) => [
                        ...prev,
                        { role: "user", content: example },
                      ]);

                      try {
                        const res = await fetch(
                          "/api/health/workout-plan/chat",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              message: example,
                              conversationHistory: conversation,
                              currentPlan: null,
                              customInstructions:
                                settings.aiInstructions?.health || "",
                              aiLanguage: settings.aiLanguage || "english",
                            }),
                          }
                        );
                        if (res.ok) {
                          const response: WorkoutChatResponse =
                            await res.json();
                          // Don't double-add the user message
                          if (
                            response.type === "generate_plan" &&
                            response.schedule
                          ) {
                            setPendingPlan(response);
                            setConversation((prev) => [
                              ...prev,
                              {
                                role: "assistant",
                                content: response.message,
                              },
                            ]);
                          } else {
                            setConversation((prev) => [
                              ...prev,
                              {
                                role: "assistant",
                                content: response.message,
                              },
                            ]);
                          }
                        }
                      } catch {
                        toast.error("Failed to process. Try again.");
                      }
                    }}
                  >
                    &ldquo;{example}&rdquo;
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Voice input */}
        <WorkoutVoiceInput
          currentPlan={null}
          conversationHistory={conversation}
          onResponse={handleAIResponse}
        />
      </div>
    );
  }

  // ─── Pending plan confirmation ─────────────────────────────────

  if (pendingPlan && !plan) {
    const pendingSchedule = (pendingPlan.schedule || []) as ScheduleDay[];
    return (
      <div className="px-4 pt-12 pb-36 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/health/workouts">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">
              {pendingPlan.name || "New Plan"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Review your AI-generated plan
            </p>
          </div>
        </div>

        {/* Conversation + AI message */}
        <div className="space-y-3">
          {conversation.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Plan preview */}
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              Plan Preview
            </CardTitle>
            <div className="flex gap-2 mt-1">
              {pendingPlan.goal && (
                <Badge variant="outline" className="text-[10px]">
                  {pendingPlan.goal}
                </Badge>
              )}
              {pendingPlan.fitnessLevel && (
                <Badge variant="outline" className="text-[10px]">
                  {pendingPlan.fitnessLevel}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {pendingPlan.daysPerWeek} days/week
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingSchedule.map((day, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">
                  D{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{day.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {day.exercises?.length || 0} exercises •{" "}
                    ~{day.estimatedDuration}min •{" "}
                    ~{day.estimatedCalories} cal
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Accept / Reject */}
        <div className="flex gap-3">
          <Button
            onClick={handleAcceptPlan}
            disabled={savingPlan}
            className="flex-1 gap-2"
          >
            {savingPlan ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Accept Plan
          </Button>
          <Button
            onClick={() => {
              setPendingPlan(null);
              setConversation((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "No problem! Tell me what you'd like to change and I'll adjust.",
                },
              ]);
            }}
            variant="outline"
            className="flex-1 gap-2"
          >
            <XCircle className="h-4 w-4" />
            Adjust
          </Button>
        </div>

        {/* Voice input — to ask for modifications */}
        <WorkoutVoiceInput
          currentPlan={null}
          conversationHistory={conversation}
          onResponse={handleAIResponse}
        />
      </div>
    );
  }

  // ─── Main Plan View ────────────────────────────────────────────

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/health/workouts">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{plan!.name}</h1>
          <p className="text-xs text-muted-foreground">
            {plan!.daysPerWeek} days/week • {plan!.fitnessLevel} •{" "}
            {plan!.goal.replace("_", " ")}
          </p>
        </div>
      </div>

      {/* Streak + Stats Row */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-orange-400">
              {streak.currentStreak}
            </p>
            <p className="text-[9px] text-muted-foreground">🔥 Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{streak.thisWeek}</p>
            <p className="text-[9px] text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{streak.thisMonth}</p>
            <p className="text-[9px] text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-purple-400">
              {streak.totalWorkouts}
            </p>
            <p className="text-[9px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              Weekly Schedule
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setWeekOffset((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setWeekOffset(0)}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setWeekOffset((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {format(currentWeekStart, "MMM d")} —{" "}
            {format(currentWeekEnd, "MMM d, yyyy")}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5">
            {scheduledWeek.map(({ date, scheduleDay }, i) => {
              const isScheduled = scheduleDay !== null;
              const completed = scheduleDay
                ? isCompletedOnDate(date, scheduleDay.dayIndex)
                : false;
              const isPast = isBefore(date, new Date()) && !isToday(date);
              const today = isToday(date);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (isScheduled && scheduleDay) {
                      setSelectedDay({ date, scheduleDay });
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all",
                    today && "ring-2 ring-primary/50",
                    isScheduled &&
                      !completed &&
                      "bg-purple-500/10 hover:bg-purple-500/20",
                    completed && "bg-green-500/10",
                    !isScheduled && "opacity-50",
                    isPast &&
                      !completed &&
                      isScheduled &&
                      "bg-red-500/5 opacity-70"
                  )}
                  disabled={!isScheduled}
                >
                  <span className="text-[9px] text-muted-foreground">
                    {format(date, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      today && "text-primary",
                      completed && "text-green-400"
                    )}
                  >
                    {format(date, "d")}
                  </span>
                  {isScheduled && (
                    <div className="h-4 w-4 flex items-center justify-center">
                      {completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <Dumbbell className="h-3 w-3 text-purple-400" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Detail */}
      {selectedDay && (
        <Card className="border-purple-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {selectedDay.scheduleDay.label}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedDay(null)}
              >
                Close
              </Button>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> ~
                {selectedDay.scheduleDay.estimatedDuration} min
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3" /> ~
                {selectedDay.scheduleDay.estimatedCalories} cal
              </span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />{" "}
                {selectedDay.scheduleDay.exercises.length} exercises
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedDay.scheduleDay.warmup && (
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 mb-3">
                <p className="text-xs font-medium text-amber-400 mb-1">
                  🔥 Warm-up
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedDay.scheduleDay.warmup}
                </p>
              </div>
            )}

            {selectedDay.scheduleDay.exercises.map((ex, i) => (
              <ExerciseCard
                key={i}
                exercise={ex}
                index={i}
                onClick={() => setSelectedExercise(ex)}
                units={units}
              />
            ))}

            {isCompletedOnDate(
              selectedDay.date,
              selectedDay.scheduleDay.dayIndex
            ) ? (
              <div className="flex items-center justify-center gap-2 py-3 text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Completed!</span>
              </div>
            ) : (
              <Button
                className="w-full gap-2 mt-2"
                onClick={() =>
                  handleComplete(selectedDay.date, selectedDay.scheduleDay)
                }
              >
                <Check className="h-4 w-4" />
                Mark as Complete
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Conversation history (if any messages) */}
      {conversation.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-500" />
              AI Trainer Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-60 overflow-y-auto">
            {conversation.map((msg, i) => (
              <ChatBubble key={i} role={msg.role} content={msg.content} />
            ))}
            <div ref={chatEndRef} />
          </CardContent>
        </Card>
      )}

      {/* Personal Records */}
      {prCount > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Personal Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(trends.personalRecords)
                .slice(0, 5)
                .map(([name, pr]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground truncate flex-1">
                      {name}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-bold">
                        {units === "imperial"
                          ? `${Math.round(pr.weight * 2.205)} lbs`
                          : `${pr.weight} kg`}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        ×{pr.reps}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volume Trend */}
      {trends.volumeTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Recent Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trends.volumeTrend.slice(-5).map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{t.date}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-blue-400" />
                      {t.totalVolume.toLocaleString()} vol
                    </span>
                    {t.caloriesBurned > 0 && (
                      <span className="flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-400" />
                        {Math.round(t.caloriesBurned)} cal
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Overview - All Days */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-purple-500" />
            Plan Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan!.schedule.map((day, i) => (
            <button
              key={i}
              type="button"
              onClick={() =>
                setSelectedDay({ date: new Date(), scheduleDay: day })
              }
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">
                D{day.dayIndex + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{day.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {day.exercises.length} exercises • ~{day.estimatedDuration}min
                  • ~{day.estimatedCalories} cal
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Exercise Detail Sheet */}
      <ExerciseDetail
        exercise={selectedExercise}
        open={!!selectedExercise}
        onClose={() => setSelectedExercise(null)}
        units={units}
      />

      {/* Voice input — always available at bottom */}
      <WorkoutVoiceInput
        currentPlan={plan}
        conversationHistory={conversation}
        onResponse={handleAIResponse}
      />
    </div>
  );
}
