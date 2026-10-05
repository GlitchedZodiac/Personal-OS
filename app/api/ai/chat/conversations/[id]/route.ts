import { NextRequest, NextResponse } from "next/server";
import { renameConversation } from "@/lib/chat-conversations";

// PATCH { title } — his own name for a chat. Sending an empty title hands
// naming back to the app (first words of the chat). There is deliberately no
// DELETE here: nothing in chat history is removable from the UI.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const conversation = await renameConversation(id, body.title);
    if (!conversation) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("Chat rename error:", error);
    return NextResponse.json({ error: "Failed to rename" }, { status: 500 });
  }
}
