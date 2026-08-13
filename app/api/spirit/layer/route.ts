import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// His study layer, one route. POST {type: highlight|note|link, ...} ·
// PATCH {type: "note", id, resolved} · DELETE ?type=&id=. Zero AI —
// highlights, notes, and links cost nothing (the standing rule).

const CATEGORIES = new Set([
  "God",
  "Promise & Covenant",
  "Command",
  "Sin & Consequence",
  "Christ",
  "Context",
]);
const NOTE_KINDS = new Set([
  "observation",
  "question",
  "connection",
  "conviction",
  "doctrine",
]);
const LINK_REASONS = new Set(["fulfills", "parallels", "tension"]);

function refPair(body: Record<string, unknown>, a = "refStart", b = "refEnd") {
  const start = Number(body[a]);
  const end = Number(body[b] ?? body[a]);
  if (!Number.isInteger(start) || start < 1_001_001) return null;
  return { start, end: Number.isInteger(end) && end >= start ? end : start };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const type = String(body.type ?? "");

    if (type === "highlight") {
      const refs = refPair(body);
      const category = String(body.category ?? "");
      if (!refs || !CATEGORIES.has(category)) {
        return NextResponse.json({ error: "Invalid highlight" }, { status: 400 });
      }
      const row = await prisma.highlight.create({
        data: {
          refStart: refs.start,
          refEnd: refs.end,
          category,
          origin: body.origin === "accepted" ? "accepted" : "user",
        },
      });
      return NextResponse.json(row);
    }

    if (type === "note") {
      const refs = refPair(body);
      const kind = String(body.kind ?? "");
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!refs || !NOTE_KINDS.has(kind) || !text) {
        return NextResponse.json({ error: "Invalid note" }, { status: 400 });
      }
      const row = await prisma.spiritNote.create({
        data: {
          refStart: refs.start,
          refEnd: refs.end,
          kind,
          body: text,
          spoken: Boolean(body.spoken),
        },
      });
      return NextResponse.json(row);
    }

    if (type === "link") {
      const from = refPair(body, "fromStart", "fromEnd");
      const to = refPair(body, "toStart", "toEnd");
      const reason = String(body.reason ?? "");
      if (!from || !to || !LINK_REASONS.has(reason)) {
        return NextResponse.json({ error: "Invalid link" }, { status: 400 });
      }
      const row = await prisma.verseLink.create({
        data: {
          fromStart: from.start,
          fromEnd: from.end,
          toStart: to.start,
          toEnd: to.end,
          reason,
          why: typeof body.why === "string" && body.why.trim() ? body.why.trim() : null,
        },
      });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Spirit layer error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as { type?: string; id?: string; resolved?: boolean };
  if (body.type !== "note" || !body.id) {
    return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
  }
  const row = await prisma.spiritNote.update({
    where: { id: body.id },
    data: { resolvedAt: body.resolved ? new Date() : null },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (type === "highlight") await prisma.highlight.delete({ where: { id } });
  else if (type === "note") await prisma.spiritNote.delete({ where: { id } });
  else if (type === "link") await prisma.verseLink.delete({ where: { id } });
  else return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
