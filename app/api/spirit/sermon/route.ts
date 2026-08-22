import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSystemNotebooks, sermonTemplate, json, refsFromLabel, canonicalPage } from "@/lib/spirit-notebooks";
import { mergeDeskPrefs } from "@/lib/desk-prefs";
import { closeSermonWeek } from "@/lib/spirit-church";
import { recognizeInk } from "@/lib/recognition";
import { formatRef } from "@/lib/bible-refs";
import { parseReadingRef, readingSpan } from "@/lib/spirit-refs";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/timezone";

// Sunday (01 · 06): open the week's sermon page (pre-headed), close it with
// one proposal (transcription + refs + summary + the series week), confirm.

export const maxDuration = 60;

function weekOf(series: { weeks: unknown; currentWeek: number }, index: number) {
  const weeks = (Array.isArray(series.weeks) ? series.weeks : []) as { index: number; passageRef?: string; title?: string; context?: string; questions?: string[]; pageId?: string; status?: string }[];
  return weeks.find((w) => Number(w.index) === index) ?? null;
}

function dateLabel(d = new Date()) {
  const ds = getDateStringInTimeZone(d, DEFAULT_TIME_ZONE);
  const dt = new Date(`${ds}T12:00:00`);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).replace(",", " ·").toUpperCase();
}

