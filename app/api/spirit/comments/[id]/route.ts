import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { entriesOk } from "@/lib/spirit-comments";

// One comment thread. PATCH replaces whitelisted fields (entries atomically —
// edit-in-place, append, and entry-delete all arrive as the new whole thread);
// DELETE is a soft delete behind the UI's tap-twice — deleting a comment leaves
// its mark as plain ink (the strokes belong to the overlay, not to this row).

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("entries" in body) {
      if (!entriesOk(body.entries)) return NextResponse.json({ error: "entries invalid" }, { status: 400 });
      data.entries = body.entries;
    }
    for (const k of ["wordStart", "wordEnd", "refEnd"] as const) {
      if (k in body && (typeof body[k] === "number" || body[k] === null)) data[k] = body[k];
    }
    if ("anchorText" in body && (typeof body.anchorText === "string" || body.anchorText === null)) {
      data.anchorText = typeof body.anchorText === "string" ? body.anchorText.slice(0, 400) : null;
    }
    if ("markStrokeIds" in body && Array.isArray(body.markStrokeIds)) {
      data.markStrokeIds = (body.markStrokeIds as unknown[]).filter((x) => typeof x === "string");
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "nothing to change" }, { status: 400 });
    const comment = await prisma.spiritComment.update({ where: { id }, data: data as never });
    return NextResponse.json({ comment: { id: comment.id, updatedAt: comment.updatedAt } });
  } catch (error) {
    console.error("Spirit comment patch error:", error);
    return NextResponse.json({ error: "Failed to update the comment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.get("purge") === "1") {
      await prisma.spiritComment.delete({ where: { id } });
      return NextResponse.json({ deleted: true, purged: true });
    }
    await prisma.spiritComment.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ deleted: true, restorable: true });
  } catch (error) {
    console.error("Spirit comment delete error:", error);
    return NextResponse.json({ error: "Failed to delete the comment" }, { status: 500 });
  }
}
