export const HEALTH_SYSTEM_PROMPT = `You are a personal health, productivity, and life assistant built into a mobile app. You help the user log food, body measurements, workouts, water intake, manage todos, and answer questions about their routine.

LANGUAGE RULES:
- Your responses (the "message" field) must ALWAYS be in {{RESPONSE_LANGUAGE}}
- Even if the user writes or speaks in a different language, your response text must be in {{RESPONSE_LANGUAGE}}
- Food descriptions in the structured data can stay in the user's original language for accuracy (e.g. "Carne a la llanera" stays as-is)
- You are fully bilingual in English and Spanish

FOOD LOGGING RULES:
- When the user tells you what they ate, extract EVERY food item mentioned and create a separate entry for each
- Be VERY specific in food descriptions: include preparation method, portion size, and key ingredients
- For example: "Lomo de res a la plancha (grilled beef loin, ~200g)" not just "beef"
- You are an EXPERT in Colombian and Latin American cuisine. You know dishes like:
  * Bandeja paisa, arepas (con queso, de choclo, etc.), empanadas, sancocho, ajiaco
  * Lomo viche, carne asada, chicharrón, patacones, arroz con pollo
  * Jugo de lulo, agua de panela, aguardiente, mazamorra
  * Tamales, buñuelos, pandebono, almojábanas
- Estimate calories based on TYPICAL restaurant/home-cooked portion sizes in Colombia
- If the user doesn't specify portion size, assume a standard Colombian serving
- Break down macros accurately: protein, carbs, and fat in grams
- Determine meal type from context or current time of day:
  * Before 10am → breakfast
  * 10am-2pm → lunch  
  * 2pm-5pm → snack
  * After 5pm → dinner
- If the user mentions drinks, sides, or condiments, log each separately
- For combination plates, break into components (e.g., bandeja paisa → rice, beans, ground beef, chicharrón, egg, plantain, arepa, avocado — each as separate items)
- If the user mentions when they ate (e.g., yesterday, last night, this morning, at 7pm, on 2026-02-26), include loggedAt for each item as an ISO datetime in local context
- If the user provides a date without a time, default loggedAt to 12:00 local time for that date
- If the user provides a time without a date, assume today in local context
- Never ignore explicit temporal phrases like "yesterday", "last night", "ayer", or "anoche"
- In your confirmation message, show a brief per-item breakdown and the total, and be encouraging

BODY MEASUREMENTS:
- Extract weight (convert lbs to kg if needed), body fat %, and body dimensions
- Capture as many dimensions as the user provides: neck, shoulders, chest, waist, hips, arms, forearms, thighs/legs, calves
- If the user mentions a specific date/time for the measurement, include it
- Always confirm the values back to the user
- Be encouraging about progress

WORKOUTS:
- Extract workout type, duration, and exercises
- For strength training, capture exercise name, sets, reps, and weight
- Estimate calories burned based on activity type, duration, and intensity
- Be motivating in your response
- If the user says they completed their workout for the day, or did their workout, use log_workout
- If the user asks what their workout is today, or asks about their plan, use workout_plan_query
- ALL workout types are tracked equally — planned workouts AND extra/ancillary activities (hikes, walks, bike rides, swimming, etc.)
- If the user did something outside their normal plan (e.g. a hike instead of their scheduled workout), still log it as a workout — these are valuable for calorie tracking and trends
- Use the appropriate workoutType: "hike" for hikes, "walk" for walks, "run" for runs, etc.

WORKOUT PLAN QUERIES:
- If the user asks "what's my workout today?", "what do I have planned today?", "remind me of my workout" — use workout_plan_query with action "get_today"
- If the user says they completed their planned workout — use workout_plan_completion with the day info

WATER LOGGING:
- If the user mentions drinking water, use log_water
- Common phrases: "I drank X glasses of water", "I had a liter of water", "log water", "I drank water"
- 1 glass = 250ml, 1 bottle = 500ml, 1 liter = 1000ml
- If the user doesn't specify an amount, default to 1 glass (250ml)
- If the user says "3 glasses", log amountMl = 750 and glasses = 3

REMINDERS:
- If the user wants to SET A REMINDER for a specific time (e.g. "remind me at 3pm to call mom"), use set_reminder
- A reminder is different from a todo — reminders push a notification at a specific time
- If the user says "remind me to..." with a specific time, use set_reminder
- If the user just says "I need to do X" without wanting a time-based notification, use manage_todo instead
- Parse time naturally: "in 30 minutes", "at 3pm", "at noon", "in 2 hours"

TODOS:
- If the user wants to add reminders, tasks, or todos, use manage_todo with action "add"
- IMPORTANT: Extract ALL tasks from the message — if the user mentions 3 things to do, return 3 items in the items array
- If the user says they completed a task/todo, use manage_todo with action "complete" with a single item
- Parse natural language dates: "on the 23rd" → this month's 23rd, "next Friday" → next Friday, "tomorrow" → tomorrow's date
- If no date is mentioned, assume TODAY's date
- Parse natural language times: "at 8" → "08:00", "at 4pm" → "16:00", "at noon" → "12:00", "at 12" (in context of lunch/afternoon) → "12:00"
- Always include dueDate in YYYY-MM-DD format and dueTime in HH:mm (24h) format when a time is mentioned
- The current date/time will be provided to you in the user message context

GENERAL:
- If the user asks about nutrition advice, previous data, or general health questions, respond helpfully
- Keep responses SHORT and mobile-friendly (2-3 sentences max)
- Use a supportive, coaching tone — you're their personal health partner

IMPORTANT: Always use the provided function calls to return structured data. Never return plain text for logging actions.`;

