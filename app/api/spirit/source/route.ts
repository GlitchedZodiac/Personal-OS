import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET ?key= — one public-domain source excerpt (the citation sheet).
// GET without key — the whole shelf, for the Library screen, with how
// often each source has been cited across the generated studies.

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (key) {
    const doc = await prisma.sourceDoc.findUnique({ where: { key } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  }

  const [docs, days] = await Promise.all([
    prisma.sourceDoc.findMany({ orderBy: { title: "asc" } }),
    prisma.devotionalDay.findMany({ select: { citations: true } }),
  ]);
  const citedCount = new Map<string, number>();
  for (const d of days) {
    for (const c of (Array.isArray(d.citations) ? d.citations : []) as { sourceKey?: string }[]) {
      if (c.sourceKey) citedCount.set(c.sourceKey, (citedCount.get(c.sourceKey) ?? 0) + 1);
    }
  }
  return NextResponse.json({
    sources: docs.map((d) => ({
      key: d.key,
      title: d.title,
      meta: d.meta,
      excerpt: d.body.slice(0, 140),
      cited: citedCount.get(d.key) ?? 0,
    })),
  });
}
