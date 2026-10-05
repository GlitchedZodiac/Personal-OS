// The notification sweep (2026-08-28 as "due reminders as real pushes";
// 2026-10-04 everything time-driven): due reminders, notifications whose
// quiet hours have ended, and the pipeline-health check behind system
// alerts. All of it lives in lib/notify.ts; this route is only the clock.
//
// CADENCE. Vercel Hobby runs each cron once a day, ±59 minutes — a `*/15`
// here once made Vercel reject the whole production deployment. Hobby does
// allow 100 cron jobs, though, so vercel.json lists this route 24 times, one
// per hour: an hourly floor, at no cost and with no new infrastructure.
// Between those, anything that already talks to the server triggers the
// same sweep (an open app every minute; the watch and the phone companion
// whenever they check in), so in practice a timed reminder lands within
// minutes. EXACT-minute delivery is not possible on this plan — see
// docs/push-notifications.md for the two ways to get it.

import { NextRequest, NextResponse } from "next/server";
import { runNotificationSweep } from "@/lib/notify";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNotificationSweep({ full: true });
    return NextResponse.json({
      due: result.reminders.due,
      sent: result.reminders.delivered,
      waiting: result.reminders.waiting,
      expired: result.reminders.expired,
      flushed: result.flushed,
      alerts: result.alerts,
    });
  } catch (error) {
    console.error("Notification sweep error:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
