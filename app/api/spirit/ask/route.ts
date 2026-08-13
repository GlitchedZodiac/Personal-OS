import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateChatText } from "@/lib/openai-text";
import { CHAT_MODEL } from "@/lib/openai";
import { getPassage } from "@/lib/esv";
import { formatRef } from "@/lib/bible-refs";

export const maxDuration = 60;

// POST {refStart, refEnd, question} — the passage-anchored Ask.
// RETRIEVAL, NEVER RECALL (docs/spirit-journal-plan.md §1): the model
// sees the passage text and the stored public-domain sources, may quote
// ONLY from those, and must say so plainly when the library has nothing.
// The exchange persists on the passage — searchable forever. Opt-in
// only: this route runs when he taps Ask, never on a schedule.

const HARD_LINES = `You are the study assistant inside Pitaya's Spirit section for one Reformed (Calvinist) user. Rules that outrank everything:
- You may quote ONLY from the SOURCES block below, and every quote must name its source key in citations. If no source below addresses the question, say plainly that his library doesn't cover it yet — never invent or recall a quotation from memory.
- You teach from Scripture and the provided sources; you never claim revelation, never speak for God about his life, never assess his spiritual state.
- If the question concerns grief, crisis, or urgent personal sin, say warmly that this belongs with his pastor and elders, and stop.
- Plain text, 2-5 sentences, serious and warm. Respond as JSON: {"answer": string, "citations": [{"label": string, "key": string}]} — citations may be empty.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      refStart?: number;
      refEnd?: number;
      question?: string;
    };
    const refStart = Number(body.refStart);
    const refEnd = Number(body.refEnd ?? body.refStart);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!Number.isInteger(refStart) || !question) {
      return NextResponse.json({ error: "refStart and question required" }, { status: 400 });
    }

    const refLabel = formatRef(refStart, refEnd);
    const [sources, passage] = await Promise.all([
      prisma.sourceDoc.findMany(),
      getPassage(refLabel).catch(() => null),
    ]);

    const sourceBlock = sources
      .map((s) => `[${s.key}] ${s.title} (${s.meta})\n${s.body}`)
      .join("\n\n");
    const passageText = passage
      ? passage.verses.map((v) => `${v.verseNum} ${v.text}`).join("\n")
      : "";

    const { text } = await generateChatText({
      model: CHAT_MODEL,
      surface: "spirit_ask",
      maxCompletionTokens: 1200,
      retryMaxCompletionTokens: 2000,
      reasoningEffort: "low",
      messages: [
        { role: "system", content: HARD_LINES },
        {
          role: "user",
          content: `PASSAGE (${refLabel}, ESV):\n${passageText}\n\nSOURCES:\n${sourceBlock || "(none stored yet)"}\n\nQUESTION (anchored to ${refLabel}): ${question}`,
        },
      ],
    });

    let answer = "";
    let citations: { label: string; key: string }[] = [];
    try {
      const parsed = JSON.parse((text ?? "").replace(/^```json?\s*|\s*```$/g, ""));
      answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
      if (Array.isArray(parsed.citations)) {
        const valid = new Set(sources.map((s) => s.key));
        citations = parsed.citations.filter(
          (c: { key?: string }) => typeof c.key === "string" && valid.has(c.key)
        );
      }
    } catch {
      answer = (text ?? "").trim();
    }
    if (!answer) {
      return NextResponse.json({ error: "No answer produced" }, { status: 502 });
    }

    // Persist on the passage — one thread per exact range, appended.
    const existing = await prisma.studyThread.findFirst({
      where: { refStart, refEnd },
    });
    const message = [
      { role: "user", content: question },
      { role: "assistant", content: answer, citations },
    ];
    const thread = existing
      ? await prisma.studyThread.update({
          where: { id: existing.id },
          data: {
            messages: [...(existing.messages as object[]), ...message],
          },
        })
      : await prisma.studyThread.create({
          data: { refStart, refEnd, messages: message },
        });

    return NextResponse.json({ threadId: thread.id, answer, citations, refLabel });
  } catch (error) {
    console.error("Spirit ask error:", error);
    return NextResponse.json({ error: "Ask failed" }, { status: 500 });
  }
}
