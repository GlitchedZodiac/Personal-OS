import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyChanges, type ProgressionStep } from "@/lib/progression";
import { buildProgressionSuggestions } from "@/lib/progression-db";

// Routine progression — pure math over his run history. GET lists
// pending suggestions; POST applies one (raises the sequence's weights
// and stamps the post-raise hold). Nothing ever auto-applies.

export async function GET() {
  try {
    return NextResponse.json({ suggestions: await buildProgressionSuggestions() });
  } catch (error) {
    console.error("Progression error:", error);
    return NextResponse.json({ error: "Failed to analyze progression" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sequenceId } = (await request.json()) as { sequenceId: string };
    const suggestions = await buildProgressionSuggestions();
    const suggestion = suggestions.find((s) => s.sequenceId === sequenceId);
    if (!suggestion) {
      return NextResponse.json({ error: "No pending suggestion for that routine" }, { status: 404 });
    }
    const seq = await prisma.sequence.findUnique({ where: { id: sequenceId } });
    if (!seq) return NextResponse.json({ error: "Routine not found" }, { status: 404 });

    const steps = applyChanges(
      (Array.isArray(seq.steps) ? seq.steps : []) as unknown as ProgressionStep[],
      suggestion.changes,
    );
    const updated = await prisma.sequence.update({
      where: { id: sequenceId },
      data: {
        steps: JSON.parse(JSON.stringify(steps)),
        progression: { lastRaiseAt: new Date().toISOString() },
      },
    });
    return NextResponse.json({ applied: suggestion, sequence: updated });
  } catch (error) {
    console.error("Progression apply error:", error);
    return NextResponse.json({ error: "Failed to apply" }, { status: 500 });
  }
}
