import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateChatText } from "@/lib/openai-text";
import { CHAT_MODEL } from "@/lib/openai";
import { getPassage } from "@/lib/esv";
import { formatRef } from "@/lib/bible-refs";

export const maxDuration = 60;

// POST {refStart, refEnd, question} — the passage-anchored Ask.
//
// NO QUOTATION WITHOUT A SOURCE — but always an answer (2026-08-20, his
// feedback: "asking should be available as a resource, it shouldn't just
// block me"). The original rule conflated two things: inventing
// quotations, which stays forbidden, and answering at all, which was
// never the point. On 2026-08-19 he asked what Paul meant by "keep her
// as his betrothed" in 1 Cor 7:37 and got a refusal — a dead end where a
// teacher was wanted.
//
// So: quotes and attributions come from the stored library or they don't
// exist; everything else is taught plainly in the assistant's own words
// and LABELLED as such (`grounded: false`), so he always knows whether he
// is reading Matthew Henry or the machine. The exchange persists on the
// passage — searchable forever. Opt-in only: this route runs when he taps
// Ask, never on a schedule.

const HARD_LINES = `You are the study assistant inside Pitaya's Spirit section for one Reformed (Calvinist) user. Rules that outrank everything:
- ALWAYS answer the question. You are a resource, not a gate.
- QUOTATIONS AND ATTRIBUTIONS come only from the SOURCES block below, cited by exact source key. Never invent, recall, or paraphrase-as-quote any commentary, confession, council, or author that is not in that block — not even one you are confident about. No "Calvin says", no "the Westminster divines held", unless it is in SOURCES.
- When SOURCES covers the question: answer from it, quote it, cite it, and set "grounded": true.
- When SOURCES does not cover it: still answer — teach from the passage itself, its immediate context, the wider canon, and ordinary Reformed understanding, in your own words. Set "grounded": false and leave citations empty. Where the answer is genuinely disputed among orthodox interpreters, say so and give the main readings rather than picking one.
- Scripture may be referenced and explained freely.
- You never claim revelation, never speak for God about his life, never assess his spiritual state.
- If the question concerns grief, crisis, or urgent personal sin, say warmly that this belongs with his pastor and elders, and stop.
- Plain text, 2-6 sentences, serious and warm. Respond as JSON: {"answer": string, "citations": [{"label": string, "key": string}], "grounded": boolean}.`;

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
    let grounded = false;
    try {
      const parsed = JSON.parse((text ?? "").replace(/^```json?\s*|\s*```$/g, ""));
      answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
      if (Array.isArray(parsed.citations)) {
        const valid = new Set(sources.map((s) => s.key));
        citations = parsed.citations.filter(
          (c: { key?: string }) => typeof c.key === "string" && valid.has(c.key)
        );
      }
      // Grounded means "a stored source is actually cited" — the model's
      // own claim is not enough to earn the label.
      grounded = citations.length > 0 && parsed.grounded !== false;
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
      { role: "assistant", content: answer, citations, grounded },
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

    return NextResponse.json({ threadId: thread.id, answer, citations, grounded, refLabel });
  } catch (error) {
    console.error("Spirit ask error:", error);
    return NextResponse.json({ error: "Ask failed" }, { status: 500 });
  }
}