export const FOOD_LOG_FUNCTION = {
  name: "log_food",
  description: "Log food intake with detailed nutritional estimates. Create separate entries for each distinct food item.",
  parameters: {
    type: "object" as const,
    properties: {
      items: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            mealType: {
              type: "string" as const,
              enum: ["breakfast", "lunch", "dinner", "snack"],
              description: "Type of meal based on context or time of day",
            },
            foodDescription: {
              type: "string" as const,
              description: "Detailed description including preparation method and approximate portion size, e.g. 'Grilled beef loin (lomo a la plancha, ~200g)'",
            },
            calories: {
              type: "number" as const,
              description: "Estimated calories based on typical serving size",
            },
            proteinG: {
              type: "number" as const,
              description: "Estimated protein in grams",
            },
            carbsG: {
              type: "number" as const,
              description: "Estimated carbs in grams",
            },
            fatG: {
              type: "number" as const,
              description: "Estimated fat in grams",
            },
            notes: {
              type: "string" as const,
              description: "Portion size assumptions or other relevant notes",
            },
            loggedAt: {
              type: "string" as const,
              description: "Optional ISO datetime for when the food was eaten. Include when the user specifies timing.",
            },
          },
          required: ["mealType", "foodDescription", "calories", "proteinG", "carbsG", "fatG"],
        },
        description: "Array of individual food items to log — one entry per distinct item",
      },
      message: {
        type: "string" as const,
        description: "Short, friendly confirmation message with per-item calorie summary and total. Be encouraging.",
      },
    },
    required: ["items", "message"],
  },
};

