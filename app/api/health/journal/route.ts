import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 20_000;

// One journal entry per local day ("Tonight's page"). Voice memos land here
// as appended transcript paragraphs.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const localDate = searchParams.get("date") ?? "";
    if (!LOCAL_DATE_RE.test(localDate)) {
      return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
    }
    const entry = await prisma.journalEntry.findUnique({ where: { localDate } });
    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Journal fetch error:", error);
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}

// POST { localDate, text?, append?, photoData? } — upsert; append adds a
// paragraph; photoData (base64 jpeg, one per day) attaches the habit photo.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const localDate = typeof body.localDate === "string" ? body.localDate : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const append = body.append === true;
    const photoData =
      typeof body.photoData === "string" && body.photoData.startsWith("data:image/")
        ? body.photoData
        : null;

    if (!LOCAL_DATE_RE.test(localDate) || (!text && !photoData)) {
      return NextResponse.json(
        { error: "localDate plus text or photoData required" },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: "Entry too long" }, { status: 400 });
    }
    if (photoData && photoData.length > 2_500_000) {
      return NextResponse.json({ error: "Photo too large" }, { status: 400 });
    }

    const existing = await prisma.journalEntry.findUnique({ where: { localDate } });
    const nextText = text
      ? append && existing?.text
        ? `${existing.text}\n\n${text}`
        : text
      : (existing?.text ?? "");

    const entry = await prisma.journalEntry.upsert({
      where: { localDate },
      create: { localDate, text: nextText, photoData },
      update: {
        text: nextText.slice(0, MAX_TEXT),
        ...(photoData ? { photoData } : {}),
      },
    });

    // Journalling counts as the "journal" habit — tick it automatically.
    await prisma.habitCheck.upsert({
      where: { name_localDate: { name: "journal", localDate } },
      create: { name: "journal", localDate },
      update: {},
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Journal save error:", error);
    return NextResponse.json({ error: "Failed to save journal" }, { status: 500 });
  }
}
