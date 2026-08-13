import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET ?key= — one public-domain source excerpt (the citation sheet).

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const doc = await prisma.sourceDoc.findUnique({ where: { key } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(doc);
}