export const BODY_MEASUREMENT_FUNCTION = {
  name: "log_measurement",
  description: "Log body measurements like weight, body fat percentage, and body dimensions",
  parameters: {
    type: "object" as const,
    properties: {
      measuredAt: {
        type: "string" as const,
        description: "Optional ISO date-time string if the user specifies when the measurement was taken",
      },
      weightKg: {
        type: "number" as const,
        description: "Weight in kilograms (convert from lbs if needed)",
      },
      bodyFatPct: {
        type: "number" as const,
        description: "Body fat percentage",
      },
      waistCm: {
        type: "number" as const,
        description: "Waist measurement in cm",
      },
      chestCm: {
        type: "number" as const,
        description: "Chest measurement in cm",
      },
      armsCm: {
        type: "number" as const,
        description: "Arms measurement in cm",
      },
      legsCm: {
        type: "number" as const,
        description: "Legs measurement in cm",
      },
      hipsCm: {
        type: "number" as const,
        description: "Hips measurement in cm",
      },
      shouldersCm: {
        type: "number" as const,
        description: "Shoulders measurement in cm",
      },
      neckCm: {
        type: "number" as const,
        description: "Neck measurement in cm",
      },
      forearmsCm: {
        type: "number" as const,
        description: "Forearms measurement in cm",
      },
      calvesCm: {
        type: "number" as const,
        description: "Calves measurement in cm",
      },
      notes: {
        type: "string" as const,
        description: "Any additional notes or context",
      },
      message: {
        type: "string" as const,
        description: "Short, encouraging confirmation message",
      },
    },
    required: ["message"],
  },
};

export const WORKOUT_LOG_FUNCTION = {
  name: "log_workout",
  description: "Log a workout session with exercises, duration, and calories burned. Use when the user tells you about a workout they did.",
  parameters: {
    type: "object" as const,
    properties: {
      workoutType: {
        type: "string" as const,
        enum: ["strength", "cardio", "run", "walk", "hike", "cycling", "swimming", "yoga", "hiit", "other"],
        description: "Type of workout — use 'hike' for hikes, 'walk' for walks, etc. All activities count, not just planned workouts.",
      },
      durationMinutes: {
        type: "number" as const,
        description: "Duration in minutes",
      },
      description: {
        type: "string" as const,
        description: "Brief description of the workout",
      },
      startedAt: {
        type: "string" as const,
        description: "ISO date string for when the workout happened. Use if the user mentions a specific date/time (e.g. 'I did a workout on Saturday at 7am'). If not mentioned, omit and it defaults to now.",
      },
      caloriesBurned: {
        type: "number" as const,
        description: "Estimated calories burned based on activity and duration",
      },
      exercises: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const, description: "Exercise name" },
            sets: { type: "number" as const, description: "Number of sets" },
            reps: { type: "number" as const, description: "Reps per set" },
            weightKg: { type: "number" as const, description: "Weight in kg" },
          },
          required: ["name"],
        },
        description: "Individual exercises performed",
      },
      message: {
        type: "string" as const,
        description: "Short, motivating confirmation message",
      },
    },
    required: ["workoutType", "durationMinutes", "message"],
  },
};

export const TODO_FUNCTION = {
  name: "manage_todo",
  description: "Add one or more todos/reminders/tasks, or mark an existing one as complete. Extract ALL tasks mentioned by the user — if they mention 3 things, return 3 items.",
  parameters: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["add", "complete"],
        description: "Whether to add new todos or complete an existing one",
      },
      items: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: {
              type: "string" as const,
              description: "The todo title/description. Keep it concise but clear.",
            },
            dueDate: {
              type: "string" as const,
              description: "Due date in YYYY-MM-DD format. If no date mentioned, use today's date.",
            },
            dueTime: {
              type: "string" as const,
              description: "Due time in HH:mm 24-hour format (e.g. '08:00', '16:30'). Only include if the user specified a time.",
            },
            priority: {
              type: "string" as const,
              enum: ["low", "normal", "high"],
              description: "Priority level, default normal",
            },
          },
          required: ["title"],
        },
        description: "Array of todo items — one entry per distinct task mentioned by the user",
      },
      message: {
        type: "string" as const,
        description: "Short, friendly confirmation message summarizing all tasks",
      },
    },
    required: ["action", "items", "message"],
  },
};

export const WORKOUT_PLAN_QUERY_FUNCTION = {
  name: "workout_plan_query",
  description: "Query about the user's workout plan. Use when user asks what their workout is today, what's planned, or needs a reminder of their routine.",
  parameters: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["get_today"],
        description: "The type of query about the workout plan",
      },
      message: {
        type: "string" as const,
        description: "Short confirmation that you're looking up their plan",
      },
    },
    required: ["action", "message"],
  },
};

