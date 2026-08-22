import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recognizeInk } from "@/lib/recognition";
import { json } from "@/lib/spirit-notebooks";
import { formatRef } from "@/lib/bible-refs";

// Handwriting → text layer. POST proposes (image in, proposal out — nothing
// saved); PUT confirms (text layer + found refs + the notes/links he kept).
// The AI's only new behavior on the desk: a proposal he accepts.

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { imageDataUrl?: string; scope?: string; context?: string };
    if (!body.imageDataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "imageDataUrl required" }, { status: 400 });
    }
    const page = await prisma.inkPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const notebook = page.notebookId ? await prisma.spiritNotebook.findUnique({ where: { id: page.notebookId } }) : null;
    const result = await recognizeInk({
      imageDataUrl: body.imageDataUrl,
      inkLang: notebook?.inkLang ?? "en",
      kind: page.kind,
      context: body.context ?? (page.refStart ? `passage ${formatRef(page.refStart, page.refEnd ?? page.refStart)}` : undefined),
    });
    const passage = page.refStart ? formatRef(page.refStart, page.refEnd ?? page.refStart) : null;
    return NextResponse.json({
      proposal: {
        text: result.text,
        lines: result.lines,
        summary: result.summary,
        refs: result.refs.map((r) => ({
          raw: r.raw,
          label: r.label,
          refStart: r.refStart,
          refEnd: r.refEnd,
          context: r.context,
          suggestedAction: r.suggestedAction,
          reason: r.reason,
          bbox: r.bbox ?? null,
          proposal:
            r.suggestedAction === "connection"
              ? `a Connection on ${passage ?? "this page's passage"} ⇄ ${r.label} · Parallels`
              : r.suggestedAction === "question"
                ? `an open Question — resurfaces at ${r.label}`
                : `live link + reference card`,
        })),
        scope: body.scope ?? "page",
      },
    });
  } catch (error) {
    console.error("Spirit ink transcribe error:", error);
    return NextResponse.json({ error: "Couldn't read the page" }, { status: 500 });
  }
}

interface ConfirmRef {
  refStart: number;
  refEnd?: number;
  label?: string;
  action: "connection" | "question" | "card" | "none";
  context?: string;
  reason?: string;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { text?: string; refs?: ConfirmRef[]; summary?: unknown; questions?: string[] };
    const page = await prisma.inkPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const kept: ConfirmRef[] = (body.refs ?? []).filter((r) => r && typeof r.refStart === "number" && r.action !== "none");
    const from = page.refStart ?? null;
    let created = 0;
    for (const r of kept) {
      const end = r.refEnd ?? r.refStart;
      if (r.action === "connection" && from) {
        await prisma.verseLink.create({
          data: { fromStart: from, fromEnd: page.refEnd ?? from, toStart: r.refStart, toEnd: end, reason: "parallels", why: r.context?.slice(0, 200) ?? null },
        });
        created++;
      } else if (r.action === "question") {
        await prisma.spiritNote.create({
          data: { refStart: r.refStart, refEnd: end, kind: "question", body: r.context?.trim() ? r.context.trim() : `From the page "${page.title || page.kind}" — ${r.label ?? formatRef(r.refStart, end)}`, spoken: false },
        });
        created++;
      }
    }
    for (const q of body.questions ?? []) {
      if (typeof q === "string" && q.trim() && from) {
        await prisma.spiritNote.create({ data: { refStart: from, refEnd: page.refEnd ?? from, kind: "question", body: q.trim(), spoken: false } });
        created++;
      }
    }
    const refs = Array.from(new Set([...(Array.isArray(page.refs) ? (page.refs as number[]) : []), ...(body.refs ?? []).map((r) => r.refStart)]));
    const saved = await prisma.inkPage.update({
      where: { id },
      data: {
        textLayer: typeof body.text === "string" ? body.text : page.textLayer,
        refs: json(refs),
        transcribedAt: new Date(),
      },
    });
    return NextResponse.json({ page: { ...saved, strokes: undefined }, created });
  } catch (error) {
    console.error("Spirit ink confirm error:", error);
    return NextResponse.json({ error: "Couldn't keep the page" }, { status: 500 });
  }
}
