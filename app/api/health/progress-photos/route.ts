import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampInt } from "@/lib/request-body";

// Bounds (audit 2026-10, SEC-028/053). The gallery renders thumbnails from
// this list, so the list keeps the image data — bounded instead: a clamped
// page size, image data URLs only, a size cap, a note cap.
const MAX_IMAGE_CHARS = 4_000_000; // base64 of a compressed photo; Vercel caps a body at ~4.5 MB anyway
const MAX_NOTE = 2_000;
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|heic|heif|gif);base64,[A-Za-z0-9+/=\s]+$/;

// GET — list progress photos (most recent first)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampInt(searchParams.get("limit"), { fallback: 50, min: 1, max: 100 });
    const rawCursor = searchParams.get("cursor"); // for pagination
    const cursor = rawCursor && rawCursor.length <= 64 ? rawCursor : null;

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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { imageData, journalNote, takenAt } = body;

    if (typeof imageData !== "string" || !IMAGE_DATA_URL.test(imageData.slice(0, 64) + "AAAA")) {
      return NextResponse.json(
        { error: "imageData must be an image data URL (jpeg, png, webp, heic or gif)" },
        { status: 400 }
      );
    }
    if (imageData.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
    }
    if (journalNote != null && (typeof journalNote !== "string" || journalNote.length > MAX_NOTE)) {
      return NextResponse.json({ error: `journalNote must be text of at most ${MAX_NOTE} characters` }, { status: 400 });
    }
    const takenDate = typeof takenAt === "string" ? new Date(takenAt) : null;

    const photo = await prisma.progressPhoto.create({
      data: {
        imageData,
        journalNote: (journalNote as string | undefined) || null,
        takenAt: takenDate && Number.isFinite(takenDate.getTime()) ? takenDate : new Date(),
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
