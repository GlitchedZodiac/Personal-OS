import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — get a single progress photo with full image data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const photo = await prisma.progressPhoto.findUnique({
      where: { id },
    });

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    return NextResponse.json(photo);
  } catch (error) {
    console.error("Progress photo GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress photo" },
      { status: 500 }
    );
  }
}

// PATCH — update journal note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const photo = await prisma.progressPhoto.update({
      where: { id },
      data: { journalNote: body.journalNote },
    });

    return NextResponse.json({
      id: photo.id,
      takenAt: photo.takenAt,
      journalNote: photo.journalNote,
    });
  } catch (error) {
    console.error("Progress photo PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update progress photo" },
      { status: 500 }
    );
  }
}
