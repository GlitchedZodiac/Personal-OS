import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reminders/due — get reminders that are due and haven't fired yet
export async function GET() {
  try {
    const now = new Date();

    const dueReminders = await prisma.reminder.findMany({
      where: {
        fired: false,
        remindAt: { lte: now },
      },
      orderBy: { remindAt: "asc" },
      take: 10, // max 10 at a time
    });

    return NextResponse.json(
      dueReminders.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body || r.title,
        url: r.url,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch due reminders:", error);
    return NextResponse.json([]);
  }
}
