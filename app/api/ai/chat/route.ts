import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  try {
    const { message, customInstructions, aiLanguage } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // Map language code to full name for the prompt
    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish (Español)",
      portuguese: "Portuguese (Português)",
      french: "French (Français)",
    };
    const responseLang = languageMap[aiLanguage || "english"] || "English";

    // Append current date/time context so AI can parse relative dates
    const now = new Date();
    const dateContext = `\n\n[Current date/time: ${format(now, "yyyy-MM-dd HH:mm")} (${format(now, "EEEE, MMMM d, yyyy")})]`;

    let systemPrompt = HEALTH_SYSTEM_PROMPT.replace(/\{\{RESPONSE_LANGUAGE\}\}/g, responseLang) + dateContext;
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
      const args = JSON.parse(responseMessage.function_call.arguments);

      // Log conversation
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
            todos: (args.items || []).map((item: { title: string; dueDate?: string; dueTime?: string; priority?: string }) => ({
              action: args.action,
              title: item.title,
              dueDate: item.dueDate || null,
              dueTime: item.dueTime || null,
              priority: item.priority || "normal",
            })),
          });

        case "workout_plan_query": {
          // Fetch today's workout plan from DB and return it
          const todayDow = now.getDay(); // 0=Sun, 1=Mon...
          const activePlan = await prisma.workoutPlan.findFirst({
            where: { isActive: true },
            select: { id: true, name: true, schedule: true },
          });

          if (!activePlan) {
            return NextResponse.json({
              type: "general",
              message: "You don't have an active workout plan yet. Head to Health → Workouts → Plan to create one!",
            });
          }

          const schedule = activePlan.schedule as Array<{ dayOfWeek: number; day: string; exercises: Array<{ name: string; sets?: number; reps?: string; notes?: string }> }>;
          const todaySchedule = schedule.find((d) => d.dayOfWeek === todayDow);

          if (!todaySchedule) {
            return NextResponse.json({
              type: "general",
              message: `Today is a rest day! Your plan "${activePlan.name}" doesn't have a workout scheduled for ${format(now, "EEEE")}. Enjoy the recovery! 💪`,
            });
          }

          const exerciseList = todaySchedule.exercises
            .map((ex) => {
              let line = `• ${ex.name}`;
              if (ex.sets) line += ` — ${ex.sets}×${ex.reps || "?"}`;
              if (ex.notes) line += ` (${ex.notes})`;
              return line;
            })
            .join("\n");

          return NextResponse.json({
            type: "general",
            message: `Today's workout: **${todaySchedule.day}**\n\n${exerciseList}\n\nLet me know when you've finished! 🔥`,
          });
        }

        case "set_reminder": {
          // Create the reminder in the database
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
      message: responseMessage.content || "I'm here to help! Tell me what you ate, your measurements, workouts, or add a todo.",
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
