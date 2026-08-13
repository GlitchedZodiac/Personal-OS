import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRef } from "@/lib/bible-refs";

// GET — everything he wrote, one markdown file, always works.
// His words are his: notes, highlights, links, Ask threads, memory
// deck, reading log. No ESV passage text is exported (license).

export async function GET() {
  try {
    const [notes, highlights, links, threads, cards, logs, terms] =
      await Promise.all([
        prisma.spiritNote.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.highlight.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.verseLink.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.studyThread.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.memoryVerse.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.readingLog.findMany({ orderBy: { readAt: "asc" } }),
        prisma.term.findMany({ orderBy: { orderIndex: "asc" } }),
      ]);

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const lines: string[] = [
      "# Spirit — the export",
      "",
      `Exported ${day(new Date())} · notes, highlights, questions, links, Ask threads, memory deck, reading log.`,
      "",
    ];

    lines.push("## Notes");
    if (!notes.length) lines.push("", "_None yet._");
    for (const n of notes) {
      lines.push(
        "",
        `- **${formatRef(n.refStart, n.refEnd)}** · ${n.kind}${
          n.kind === "question" && !n.resolvedAt ? " · OPEN" : ""
        } · ${day(n.createdAt)}`,
        `  > ${n.body.replace(/\n/g, "\n  > ")}`,
      );
    }

    lines.push("", "## Highlights");
    if (!highlights.length) lines.push("", "_None yet._");
    for (const h of highlights) {
      lines.push(
        `- **${formatRef(h.refStart, h.refEnd)}** · ${h.category}${
          h.origin === "accepted" ? " · accepted suggestion" : ""
        } · ${day(h.createdAt)}`,
      );
    }

    lines.push("", "## Links");
    if (!links.length) lines.push("", "_None yet._");
    for (const l of links) {
      lines.push(
        `- **${formatRef(l.fromStart, l.fromEnd)}** ⇄ **${formatRef(l.toStart, l.toEnd)}** · ${l.reason}${l.why ? ` — ${l.why}` : ""}`,
      );
    }

    lines.push("", "## Ask threads");
    if (!threads.length) lines.push("", "_None yet._");
    for (const t of threads) {
      lines.push("", `### ${formatRef(t.refStart, t.refEnd)} · ${day(t.createdAt)}`);
      const msgs = Array.isArray(t.messages)
        ? (t.messages as { role?: string; content?: string }[])
        : [];
      for (const m of msgs) {
        if (!m.content) continue;
        lines.push("", `**${m.role === "user" ? "Q" : "A"}:** ${m.content}`);
      }
    }

    lines.push("", "## Memory deck");
    if (!cards.length) lines.push("", "_None yet._");
    for (const c of cards) {
      lines.push(
        `- **${c.refLabel}** · ${c.occasion}${c.why ? ` — ${c.why}` : ""}`,
      );
    }

    lines.push("", "## Reading log");
    if (!logs.length) lines.push("", "_None yet._");
    for (const r of logs) {
      lines.push(`- ${day(r.readAt)} · ${r.label} · ${r.medium} · ${r.track}`);
    }

    lines.push("", "## Terms");
    for (const t of terms) {
      lines.push(`- T${t.orderIndex} · ${t.title} · ${t.status}`);
    }
    lines.push("");

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="spirit-export-${day(new Date())}.md"`,
      },
    });
  } catch (error) {
    console.error("Spirit export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