export const WATER_LOG_FUNCTION = {
  name: "log_water",
  description: "Log water intake when the user mentions drinking water. Use when user says they drank water, had glasses of water, etc.",
  parameters: {
    type: "object" as const,
    properties: {
      glasses: {
        type: "number" as const,
        description: "Number of glasses of water (1 glass = 250ml). Default to 1 if not specified.",
      },
      amountMl: {
        type: "number" as const,
        description: "Total amount in milliliters. 1 glass = 250ml, 1 bottle = 500ml, 1 liter = 1000ml.",
      },
      message: {
        type: "string" as const,
        description: "Short, encouraging confirmation message about staying hydrated",
      },
    },
    required: ["glasses", "amountMl", "message"],
  },
};

export const REMINDER_FUNCTION = {
  name: "set_reminder",
  description: "Set a timed reminder that will push a notification at the specified time. Use when the user explicitly wants to be reminded at a certain time.",
  parameters: {
    type: "object" as const,
    properties: {
      title: {
        type: "string" as const,
        description: "What to remind about — e.g. 'Call mom', 'Take medicine'",
      },
      remindAt: {
        type: "string" as const,
        description: "ISO 8601 date-time string for when the reminder should fire. Convert natural language like 'in 30 minutes', 'at 3pm', 'tomorrow at 9am' into the correct datetime.",
      },
      message: {
        type: "string" as const,
        description: "Short confirmation message — e.g. 'Got it! I\\'ll remind you at 3:00 PM to call mom.'",
      },
    },
    required: ["title", "remindAt", "message"],
  },
};

/**
 * Domain vocabulary hint passed to the transcription model. Biases speech
 * recognition toward the words this app actually hears — kettlebell training,
 * macro tracking, and Colombian food terms — which is where generic
 * transcription misses most.
 */
export const TRANSCRIBE_PROMPT =
  "Personal health log dictation. Vocabulary: kettlebell, swings, goblet squat, " +
  "Turkish get-up, clean and press, snatch, deadlift, superset, reps, sets, RPE, " +
  "PR, bodyweight, kilos, pounds, protein, carbs, fats, macros, calories, " +
  "arepa, bandeja paisa, sancocho, ajiaco, patacones, chicharrón, buñuelos, " +
  "pandebono, almojábana, jugo de lulo, agua de panela.";

export const GENERAL_CHAT_FUNCTION = {
  name: "general_response",
  description: "Respond to general health questions, nutrition advice, or conversation that doesn't involve logging data or managing todos",
  parameters: {
    type: "object" as const,
    properties: {
      message: {
        type: "string" as const,
        description: "Helpful, concise response (2-3 sentences max for mobile)",
      },
    },
    required: ["message"],
  },
};

/**
 * The same definitions in the modern Chat Completions `tools` shape.
 * The legacy `functions` API these were written for is deprecated.
 * Still used by the floating dock's /api/ai/chat; the Chat screen runs the
 * Responses-API set below.
 */
export const HEALTH_TOOLS = [
  FOOD_LOG_FUNCTION,
  BODY_MEASUREMENT_FUNCTION,
  WORKOUT_LOG_FUNCTION,
  WATER_LOG_FUNCTION,
  GENERAL_CHAT_FUNCTION,
  TODO_FUNCTION,
  WORKOUT_PLAN_QUERY_FUNCTION,
  REMINDER_FUNCTION,
].map((fn) => ({ type: "function" as const, function: fn }));

// ————————————————————————————————————————————————————————————————————————
// Chat 2b — Responses API surface (the Chat screen). Tools + reasoning can
// combine here, which chat-completions rejects on GPT-5.6. Todos and workout
// plans are intentionally absent (stripped per the Pitaya simplification);
// general_response is gone because plain text output IS the general reply.
// ————————————————————————————————————————————————————————————————————————

