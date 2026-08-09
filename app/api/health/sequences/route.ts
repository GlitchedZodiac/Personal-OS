import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSequence } from "@/lib/sequences";

// Routines CRUD (web, cookie-gated by proxy.ts). The watch reads the same
// rows through /api/mobile/sequences per docs/watch-contract.md.

export async function GET() {
  try {
    const sequences = await prisma.sequence.findMany({
      where: { isArchived: false },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(sequences);
  } catch (error) {
    console.error("Sequences fetch error:", error);
    return NextResponse.json({ error: "Failed to load routines" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateSequence(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const sequence = await prisma.sequence.create({
      data: {
        name: parsed.name,
        kind: parsed.kind,
        restSecondsDefault: parsed.restSecondsDefault,
        steps: parsed.steps as object[],
      },
    });
    return NextResponse.json(sequence);
  } catch (error) {
    console.error("Sequence create error:", error);
    return NextResponse.json({ error: "Failed to create routine" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (body.archive === true) {
      const sequence = await prisma.sequence.update({
        where: { id },
        data: { isArchived: true },
      });
      return NextResponse.json(sequence);
    }

    const parsed = validateSequence(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const sequence = await prisma.sequence.update({
      where: { id },
      data: {
        name: parsed.name,
        kind: parsed.kind,
        restSecondsDefault: parsed.restSecondsDefault,
        steps: parsed.steps as object[],
      },
    });
    return NextResponse.json(sequence);
  } catch (error) {
    console.error("Sequence update error:", error);
    return NextResponse.json({ error: "Failed to update routine" }, { status: 500 });
  }
}
