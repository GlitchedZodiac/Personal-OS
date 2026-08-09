import { NextRequest, NextResponse } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  getDateStringInTimeZone,
  getZonedDateParts,
} from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/server-timezone";
import { HEALTH_SYSTEM_PROMPT, HEALTH_TOOLS } from "@/lib/ai-prompts";
import { normalizeFoodItemsWithTiming } from "@/lib/food-timing";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getDayOfWeekFromDateStr(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function buildDateContext(now: Date, timeZone: string) {
  const parts = getZonedDateParts(now, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(now);
  const prettyDate = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const localDate = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const localTime = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  return `\n\n[Current local date/time: ${localDate} ${localTime} (${weekday}, ${prettyDate}) | Timezone: ${timeZone}]`;
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const customInstructions =
      typeof body.customInstructions === "string"
        ? body.customInstructions
        : "";
    const aiLanguage =
      typeof body.aiLanguage === "string" ? body.aiLanguage : "english";
    const requestedTimeZone =
      typeof body.timeZone === "string" ? body.timeZone : null;

    // Optional prior turns so follow-ups work ("actually make that 2 eggs").
    // Capped to the last 12 messages to bound tokens.
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      Array.isArray(body.history)
        ? body.history
            .filter(
              (m: unknown): m is { role: "user" | "assistant"; content: string } =>
                !!m &&
                typeof m === "object" &&
                ((m as { role?: unknown }).role === "user" ||
                  (m as { role?: unknown }).role === "assistant") &&
                typeof (m as { content?: unknown }).content === "string" &&
                ((m as { content: string }).content.trim().length > 0)
            )
            .slice(-12)
        : [];

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const timeZone = await getUserTimeZone(requestedTimeZone);

    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish (Espanol)",
      portuguese: "Portuguese (Portugues)",
      french: "French (Francais)",
    };
    const responseLang = languageMap[aiLanguage] || "English";

    const now = new Date();
    const dateContext = buildDateContext(now, timeZone);

    let systemPrompt =
      HEALTH_SYSTEM_PROMPT.replace(/\{\{RESPONSE_LANGUAGE\}\}/g, responseLang) +
      dateContext;

    if (customInstructions) {
      systemPrompt += `\n\nUSER'S CUSTOM INSTRUCTIONS (follow these carefully):\n${customInstructions}`;
    }

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
      tools: HEALTH_TOOLS,
      tool_choice: "auto",
      // GPT-5.6 requires effort "none" when combining tools with
      // chat-completions (reasoning+tools lives on the Responses API — the
      // Phase 2b rebuild target). Parsing turns don't need reasoning anyway.
      reasoning_effort: "none",
      // Token discipline: a logging turn never needs more than this — caps
      // both cost and worst-case latency on the everyday path.
      max_completion_tokens: 1500,
    });

    recordAIUsage({
      surface: "chat",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const responseMessage = completion.choices[0].message;
    const toolCall = responseMessage.tool_calls?.[0];

    if (toolCall && toolCall.type === "function") {
      const functionName = toolCall.function.name;
      let args = JSON.parse(toolCall.function.arguments || "{}");

      if (functionName === "log_food") {
        args = {
          ...args,
          items: normalizeFoodItemsWithTiming(args.items, message, timeZone, now),
        };
      }

      await prisma.aIConversation.create({
        data: {
          userMessage: message,
          aiResponse: JSON.stringify(args),
          actionTaken: functionName,
          extractedData: args,
        },
      });

      switch (functionName) {
        case "log_food":
          return NextResponse.json({
            type: "food",
            message: args.message,
            items: args.items,
          });

        case "log_measurement":
          return NextResponse.json({
            type: "measurement",
            message: args.message,
            measurement: {
              measuredAt: args.measuredAt || null,
              weightKg: args.weightKg,
              bodyFatPct: args.bodyFatPct,
              waistCm: args.waistCm,
              chestCm: args.chestCm,
              armsCm: args.armsCm,
              legsCm: args.legsCm,
              hipsCm: args.hipsCm,
              shouldersCm: args.shouldersCm,
              neckCm: args.neckCm,
              forearmsCm: args.forearmsCm,
              calvesCm: args.calvesCm,
              notes: args.notes,
            },
          });

        case "log_workout":
          return NextResponse.json({
            type: "workout",
            message: args.message,
            workout: {
              workoutType: args.workoutType,
              durationMinutes: args.durationMinutes,
              description: args.description,
              caloriesBurned: args.caloriesBurned,
              exercises: args.exercises,
              startedAt: args.startedAt || null,
            },
          });

        case "log_water":
          return NextResponse.json({
            type: "water",
            message: args.message,
            water: {
              glasses: args.glasses,
              amountMl: args.amountMl,
            },
          });

        case "manage_todo":
          return NextResponse.json({
            type: "todo",
            message: args.message,
            todos: (args.items || []).map(
              (item: {
                title: string;
                dueDate?: string;
                dueTime?: string;
                priority?: string;
              }) => ({
                action: args.action,
                title: item.title,
                dueDate: item.dueDate || null,
                dueTime: item.dueTime || null,
                priority: item.priority || "normal",
              })
            ),
          });

        case "workout_plan_query": {
          const todayDateStr = getDateStringInTimeZone(now, timeZone);
          const todayDow = getDayOfWeekFromDateStr(todayDateStr);
          const localWeekday = new Intl.DateTimeFormat("en-US", {
            timeZone,
            weekday: "long",
          }).format(now);

          const activePlan = await prisma.workoutPlan.findFirst({
            where: { isActive: true },
            select: { id: true, name: true, schedule: true },
          });

          if (!activePlan) {
            return NextResponse.json({
              type: "general",
              message:
                "You don't have an active workout plan yet. Head to Health > Workouts > Plan to create one!",
            });
          }

          const schedule = activePlan.schedule as Array<{
            dayOfWeek: number;
            day: string;
            exercises: Array<{
              name: string;
              sets?: number;
              reps?: string;
              notes?: string;
            }>;
          }>;

          const todaySchedule = schedule.find((d) => d.dayOfWeek === todayDow);

          if (!todaySchedule) {
            return NextResponse.json({
              type: "general",
              message: `Today is a rest day! Your plan "${activePlan.name}" does not have a workout scheduled for ${localWeekday}. Enjoy recovery!`,
            });
          }

          const exerciseList = todaySchedule.exercises
            .map((exercise) => {
              let line = `- ${exercise.name}`;
              if (exercise.sets) line += ` (${exercise.sets}x${exercise.reps || "?"})`;
              if (exercise.notes) line += ` (${exercise.notes})`;
              return line;
            })
            .join("\n");

          return NextResponse.json({
            type: "general",
            message: `Today's workout: ${todaySchedule.day}\n\n${exerciseList}\n\nLet me know when you have finished!`,
          });
        }

        case "set_reminder": {
          const reminder = await prisma.reminder.create({
            data: {
              title: args.title,
              body: args.title,
              remindAt: new Date(args.remindAt),
              url: "/todos",
            },
          });

          return NextResponse.json({
            type: "reminder",
            message: args.message,
            reminder: {
              id: reminder.id,
              title: args.title,
              remindAt: args.remindAt,
            },
          });
        }

        case "general_response":
          return NextResponse.json({
            type: "general",
            message: args.message,
          });

        default:
          return NextResponse.json({
            type: "general",
            message: "I'm not sure how to handle that. Could you rephrase?",
          });
      }
    }

    return NextResponse.json({
      type: "general",
      message:
        responseMessage.content ||
        "I'm here to help! Tell me what you ate, your measurements, workouts, or add a todo.",
    });
  } catch (error) {
    console.error("AI chat error:", error);
    const { kind, userMessage } = classifyOpenAIError(error);
    return NextResponse.json(
      { error: userMessage, kind },
      { status: kind === "unknown" ? 500 : 502 }
    );
  }
}