export const CHAT_SYSTEM_PROMPT = `You are the notebook that talks back — the chat inside Pitaya, a single-user health app for one person: kettlebell training, food/macro tracking, weight, water, journaling.

LANGUAGE:
- Default to {{RESPONSE_LANGUAGE}}, but mirror the user when they write in the other language (EN↔ES) — natural bilingual flow. Food names may stay in their original language.

VOICE:
- Short. Wry, warm, direct — a sharp coach who likes the user. One or two sentences beats a paragraph. Numbers are exact, never invented.
- Plain text only — the chat renders raw text, so no markdown (**, #, backticks, bullets).

DATA QUESTIONS (PRs, "what did I eat", weight trend, today's totals):
- ALWAYS call get_health_data first. Never answer a data question from memory — if the tool returns nothing, say so plainly.

LOGGING (food, weight/measurements, workouts, water):
- Extract every distinct item. You are an expert in Colombian/Latin cuisine (bandeja paisa, arepas, sancocho, ajiaco, patacones...) — estimate typical Colombian portions when unspecified, macros in grams.
- Meal type from time: <10am breakfast, 10–2 lunch, 2–5 snack, >5pm dinner.
- Honor temporal phrases ("yesterday", "anoche", "at 7pm") via loggedAt/startedAt/measuredAt ISO datetimes in local context; date without time → 12:00.
- Logging tools are PROPOSALS: the app shows a confirm card and saves only after the user taps Confirm. Your "message" is the bubble that accompanies the card — brief, human.
- Kettlebell workouts: capture exercise, sets, reps, weightKg per movement.

EDITING & DELETING:
- To change or remove an existing entry: first get_health_data (recent_food / recent_workouts / weight_trend) to find the entry's id, then propose edit_food_log or delete_entry. These are also confirm-first proposals.
- When several entries match, pick the most recent and say which one you chose.
- If the user amends something whose card is still [pending], re-propose the corrected full card. If the card was [saved], the data is in the log — use edit_food_log/delete_entry on the real entry, NEVER log it again (that double-counts).

ROUTINES (training design):
- create_routine proposes a reusable training routine — the user's protocols: straight sets, EMOM ("20-minute EMOM cycling 20 swings / 15 goblet squats / 5 snatches each side" → kind emom, durationMinutes 20, one step per movement with reps + weightKg), circuit ("11 exercises, 45–60 s rest between" → kind circuit, restSecondsDefault ~50), tabata.
- Steps carry reps (or seconds for timed holds), weightKg when the user names a bell, sets for straight work. "Each side" belongs in the exercise name.
- Saved routines appear in Train → Routines and on the Apple Watch. Confirm-first like every proposal.

REMINDERS:
- set_reminder creates a real timed notification. Only for explicit "remind me at/in..." asks.

NOT YOUR JOB:
- Todos, finances, and workout-plan coaching are out of the app now. If asked, say Pitaya dropped that — one line, no apology tour.`;

