import { NextRequest, NextResponse } from "next/server";
import { carriedHomework } from "@/lib/spirit-homework";
import { pushConfigured, sendPush } from "@/lib/push";

// The one notification this app sends: the homework he is carrying,
// named once in the evening. Scheduled at 00:00 UTC = 7pm in Bogotá.
//
// It never fires when there is nothing carried, never chases a streak,
// and never asks him back into the app for the app's sake. If he ticked
// it during the day, the evening is quiet.

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ sent: 0, skipped: "push not configured" });
  }

  const carrying = await carriedHomework();
  if (!carrying) {
    return NextResponse.json({ sent: 0, skipped: "nothing carried" });
  }

  const result = await sendPush({
    title: `Carrying · ${carrying.label}`,
    body: carrying.text,
    url: "/spirit",
    tag: "spirit-homework",
  });

  return NextResponse.json({ ...result, dayId: carrying.dayId });
}
