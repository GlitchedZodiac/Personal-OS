import { NextRequest, NextResponse } from "next/server";
import { runNotificationSweep } from "@/lib/notify";

// GET /api/reminders/due — the open app's heartbeat (components/
// notification-heartbeat.tsx, once a minute while visible).
//
// It used to hand the due reminders to the tab, which showed them as local
// notifications and then marked them fired — so a reminder reached only the
// one device that happened to have Pitaya open. Now the SERVER delivers:
// every call runs the same sweep the cron runs, pushing to every subscribed
// device.
//
//   ?local=1  the caller can show notifications but has no push subscription
//             of its own, so it also gets the reminders back to show itself.
//
// The response is still an array, and nothing in it needs marking fired —
// the sweep already claimed each one — so a tab running the previous build's
// poll keeps working against this route.

export async function GET(request: NextRequest) {
  try {
    const canShowLocally = request.nextUrl.searchParams.get("local") === "1";
    const result = await runNotificationSweep({ canShowLocally });
    return NextResponse.json(canShowLocally ? result.reminders.local : []);
  } catch (error) {
    console.error("Failed to sweep due reminders:", error);
    return NextResponse.json([]);
  }
}
