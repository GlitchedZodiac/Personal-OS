import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const {
      goal,
      fitnessLevel,
      daysPerWeek,
      sessionMinutes,
      equipment,
      focusAreas,
      injuries,
      currentPlan,
      feedback,
      customInstructions,
    } = await request.json();

    const equipmentStr = equipment?.length > 0 ? equipment.join(", ") : "full gym";
    const focusStr = focusAreas?.length > 0 ? focusAreas.join(", ") : "full body";

    let adjustmentContext = "";
    if (currentPlan && feedback) {
      adjustmentContext = `
IMPORTANT — PLAN ADJUSTMENT:
The user has an existing plan and is requesting an adjustment based on feedback.
Current plan name: ${currentPlan.name}
User feedback: "${feedback}"
Current schedule: ${JSON.stringify(currentPlan.schedule)}

Adjust the plan based on this feedback. If they said a workout was too easy, increase weights/reps. If too hard, decrease.
If they completed everything, progress them forward (progressive overload — add ~2.5kg to compound lifts, ~1kg to isolation, or add 1-2 reps).
`;
    }

    const systemPrompt = `You are an expert personal trainer and strength coach. You create detailed, periodized workout plans.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}

RULES:
- Create a ${daysPerWeek}-day workout split optimized for the user's goal
- Each session should be ~${sessionMinutes} minutes
- Include warm-up guidance for each day
- For strength exercises, provide specific starting weights based on fitness level
- Estimate calories burned per session based on workout type and duration
- Use ONLY exercises possible with the available equipment
- Account for any injuries/limitations
- Include rest periods between sets
- Name exercises clearly — users may not know gym jargon
- For each exercise, provide:
  * Clear name
  * Sets and reps
  * Starting weight in kg (realistic for the fitness level)
  * Rest period in seconds
  * Brief instruction on form
  * Target muscle group
- Respond in the same language as the user's custom instructions, or English if none

${adjustmentContext}

RESPOND WITH VALID JSON ONLY — no markdown, no explanation outside the JSON.`;

    const userMessage = `Create a workout plan with these specs:
- Goal: ${goal}
- Fitness Level: ${fitnessLevel}
- Days per Week: ${daysPerWeek}
- Session Length: ${sessionMinutes} minutes
- Equipment: ${equipmentStr}
- Focus Areas: ${focusStr}
${injuries ? `- Injuries/Limitations: ${injuries}` : ""}

Return this exact JSON structure:
{
  "name": "Plan Name (e.g., 4-Day Push/Pull/Legs)",
  "schedule": [
    {
      "dayIndex": 0,
      "label": "Day 1 - Push (Chest, Shoulders, Triceps)",
      "workoutType": "strength",
      "estimatedDuration": 45,
      "estimatedCalories": 300,
      "warmup": "5 min light cardio + dynamic stretches for upper body",
      "exercises": [
        {
          "name": "Flat Barbell Bench Press",
          "sets": 4,
          "reps": 8,
          "targetWeightKg": 40,
          "restSeconds": 90,
          "instructions": "Lie flat on bench. Grip bar slightly wider than shoulders. Lower to mid-chest, press up explosively. Keep feet flat on floor.",
          "muscleGroup": "chest",
          "imageKey": "bench_press"
        }
      ]
    }
  ]
}

The "imageKey" should be one of: bench_press, squat, deadlift, overhead_press, barbell_row, pull_up, lat_pulldown, bicep_curl, tricep_extension, lateral_raise, leg_press, leg_curl, leg_extension, calf_raise, plank, crunch, cable_fly, dumbbell_fly, pushup, lunge, hip_thrust, face_pull, shrug, dip, romanian_deadlift, front_squat, incline_press, decline_press, hammer_curl, preacher_curl, skull_crusher, cable_crossover, chest_press_machine, seated_row, t_bar_row, good_morning, step_up, goblet_squat, kettlebell_swing, burpee, mountain_climber, battle_ropes, box_jump, resistance_band, stretch, cardio_generic`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content || "";

    // Parse JSON from the response (handle possible markdown wrapping)
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI workout plan:", parseError, content);
      return NextResponse.json(
        { error: "AI returned an invalid plan. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      name: parsed.name,
      schedule: parsed.schedule,
    });
  } catch (error) {
    console.error("Workout plan generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate workout plan" },
      { status: 500 }
    );
  }
}
