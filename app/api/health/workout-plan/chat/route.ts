import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

/**
 * Conversational AI endpoint for workout planning.
 * The user speaks naturally and AI decides what to do:
 *   - generate_plan: Build a new workout plan from scratch
 *   - modify_plan: Adjust the current plan
 *   - log_feedback: User completed a workout and is reporting how it went
 *   - answer: General question / advice about training
 */

const WORKOUT_CHAT_FUNCTIONS = [
  {
    name: "generate_plan",
    description:
      "Generate a complete new workout training plan based on what the user described. Use this when the user is describing their goals, preferences, available equipment, schedule, or asking for a new plan.",
    parameters: {
      type: "object" as const,
      properties: {
        name: {
          type: "string" as const,
          description: "A short descriptive name for the plan, e.g. '4-Day Push/Pull/Legs'",
        },
        goal: {
          type: "string" as const,
          description: "Primary goal extracted from conversation",
        },
        fitnessLevel: {
          type: "string" as const,
          enum: ["beginner", "intermediate", "advanced"],
          description: "Inferred fitness level from what user said",
        },
        daysPerWeek: {
          type: "number" as const,
          description: "How many days per week the user wants to train",
        },
        schedule: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              dayIndex: { type: "number" as const },
              label: { type: "string" as const, description: "e.g. 'Day 1 - Push (Chest, Shoulders, Triceps)'" },
              workoutType: { type: "string" as const },
              estimatedDuration: { type: "number" as const, description: "Minutes" },
              estimatedCalories: { type: "number" as const },
              warmup: { type: "string" as const, description: "Brief warmup instructions" },
              exercises: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  properties: {
                    name: { type: "string" as const, description: "Clear exercise name" },
                    sets: { type: "number" as const },
                    reps: { type: "number" as const },
                    targetWeightKg: { type: "number" as const, description: "Starting weight in kg" },
                    restSeconds: { type: "number" as const },
                    instructions: { type: "string" as const, description: "Step-by-step form instructions" },
                    muscleGroup: { type: "string" as const },
                    imageKey: { type: "string" as const },
                  },
                  required: ["name", "sets", "reps", "targetWeightKg", "restSeconds", "instructions", "muscleGroup", "imageKey"],
                },
              },
            },
            required: ["dayIndex", "label", "workoutType", "estimatedDuration", "estimatedCalories", "exercises"],
          },
          description: "Array of workout days with exercises",
        },
        message: {
          type: "string" as const,
          description: "Friendly confirmation message to the user summarizing the plan. Be encouraging.",
        },
      },
      required: ["name", "goal", "fitnessLevel", "daysPerWeek", "schedule", "message"],
    },
  },
  {
    name: "modify_plan",
    description:
      "Modify the user's existing workout plan. Use this when the user wants to change specific exercises, swap days, adjust weights/reps, or tweak the current plan.",
    parameters: {
      type: "object" as const,
      properties: {
        updatedSchedule: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              dayIndex: { type: "number" as const },
              label: { type: "string" as const },
              workoutType: { type: "string" as const },
              estimatedDuration: { type: "number" as const },
              estimatedCalories: { type: "number" as const },
              warmup: { type: "string" as const },
              exercises: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  properties: {
                    name: { type: "string" as const },
                    sets: { type: "number" as const },
                    reps: { type: "number" as const },
                    targetWeightKg: { type: "number" as const },
                    restSeconds: { type: "number" as const },
                    instructions: { type: "string" as const },
                    muscleGroup: { type: "string" as const },
                    imageKey: { type: "string" as const },
                  },
                  required: ["name", "sets", "reps", "targetWeightKg", "restSeconds", "instructions", "muscleGroup", "imageKey"],
                },
              },
            },
            required: ["dayIndex", "label", "workoutType", "estimatedDuration", "estimatedCalories", "exercises"],
          },
          description: "The FULL updated schedule (all days, not just the changed ones)",
        },
        message: {
          type: "string" as const,
          description: "Friendly message explaining what was changed",
        },
      },
      required: ["updatedSchedule", "message"],
    },
  },
  {
    name: "log_feedback",
    description:
      "The user is reporting how a workout went (completed, too easy, too hard, skipped, etc.). Use this to record feedback and suggest progressive adjustments.",
    parameters: {
      type: "object" as const,
      properties: {
        dayIndex: {
          type: "number" as const,
          description: "Which day of the plan they're reporting on (0-based). Infer from context.",
        },
        feedback: {
          type: "string" as const,
          enum: ["as_planned", "exceeded", "incomplete"],
          description: "How the workout went",
        },
        userSummary: {
          type: "string" as const,
          description: "Brief summary of what the user said about the workout",
        },
        suggestedAdjustments: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              exerciseName: { type: "string" as const },
              newWeightKg: { type: "number" as const },
              newSets: { type: "number" as const },
              newReps: { type: "number" as const },
            },
          },
          description: "Suggested weight/rep adjustments based on feedback",
        },
        message: {
          type: "string" as const,
          description: "Encouraging response + explanation of suggested adjustments",
        },
      },
      required: ["feedback", "message"],
    },
  },
  {
    name: "answer",
    description:
      "Respond to general training questions, advice, or conversation that doesn't directly create/modify a plan or log feedback.",
    parameters: {
      type: "object" as const,
      properties: {
        message: {
          type: "string" as const,
          description: "Helpful, concise response about training/workouts (2-3 sentences max for mobile)",
        },
      },
      required: ["message"],
    },
  },
];

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, currentPlan, customInstructions, aiLanguage } =
      await request.json();

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const planContext = currentPlan
      ? `\n\nUSER'S CURRENT ACTIVE PLAN:\nName: ${currentPlan.name}\nGoal: ${currentPlan.goal}\nFitness Level: ${currentPlan.fitnessLevel}\nDays/Week: ${currentPlan.daysPerWeek}\nSchedule:\n${JSON.stringify(currentPlan.schedule, null, 1)}`
      : "\n\nThe user does NOT have an active workout plan yet.";

    // Fetch recent workout logs for context (last 14 days)
    let recentWorkoutsContext = "";
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const recentLogs = await prisma.workoutLog.findMany({
        where: { startedAt: { gte: twoWeeksAgo } },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          startedAt: true,
          workoutType: true,
          durationMinutes: true,
          description: true,
          caloriesBurned: true,
          source: true,
        },
      });
      if (recentLogs.length > 0) {
        const logLines = recentLogs.map((l) => {
          const date = l.startedAt.toISOString().split("T")[0];
          const desc = l.description ? ` — ${l.description}` : "";
          return `  ${date}: ${l.workoutType} ${l.durationMinutes}min${l.caloriesBurned ? ` (${Math.round(l.caloriesBurned)} cal)` : ""} [${l.source}]${desc}`;
        });
        recentWorkoutsContext = `\n\nUSER'S RECENT WORKOUT HISTORY (last 14 days):\n${logLines.join("\n")}\n\nUse this history to understand what the user has actually been doing. If their logged workouts differ from the plan (e.g. they did a hike instead of strength day), adapt suggestions accordingly. Their descriptions contain valuable feedback — use them to fine-tune the plan.`;
      }
    } catch {
      // Non-critical — continue without workout history
    }

    const langMap: Record<string, string> = {
      english: "English", spanish: "Spanish (Español)",
      portuguese: "Portuguese (Português)", french: "French (Français)",
    };
    const responseLang = langMap[aiLanguage || "english"] || "English";

    const systemPrompt = `You are an expert personal trainer and strength coach embedded in a mobile app. The user talks to you naturally (voice or text) to build and manage their workout training plan.

LANGUAGE RULES:
- ALWAYS respond in ${responseLang}, regardless of what language the user writes in.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}

YOUR CAPABILITIES:
1. **generate_plan** — When the user describes what they want (goals, schedule, equipment, etc.), create a complete training plan. You don't need every detail — infer reasonable defaults from context. A beginner saying "I want to get stronger, 3 days a week" is enough to build a plan.
2. **modify_plan** — When they want to change their existing plan (swap exercises, change days, adjust difficulty). Return the FULL updated schedule.
3. **log_feedback** — When they're telling you how a workout went ("today was easy", "I couldn't finish the last set", etc.). Suggest progressive adjustments.
4. **answer** — General training questions or conversation.

PLAN DESIGN RULES:
- Be creative but practical. Design real, effective programs.
- Always include warmup guidance per day.
- For strength: provide specific starting weights in kg based on fitness level.
- Name exercises clearly — the user may not know gym jargon.
- Provide brief but useful form instructions for each exercise.
- Estimate calories burned per session.
- For imageKey, use one of: bench_press, squat, deadlift, overhead_press, barbell_row, pull_up, lat_pulldown, bicep_curl, tricep_extension, lateral_raise, leg_press, leg_curl, leg_extension, calf_raise, plank, crunch, cable_fly, dumbbell_fly, pushup, lunge, hip_thrust, face_pull, shrug, dip, romanian_deadlift, front_squat, incline_press, decline_press, hammer_curl, preacher_curl, skull_crusher, cable_crossover, chest_press_machine, seated_row, t_bar_row, good_morning, step_up, goblet_squat, kettlebell_swing, burpee, mountain_climber, battle_ropes, box_jump, resistance_band, stretch, cardio_generic

PROGRESSIVE OVERLOAD (for feedback):
- "exceeded" / too easy → add 2.5kg to compounds, 1kg to isolation, or +1-2 reps
- "as_planned" → small progression next time (+1 rep or +1kg)
- "incomplete" / too hard → reduce weight 10%, or drop 1 set

Keep responses SHORT and mobile-friendly. Be motivating and personal.
${planContext}${recentWorkoutsContext}`;

    // Build messages array with conversation history
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history for context
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages,
      functions: WORKOUT_CHAT_FUNCTIONS,
      function_call: "auto",
      temperature: 0.7,
      max_completion_tokens: 4000,
    });

    const responseMessage = completion.choices[0].message;

    if (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      const args = JSON.parse(responseMessage.function_call.arguments);

      return NextResponse.json({
        type: functionName,
        ...args,
      });
    }

    // Fallback — plain text response
    return NextResponse.json({
      type: "answer",
      message:
        responseMessage.content ||
        "Tell me about your training goals and I'll build you a plan!",
    });
  } catch (error) {
    console.error("Workout chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
