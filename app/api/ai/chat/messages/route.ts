import { NextRequest, NextResponse } from "next/server";
import {
  adoptUnfiledMessages,
  getConversation,
  getConversationMessages,
  latestConversation,
} from "@/lib/chat-conversations";
import { isStale, normalizeGapHours } from "@/lib/chat-history";
import { prisma } from "@/lib/prisma";

// One chat's messages. GET loads them; PATCH resolves a proposal card
// (saved/rejected after the user acts). DELETE predates conversations and
// wipes EVERY message in EVERY chat — no screen calls it; left as found and
// filed in docs/deferred-items.md rather than changed in passing.
//
//   GET ?conversationId=<id>   that chat
//   GET ?gap=<hours>           the CURRENT chat: the most recent one, unless
//                              it has been quiet longer than the gap — then
//                              `conversation` is null and the screen opens on
//                              a fresh, empty chat (nothing is created until
//                              he actually says something). `latest` still
//                              names the chat that was passed over.
//   GET                        the most recent chat, whatever its age

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    await adoptUnfiledMessages();

    const requested = params.get("conversationId");
    if (requested) {
      const conversation = await getConversation(requested);
      if (!conversation) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      const messages = await getConversationMessages(conversation.id);
      return NextResponse.json({ conversation, messages });
    }

    const latest = await latestConversation();
    if (!latest) return NextResponse.json({ conversation: null, latest: null, messages: [] });

    const gap = params.get("gap");
    if (gap !== null && isStale(latest.lastMessageAt, new Date(), normalizeGapHours(gap))) {
      return NextResponse.json({ conversation: null, latest, messages: [] });
    }

    const messages = await getConversationMessages(latest.id);
    return NextResponse.json({ conversation: latest, latest, messages });
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
