import { NextRequest, NextResponse } from "next/server";
import { adoptUnfiledMessages, listConversations } from "@/lib/chat-conversations";

// The chat shelf: every conversation, newest first.
//
//   ?q=      free text — titles, anything said, and the food named on a card
//   ?from= / ?to=   YYYY-MM-DD in ?tz= (the device's timezone)
//
// Grouping into Today / This week / … is the drawer's job: it depends on the
// timezone of the device doing the looking, and nothing about it is stored.
// Cookie-gated by proxy.ts like every /api route.

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    // Fold any message the pre-conversations deploy wrote into its day
    // before listing, so the shelf can never be missing the newest chat.
    await adoptUnfiledMessages();
    const conversations = await listConversations({
      q: params.get("q"),
      from: params.get("from"),
      to: params.get("to"),
      timeZone: params.get("tz"),
    });
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Chat conversations list error:", error);
    return NextResponse.json({ error: "Failed to load chats" }, { status: 500 });
  }
}
