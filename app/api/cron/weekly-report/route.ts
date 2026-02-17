import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vercel Cron calls this every Sunday at 2 PM UTC (~9-10 AM EST)
export async function GET(request: NextRequest) {
  // Verify this is from Vercel Cron (or allow in development)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Create a reminder that will fire immediately and link to the weekly report
    await prisma.reminder.create({
      data: {
        title: "📊 Your Weekly Report is Ready!",
        body: "Tap to see your week in review — wins, trends, and your AI coach tip.",
        remindAt: new Date(), // Fire immediately
        url: "/trends?tab=weekly-report",
        fired: false,
      },
    });

    return NextResponse.json({ success: true, message: "Weekly report reminder created" });
  } catch (error) {
    console.error("Cron weekly report error:", error);
    return NextResponse.json(
      { error: "Failed to create weekly report reminder" },
      { status: 500 }
    );
  }
}
