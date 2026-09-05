import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHymn } from "@/lib/hymns";

// One hymn. Modeled on the ink [id] route: PATCH whitelists fields; DELETE is a
// soft delete unless ?purge=1; POST {action:"restore"} brings it back from the
// trash — a mis-tap is never the end of a hymn.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const hymn = await prisma.hymn.findUnique({ where: { id } });
    if (!hymn) return NextResponse.json({ error: "Hymn not found" }, { status: 404 });
    return NextResponse.json({ hymn: { ...hymn, stanzas: parseHymn(hymn.body) } });
  } catch (error) {
    console.error("Spirit hymn get error:", error);
    return NextResponse.json({ error: "Failed to load the hymn" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, string | null> = {};
    for (const k of ["title", "body", "photoData"] as const) {
      if (k in body && (typeof body[k] === "string" || body[k] === null)) data[k] = body[k] as string | null;
    }
    if (typeof data.photoData === "string" && data.photoData.length > 2_500_000) {
      return NextResponse.json({ error: "Photo too large" }, { status: 413 });
    }
    if (typeof data.title === "string" && !data.title.trim()) delete data.title;
    const hymn = await prisma.hymn.update({ where: { id }, data });
    return NextResponse.json({ hymn: { id: hymn.id, title: hymn.title } });
  } catch (error) {
    console.error("Spirit hymn patch error:", error);
    return NextResponse.json({ error: "Failed to update the hymn" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "restore") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await prisma.hymn.update({ where: { id }, data: { deletedAt: null } });
    return NextResponse.json({ restored: true });
  } catch (error) {
    console.error("Spirit hymn restore error:", error);
    return NextResponse.json({ error: "Failed to restore the hymn" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.get("purge") === "1") {
      await prisma.hymn.delete({ where: { id } });
      return NextResponse.json({ deleted: true, purged: true });
    }
    await prisma.hymn.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ deleted: true, restorable: true });
  } catch (error) {
    console.error("Spirit hymn delete error:", error);
    return NextResponse.json({ error: "Failed to delete the hymn" }, { status: 500 });
  }
}
