// Due reminders as real pushes (2026-08-28). Until now a Reminder only
// reached him if a tab was open in the foreground (the 30 s poll in
// sw-register) — this cron delivers the rest. Claim-first: the fired flag
// flips atomically before the send, so the poll and the cron never
// double-deliver, and a re-run never repeats. Every row here is something he
// (or an automation he configured) asked to be reminded of — the lib/push.ts
// rule holds.
//
// CADENCE (2026-08-28): scheduled */15 originally — Vercel rejected the
// whole deployment in 5 seconds (Hobby crons are daily-precision; the plan's
// own fallback applied). Now a daily 11:00 UTC (6am Bogotá) sweep; the
// foreground poll stays the same-moment path while a tab is open. Restoring
// 15-min delivery = Vercel Pro, or a free GitHub-Actions pinger hitting this
// route with CRON_SECRET — Michael's call, filed in deferred-items.

import { NextRequest, NextResponse } from "next/server";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { prisma } from "@/lib/prisma";
import { pushConfigured, sendPush } from "@/lib/push";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ sent: 0, skipped: "push not configured" });
  }
  const prefs = await getNotificationPrefs();
  if (!prefs.dueReminders) {
    return NextResponse.json({ sent: 0, skipped: "dueReminders pref off" });
  }

  const due = await prisma.reminder.findMany({
    where: { fired: false, remindAt: { lte: new Date() } },
    orderBy: { remindAt: "asc" },
    take: 10,
  });

  // A reminder more than 48h past due is a backlog artifact, not a moment —
  // the prod table carried months of pre-push "Weekly Report" rows, and
  // blasting them at the first subscribed device would be the worst possible
  // first impression. They still get claimed, just silently.
  const freshnessCutoff = Date.now() - 48 * 3600 * 1000;

  let sent = 0;
  let expired = 0;
  for (const reminder of due) {
    const claimed = await prisma.reminder.updateMany({
      where: { id: reminder.id, fired: false },
      data: { fired: true },
    });
    if (claimed.count === 0) continue; // the foreground poll got there first
    if (reminder.remindAt.getTime() < freshnessCutoff) {
      expired++;
      continue;
    }
    const result = await sendPush({
      title: reminder.title,
      body: reminder.body ?? reminder.title,
      url: reminder.url || "/todos",
      tag: `reminder-${reminder.id}`,
    });
    if (result.sent > 0) sent++;
  }

  return NextResponse.json({ due: due.length, sent, expired });
}
