import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/reminders — create a reminder
export async function POST(request: NextRequest) {
  try {
    const { title, body, remindAt, url, todoId } = await request.json();

    if (!title || !remindAt) {
      return NextResponse.json({ error: "title and remindAt required" }, { status: 400 });
    }

    const reminder = await prisma.reminder.create({
      data: {
        title,
        body: body || null,
        remindAt: new Date(remindAt),
        url: url || "/todos",
        todoId: todoId || null,
      },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Failed to create reminder:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

// GET /api/reminders — list all reminders
export async function GET() {
  try {
    const reminders = await prisma.reminder.findMany({
      orderBy: { remindAt: "asc" },
      where: { fired: false },
    });
    return NextResponse.json(reminders);
  } catch (error) {
    console.error("Failed to fetch reminders:", error);
    return NextResponse.json([]);
  }
}
