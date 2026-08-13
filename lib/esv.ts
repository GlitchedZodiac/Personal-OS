import { prisma } from "@/lib/prisma";
import {
  normalizeQuery,
  transformPassage,
  type PassageModel,
} from "@/lib/esv-transform";

export type { PassageModel, VerseSegment } from "@/lib/esv-transform";

// Crossway ESV API client + passage cache + HTML→verse-model transform.
//
// LICENSE CONSTRAINT (docs/spirit-journal-plan.md §3): the cache is an
// LRU with pinning, never a full-canon store — Crossway forbids
// assembling a substantially complete ESV copy. Term passages pin for
// the term; everything else evicts oldest-accessed first.

const ESV_BASE = "https://api.esv.org/v3/passage";
// Unpinned cache budget. ~200 chapters ≈ well under "substantially
// complete" (1,189 chapters); tune down, never meaningfully up.
const MAX_UNPINNED = 200;

function apiKey(): string {
  const key = process.env.ESV_API_KEY;
  if (!key) throw new Error("ESV_API_KEY is not configured");
  return key;
}

async function fetchFromApi(q: string): Promise<{
  canonical: string;
  html: string;
}> {
  const params = new URLSearchParams({
    q,
    "include-footnotes": "true",
    "include-crossrefs": "true",
    "include-verse-anchors": "true",
    "include-audio-link": "true",
    "include-headings": "true",
    "include-css-link": "false",
    "include-short-copyright": "true",
  });
  const res = await fetch(`${ESV_BASE}/html/?${params.toString()}`, {
    headers: { Authorization: `Token ${apiKey()}` },
  });
  if (!res.ok) {
    throw new Error(`ESV API ${res.status}`);
  }
  const body = (await res.json()) as { canonical: string; passages: string[] };
  if (!body.passages?.length) throw new Error("Passage not found");
  return { canonical: body.canonical, html: body.passages.join("\n") };
}

/** Cached passage fetch. Pinned passages never evict (term readings). */
export async function getPassage(
  q: string,
  opts: { pin?: boolean } = {}
): Promise<PassageModel> {
  const queryKey = normalizeQuery(q);
  const cached = await prisma.esvPassage.findUnique({ where: { queryKey } });

  let html: string;
  let canonical: string;
  if (cached) {
    ({ html, canonical } = cached);
    await prisma.esvPassage.update({
      where: { queryKey },
      data: {
        lastAccessAt: new Date(),
        ...(opts.pin && !cached.pinned ? { pinned: true } : {}),
      },
    });
  } else {
    ({ html, canonical } = await fetchFromApi(q));
    const model = transformPassage(queryKey, canonical, html);
    await prisma.esvPassage.create({
      data: {
        queryKey,
        canonical,
        html,
        verseCount: model.verses.length,
        audioUrl: model.audioUrl,
        pinned: Boolean(opts.pin),
      },
    });
    await evictIfNeeded();
    return model;
  }

  return transformPassage(queryKey, canonical, html);
}

async function evictIfNeeded() {
  const unpinned = await prisma.esvPassage.count({ where: { pinned: false } });
  if (unpinned <= MAX_UNPINNED) return;
  const victims = await prisma.esvPassage.findMany({
    where: { pinned: false },
    orderBy: { lastAccessAt: "asc" },
    take: unpinned - MAX_UNPINNED,
    select: { queryKey: true },
  });
  await prisma.esvPassage.deleteMany({
    where: { queryKey: { in: victims.map((v) => v.queryKey) } },
  });
}

export async function searchEsv(q: string, page = 1) {
  const params = new URLSearchParams({ q, page: String(page), "page-size": "20" });
  const res = await fetch(`${ESV_BASE}/search/?${params.toString()}`, {
    headers: { Authorization: `Token ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`ESV search ${res.status}`);
  return res.json();
}
