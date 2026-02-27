import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getZonedDateParts,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  HEALTH_SYSTEM_PROMPT,
  FOOD_LOG_FUNCTION,
  BODY_MEASUREMENT_FUNCTION,
  WORKOUT_LOG_FUNCTION,
  WATER_LOG_FUNCTION,
  GENERAL_CHAT_FUNCTION,
  TODO_FUNCTION,
  WORKOUT_PLAN_QUERY_FUNCTION,
  REMINDER_FUNCTION,
} from "@/lib/ai-prompts";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

type FoodFunctionItem = {
  mealType?: string;
  foodDescription?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  notes?: string;
  loggedAt?: string;
  [key: string]: unknown;
};

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

function normalizeFoodLoggedAtValue(value: unknown, timeZone: string) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const raw = value.trim();

  // Interpret plain local date/time strings in the app timezone.
  const localDateTime = raw.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (localDateTime) {
    const dateStr = localDateTime[1];
    const hour = Number.parseInt(localDateTime[2] || "12", 10);
    const minute = Number.parseInt(localDateTime[3] || "00", 10);
    const second = Number.parseInt(localDateTime[4] || "00", 10);

    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      Number.isFinite(second)
    ) {
      return zonedLocalDateTimeToUtc(
        dateStr,
        timeZone,
        Math.max(0, Math.min(23, hour)),
        Math.max(0, Math.min(59, minute)),
        Math.max(0, Math.min(59, second))
      ).toISOString();
    }
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function inferFoodLoggedAtFromMessage(
  message: string,
  timeZone: string,
  now: Date
) {
  const lower = message.toLowerCase();
  const todayDateStr = getDateStringInTimeZone(now, timeZone);

  let targetDate: string | null = null;
  let hasTemporalHint = false;

  const isoDateMatch = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDateMatch) {
    targetDate = isoDateMatch[1];
    hasTemporalHint = true;
  } else if (/\b(yesterday|ayer|last night|anoche)\b/.test(lower)) {
    targetDate = addDaysToDateString(todayDateStr, -1);
    hasTemporalHint = true;
  } else if (
    /\b(today|hoy|tonight|this morning|this afternoon|this evening|esta ma(?:n|\u00f1)ana|esta tarde|esta noche)\b/.test(
      lower
    )
  ) {
    targetDate = todayDateStr;
    hasTemporalHint = true;
  } else if (/\b(tomorrow|ma(?:n|\u00f1)ana)\b/.test(lower)) {
    targetDate = addDaysToDateString(todayDateStr, 1);
    hasTemporalHint = true;
  }

  let hour: number | null = null;
  let minute = 0;

  const amPmMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (amPmMatch) {
    hasTemporalHint = true;
    const parsedHour = Number.parseInt(amPmMatch[1], 10);
    const parsedMinute = Number.parseInt(amPmMatch[2] || "0", 10);

    if (Number.isFinite(parsedHour) && Number.isFinite(parsedMinute)) {
      let normalizedHour = parsedHour % 12;
      if (amPmMatch[3] === "pm") normalizedHour += 12;
      hour = normalizedHour;
      minute = Math.max(0, Math.min(59, parsedMinute));
    }
  } else {
    const h24Match = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (h24Match) {
      hasTemporalHint = true;
      const parsedHour = Number.parseInt(h24Match[1], 10);
      const parsedMinute = Number.parseInt(h24Match[2], 10);

      if (Number.isFinite(parsedHour) && Number.isFinite(parsedMinute)) {
        hour = parsedHour;
        minute = parsedMinute;
      }
    }
  }

  if (!targetDate && hasTemporalHint) {
    targetDate = todayDateStr;
  }
  if (!targetDate) return null;

  if (hour === null) {
    if (/\b(last night|anoche|tonight|esta noche|cena|dinner)\b/.test(lower)) {
      hour = 20;
    } else if (
      /\b(this morning|morning|esta ma(?:n|\u00f1)ana|desayuno|breakfast)\b/.test(
        lower
      )
    ) {
      hour = 8;
    } else if (
      /\b(this afternoon|afternoon|esta tarde|almuerzo|lunch)\b/.test(lower)
    ) {
      hour = 13;
    } else if (/\b(snack|merienda)\b/.test(lower)) {
      hour = 16;
    } else {
      hour = 12;
    }
  }

  return zonedLocalDateTimeToUtc(
    targetDate,
    timeZone,
    hour,
    minute,
    0
  ).toISOString();
}

function normalizeFoodItemsWithTiming(
  items: unknown,
  userMessage: string,
  timeZone: string,
  now: Date
) {
  if (!Array.isArray(items)) return [];
  const inferredLoggedAt = inferFoodLoggedAtFromMessage(userMessage, timeZone, now);

  return items.map((item) => {
    if (!item || typeof item !== "object") return item;

    const typed = item as FoodFunctionItem;
    const explicitLoggedAt = normalizeFoodLoggedAtValue(typed.loggedAt, timeZone);

    if (explicitLoggedAt) {
      return { ...typed, loggedAt: explicitLoggedAt };
    }

    if (inferredLoggedAt) {
      return { ...typed, loggedAt: inferredLoggedAt };
    }

    return typed;
  });
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
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      functions: [
        FOOD_LOG_FUNCTION,
        BODY_MEASUREMENT_FUNCTION,
        WORKOUT_LOG_FUNCTION,
        WATER_LOG_FUNCTION,
        GENERAL_CHAT_FUNCTION,
        TODO_FUNCTION,
        WORKOUT_PLAN_QUERY_FUNCTION,
        REMINDER_FUNCTION,
      ],
      function_call: "auto",
    });

    const responseMessage = completion.choices[0].message;

    if (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      let args = JSON.parse(responseMessage.function_call.arguments || "{}");

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
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
