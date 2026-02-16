import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/reminders/[id]/fire — mark a reminder as fired
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.reminder.update({
      where: { id },
      data: { fired: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to fire reminder:", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
