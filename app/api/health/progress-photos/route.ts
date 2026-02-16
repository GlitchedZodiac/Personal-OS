import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list progress photos (most recent first)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor"); // for pagination

    const photos = await prisma.progressPhoto.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { takenAt: "desc" },
    });

    return NextResponse.json(photos);
  } catch (error) {
    console.error("Progress photos GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress photos" },
      { status: 500 }
    );
  }
}

// POST — upload a new progress photo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageData, journalNote, takenAt } = body;

    if (!imageData) {
      return NextResponse.json(
        { error: "imageData is required" },
        { status: 400 }
      );
    }

    const photo = await prisma.progressPhoto.create({
      data: {
        imageData,
        journalNote: journalNote || null,
        takenAt: takenAt ? new Date(takenAt) : new Date(),
      },
    });

    return NextResponse.json(photo);
  } catch (error) {
    console.error("Progress photos POST error:", error);
    return NextResponse.json(
      { error: "Failed to save progress photo" },
      { status: 500 }
    );
  }
}

// DELETE — remove a progress photo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await prisma.progressPhoto.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress photos DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete progress photo" },
      { status: 500 }
    );
  }
}
