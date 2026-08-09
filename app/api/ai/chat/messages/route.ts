import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The rolling chat thread. GET loads it, PATCH resolves a proposal card
// (saved/rejected after the user acts), DELETE clears the thread.

export async function GET() {
  try {
    const rows = await prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return NextResponse.json({ messages: rows.reverse() });
  } catch (error) {
    console.error("Chat messages fetch error:", error);
    return NextResponse.json({ error: "Failed to load chat" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : null;
    const status = ["saved", "rejected"].includes(body.status) ? body.status : null;
    if (!id || !status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }
    const row = await prisma.chatMessage.findUnique({ where: { id } });
    if (!row || row.role !== "proposal") {
      return NextResponse.json({ error: "Not a proposal" }, { status: 404 });
    }
    const meta = { ...(row.meta as object), status };
    const updated = await prisma.chatMessage.update({
      where: { id },
      data: { meta },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Chat message update error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.chatMessage.deleteMany({});
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error("Chat clear error:", error);
    return NextResponse.json({ error: "Failed to clear chat" }, { status: 500 });
  }
}