// Read tool — executed server-side inside the loop; results feed back to
// the model. One flexible tool keeps the schema surface small.
const GET_HEALTH_DATA = {
  type: "function" as const,
  name: "get_health_data",
  description:
    "Read the user's real logged data. Use before answering ANY question about their numbers: PRs, foods eaten, workouts done, weight, today's totals.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        enum: [
          "today_summary",
          "prs",
          "recent_food",
          "recent_workouts",
          "weight_trend",
        ],
        description:
          "today_summary = calories/macros eaten today + goals + week training volume. prs = all personal records. recent_food = food log rows with ids. recent_workouts = workout rows with ids and exercises. weight_trend = recent body measurements with ids.",
      },
      days: {
        type: "number" as const,
        description: "Lookback window in days for recent_* / weight_trend. Default 3, max 30.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const EDIT_FOOD_LOG = {
  type: "function" as const,
  name: "edit_food_log",
  description:
    "Propose changes to an existing food log entry (found via get_health_data recent_food). The user confirms before anything saves.",
  parameters: {
    type: "object" as const,
    properties: {
      id: { type: "string" as const, description: "The food log entry id" },
      label: {
        type: "string" as const,
        description: "Short human label of the entry being edited, e.g. 'Jasmine rice (lunch)'",
      },
      set: {
        type: "object" as const,
        properties: {
          foodDescription: { type: "string" as const },
          calories: { type: "number" as const },
          proteinG: { type: "number" as const },
          carbsG: { type: "number" as const },
          fatG: { type: "number" as const },
          mealType: {
            type: "string" as const,
            enum: ["breakfast", "lunch", "dinner", "snack"],
          },
        },
        description: "Only the fields that change",
        additionalProperties: false,
      },
      message: {
        type: "string" as const,
        description: "One-line bubble accompanying the edit card",
      },
    },
    required: ["id", "label", "set", "message"],
    additionalProperties: false,
  },
};

const DELETE_ENTRY = {
  type: "function" as const,
  name: "delete_entry",
  description:
    "Propose deleting a logged entry (id from get_health_data). The user confirms before anything is removed.",
  parameters: {
    type: "object" as const,
    properties: {
      entity: {
        type: "string" as const,
        enum: ["food", "workout", "measurement"],
      },
      id: { type: "string" as const },
      label: {
        type: "string" as const,
        description: "What's being deleted, in the user's words, e.g. 'the 6:41 PM salmon dinner'",
      },
      message: {
        type: "string" as const,
        description: "One-line bubble accompanying the delete card",
      },
    },
    required: ["entity", "id", "label", "message"],
    additionalProperties: false,
  },
};

const CREATE_ROUTINE = {
  type: "function" as const,
  name: "create_routine",
  description:
    "Propose a reusable training routine (straight sets / EMOM / tabata / circuit) that the user can run from Train or the Apple Watch. The user confirms before it saves.",
  parameters: {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "Routine name, e.g. 'EMOM 20 — swings/squats/snatch'" },
      kind: {
        type: "string" as const,
        enum: ["straight", "emom", "tabata", "circuit"],
      },
      durationMinutes: {
        type: "number" as const,
        description: "Total minutes for EMOM/circuit sessions (e.g. 20 or 30 for an EMOM)",
      },
      restSecondsDefault: {
        type: "number" as const,
        description: "Rest between movements in seconds (circuits: typically 45-60)",
      },
      steps: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            exerciseName: { type: "string" as const, description: "Movement name; put 'each side' in the name when applicable" },
            sets: { type: "number" as const, description: "Sets (straight work)" },
            reps: { type: "number" as const },
            seconds: { type: "number" as const, description: "For timed holds/intervals instead of reps" },
            weightKg: { type: "number" as const },
          },
          required: ["exerciseName"],
        },
        description: "Ordered movements. For an EMOM these are the exercises cycled each minute.",
      },
      message: {
        type: "string" as const,
        description: "One-line bubble accompanying the routine card",
      },
    },
    required: ["name", "kind", "steps", "message"],
  },
};

// Proposal tools reuse the legacy schemas (same fields the dock confirms
// with today), flattened to the Responses tool shape.
function toResponsesTool(fn: { name: string; description: string; parameters: object }) {
  return {
    type: "function" as const,
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
  };
}

export const CHAT_RESPONSES_TOOLS = [
  GET_HEALTH_DATA,
  toResponsesTool(FOOD_LOG_FUNCTION),
  toResponsesTool(BODY_MEASUREMENT_FUNCTION),
  toResponsesTool(WORKOUT_LOG_FUNCTION),
  toResponsesTool(WATER_LOG_FUNCTION),
  toResponsesTool(REMINDER_FUNCTION),
  EDIT_FOOD_LOG,
  DELETE_ENTRY,
  CREATE_ROUTINE,
];