export async function GET() {
  try {
    const series = await prisma.churchSeries.findFirst({ where: { status: "active" } });
    const latest = await prisma.inkPage.findFirst({ where: { kind: "sermon" }, orderBy: { updatedAt: "desc" } });
    const week = series ? weekOf(series, series.currentWeek) : null;
    const current = series ? await prisma.inkPage.findFirst({ where: { kind: "sermon", seriesId: series.id, weekIndex: series.currentWeek } }) : null;
    return NextResponse.json({ series, week, page: current ?? latest ?? null });
  } catch (error) {
    console.error("Spirit sermon error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "open");

    if (action === "open") {
      const series = await prisma.churchSeries.findFirst({ where: { status: "active" } });
      const nbs = await ensureSystemNotebooks();
      const prefs = mergeDeskPrefs((await prisma.spiritPref.findUnique({ where: { id: "main" } }))?.desk ?? null);
      const weekIndex = series ? series.currentWeek : 0;
      // fresh: "New page" in the Sermons notebook — a second page today (evening service, a
      // different preacher) must not collapse into the morning's page
      const fresh = body.fresh === true;
      let page = series && !fresh
        ? await prisma.inkPage.findFirst({ where: { kind: "sermon", seriesId: series.id, weekIndex } })
        : null;
      const week = series ? weekOf(series, weekIndex) : null;
      if (!page) {
        const passageLabel = week?.passageRef ?? "";
        const refs = refsFromLabel(passageLabel);
        page = await prisma.inkPage.create({
          data: {
            notebookId: nbs.sermons.id,
            kind: "sermon",
            title: series ? `${series.title.split("—")[0].trim()} — week ${weekIndex}` : `Sermon · ${dateLabel()}`,
            subtitle: [dateLabel(), prefs.sermon.church, prefs.sermon.preacher].filter(Boolean).join(" · "),
            seriesId: series?.id ?? null,
            weekIndex: series ? weekIndex : null,
            refStart: refs.refStart,
            refEnd: refs.refEnd,
            background: "dots",
            objects: json(
              sermonTemplate({
                dateLabel: dateLabel(),
                church: prefs.sermon.church,
                preacher: prefs.sermon.preacher,
                seriesTitle: series ? series.title.split("—")[0].trim() : `Sermon · ${dateLabel()}`,
                weekIndex: series ? weekIndex : 0,
                passageLabel,
              }),
            ),
            strokes: json([]),
          },
        });
        if (series) {
          const weeks = (Array.isArray(series.weeks) ? series.weeks : []) as Record<string, unknown>[];
          await prisma.churchSeries.update({
            where: { id: series.id },
            data: { weeks: JSON.parse(JSON.stringify(weeks.map((w) => (Number(w.index) === weekIndex ? { ...w, pageId: page!.id } : w)))) },
          });
        }
      }
      const recording = page.recordingId ? await prisma.recording.findUnique({ where: { id: page.recordingId } }) : null;
      if (!fresh) {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        page = await canonicalPage(series ? { kind: "sermon", seriesId: series.id, weekIndex } : { kind: "sermon", seriesId: null, createdAt: { gte: dayStart } }, page);
      }
      return NextResponse.json({ page, series, week, recording, prefs: { church: prefs.sermon.church, preacher: prefs.sermon.preacher, consent: prefs.recording.consent, retention: prefs.recording.retention } });
    }

    if (action === "close") {
      const pageId = String(body.pageId ?? "");
      const page = await prisma.inkPage.findUnique({ where: { id: pageId } });
      if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const notebook = page.notebookId ? await prisma.spiritNotebook.findUnique({ where: { id: page.notebookId } }) : null;
      const passage = page.refStart ? formatRef(page.refStart, page.refEnd ?? page.refStart) : null;
      let recognition = null;
      if (typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")) {
        recognition = await recognizeInk({ imageDataUrl: body.imageDataUrl, inkLang: notebook?.inkLang ?? "en", kind: "sermon", context: passage ? `sermon on ${passage}` : "sermon notes" });
      }
      const typedText = Array.isArray(page.objects)
        ? (page.objects as { type?: string; data?: { text?: string } }[]).filter((o) => o.type === "text" && o.data?.text).map((o) => String(o.data?.text)).join("\n")
        : "";
      const text = [recognition?.text ?? "", typedText].filter(Boolean).join("\n");
      const refs = (recognition?.refs ?? []).map((r) => ({
        raw: r.raw,
        label: r.label,
        refStart: r.refStart,
        refEnd: r.refEnd,
        context: r.context,
        suggestedAction: r.suggestedAction,
        reason: r.reason,
        bbox: r.bbox ?? null,
        alreadyCard: Array.isArray(page.objects) && (page.objects as { type?: string; data?: { refStart?: number } }[]).some((o) => o.type === "refcard" && o.data?.refStart === r.refStart),
        proposal:
          r.suggestedAction === "connection"
            ? `a Connection on ${passage ?? "the passage"} ⇄ ${r.label} · Parallels`
            : r.suggestedAction === "question"
              ? `an open Question — resurfaces at ${r.label}`
              : `live link + reference card`,
      }));
      const series = page.seriesId ? await prisma.churchSeries.findUnique({ where: { id: page.seriesId } }) : null;
      const week = series && page.weekIndex ? weekOf(series, page.weekIndex) : null;
      return NextResponse.json({
        proposal: {
          pageId: page.id,
          text,
          lines: recognition?.lines ?? [],
          refs,
          summary: recognition?.summary ?? { bigIdea: null, points: [], quotes: [], questions: [] },
          series: series ? { id: series.id, title: series.title, weekIndex: page.weekIndex, weekTitle: week?.title ?? null, current: series.currentWeek === page.weekIndex } : null,
        },
      });
    }

    if (action === "confirm") {
      const pageId = String(body.pageId ?? "");
      const page = await prisma.inkPage.findUnique({ where: { id: pageId } });
      if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const refs = (Array.isArray(body.refs) ? body.refs : []) as { refStart: number; refEnd?: number; label?: string; action: string; context?: string }[];
      const questions = (Array.isArray(body.questions) ? body.questions : []) as string[];
      const from = page.refStart ?? null;
      let kept = 0;
      for (const r of refs) {
        if (!r || typeof r.refStart !== "number") continue;
        const end = r.refEnd ?? r.refStart;
        if (r.action === "connection" && from) {
          await prisma.verseLink.create({ data: { fromStart: from, fromEnd: page.refEnd ?? from, toStart: r.refStart, toEnd: end, reason: "parallels", why: r.context?.slice(0, 200) ?? null } });
          kept++;
        } else if (r.action === "question") {
          await prisma.spiritNote.create({ data: { refStart: r.refStart, refEnd: end, kind: "question", body: r.context?.trim() || `From Sunday's page — ${r.label ?? formatRef(r.refStart, end)}`, spoken: false } });
          kept++;
        }
      }
      for (const q of questions) {
        if (typeof q === "string" && q.trim() && from) {
          await prisma.spiritNote.create({ data: { refStart: from, refEnd: page.refEnd ?? from, kind: "question", body: q.trim(), spoken: false } });
          kept++;
        }
      }
      const saved = await prisma.inkPage.update({
        where: { id: pageId },
        data: {
          textLayer: typeof body.text === "string" ? body.text : page.textLayer,
          refs: json(Array.from(new Set([...(Array.isArray(page.refs) ? (page.refs as number[]) : []), ...refs.map((r) => r.refStart)]))),
          transcribedAt: new Date(),
        },
      });
      let series = null;
      if (page.seriesId && page.weekIndex && body.advance !== false) {
        series = await closeSermonWeek({ seriesId: page.seriesId, weekIndex: page.weekIndex, pageId: page.id, recordingId: page.recordingId, carried: questions.length + refs.filter((r) => r.action === "question").length });
      }
      return NextResponse.json({ page: { ...saved, strokes: undefined }, kept, series });
    }

    if (action === "header") {
      // Editable header: church · preacher · passage (remembered as defaults).
      const pageId = String(body.pageId ?? "");
      const page = await prisma.inkPage.findUnique({ where: { id: pageId } });
      if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const church = typeof body.church === "string" ? body.church.trim() : null;
      const preacher = typeof body.preacher === "string" ? body.preacher.trim() : null;
      const passage = typeof body.passage === "string" ? body.passage.trim() : null;
      const objects = (Array.isArray(page.objects) ? page.objects : []) as { type: string; data: Record<string, unknown> }[];
      const header = objects.find((o) => o.type === "header");
      if (header) {
        const kicker = [dateLabel(page.createdAt), church ?? "", preacher ?? ""].filter(Boolean).join(" · ").toUpperCase();
        header.data = { ...header.data, kicker, chips: passage ? [passage.toUpperCase()] : header.data.chips };
      }
      const span = passage ? readingSpan(parseReadingRef(passage)) : null;
      const saved = await prisma.inkPage.update({
        where: { id: pageId },
        data: { objects: json(objects), ...(span ? { refStart: span.refStart, refEnd: span.refEnd } : {}), subtitle: [dateLabel(page.createdAt), church, preacher].filter(Boolean).join(" · ") },
      });
      if (church !== null || preacher !== null) {
        const row = await prisma.spiritPref.findUnique({ where: { id: "main" } });
        const prefs = mergeDeskPrefs(row?.desk ?? null);
        prefs.sermon = { church: church ?? prefs.sermon.church, preacher: preacher ?? prefs.sermon.preacher };
        await prisma.spiritPref.upsert({ where: { id: "main" }, create: { id: "main", desk: JSON.parse(JSON.stringify(prefs)) }, update: { desk: JSON.parse(JSON.stringify(prefs)) } });
      }
      return NextResponse.json({ page: { ...saved, strokes: undefined } });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Spirit sermon action error:", error);
    return NextResponse.json({ error: "Sermon action failed" }, { status: 500 });
  }
}
