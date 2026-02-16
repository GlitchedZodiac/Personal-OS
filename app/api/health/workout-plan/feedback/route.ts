import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

// POST - Submit workout feedback and get AI adjustment suggestions
export async function POST(request: NextRequest) {
  try {
    const {
      planId,
      completionId,
      feedback,     // "as_planned" | "exceeded" | "incomplete"
      userNotes,    // e.g. "bench press was too easy, I could have done more"
      dayIndex,
      schedule,     // The current schedule for context
      customInstructions,
    } = await request.json();

    if (!feedback || dayIndex === undefined || !schedule) {
      return NextResponse.json(
        { error: "feedback, dayIndex, and schedule are required" },
        { status: 400 }
      );
    }

    const currentDay = schedule[dayIndex];
    if (!currentDay) {
      return NextResponse.json(
        { error: "Invalid dayIndex" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert strength coach adjusting a workout plan based on user feedback.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}

RULES:
- If feedback is "exceeded": increase weights by 2.5kg for compound lifts, 1-1.5kg for isolation exercises, or add 1-2 reps
- If feedback is "as_planned": make minor progressive increases (1-2.5kg or 1 rep) for the NEXT time this day comes up
- If feedback is "incomplete": reduce weights by ~10%, reduce sets by 1, or provide easier alternatives
- Consider the user's notes for specific adjustments
- Return the UPDATED exercises array for this day only
- Keep the same exercise names unless suggesting a substitute
- Be encouraging in the suggestion message

RESPOND WITH VALID JSON ONLY:
{
  "suggestion": "A short, encouraging message explaining what you changed and why",
  "updatedExercises": [same format as input exercises with adjusted values]
}`;

    const userMessage = `Workout day: ${currentDay.label}
Feedback: ${feedback}
${userNotes ? `User notes: "${userNotes}"` : ""}

Current exercises:
${JSON.stringify(currentDay.exercises, null, 2)}

Adjust the exercises based on the feedback and return the updated plan.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_completion_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      console.error("Failed to parse AI feedback response:", content);
      return NextResponse.json({
        suggestion: "Great work! Keep at it with the current plan.",
        updatedExercises: currentDay.exercises,
      });
    }

    // Save the AI suggestion to the completion record
    if (completionId) {
      try {
        await prisma.workoutPlanCompletion.update({
          where: { id: completionId },
          data: {
            feedback,
            userNotes: userNotes || null,
            aiSuggestion: parsed.suggestion,
          },
        });
      } catch {
        // Completion might not exist yet — that's OK
      }
    }

    return NextResponse.json({
      suggestion: parsed.suggestion,
      updatedExercises: parsed.updatedExercises,
      dayIndex,
    });
  } catch (error) {
    console.error("Workout feedback error:", error);
    return NextResponse.json(
      { error: "Failed to process feedback" },
      { status: 500 }
    );
  }
}
