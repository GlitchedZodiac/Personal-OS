// One door for "give me this passage in this translation."
//
// The ESV keeps its existing path (lib/esv.ts) untouched. Everything else caches in
// the same esv_passages table under a PREFIXED key — "rvr09:john 3" — because the
// bare queryKey is the table's primary key and a second translation sharing the
// string "john 3" would silently serve the wrong Bible. A prefix costs no schema
// migration on the shared live database; the column stores raw source payloads
// (helloao chapter JSON, api.bible text envelopes) and re-transforms per read, the
// same pattern the ESV rows use, so parser fixes apply retroactively.
//
// License-honest caching: public-domain rows live forever; api.bible rows expire
// after 13 days (their terms say caches clear within 14) and refetch on next read.

import { prisma } from "@/lib/prisma";
import { getPassage as getEsvPassage } from "@/lib/esv";
import { normalizeQuery, type PassageModel } from "@/lib/esv-transform";
import { translationById } from "@/lib/bible-source";
import { fetchHelloaoChapterRaw, resolveHelloaoRef, transformHelloaoChapter, type HelloaoChapter } from "@/lib/helloao";
import { fetchApiBiblePassage, transformApiBibleText, type ApiBibleEnvelope } from "@/lib/apibible";

const APIBIBLE_TTL_MS = 13 * 24 * 60 * 60 * 1000;

export interface TranslatedPassage extends PassageModel {
  translation: string;
  /** shown under the chapter; for licensed texts this line is an obligation */
  attribution?: string;
  /** api.bible view-tracking token — the client fires FUMS with it when the text renders */
  fumsToken?: string | null;
}

export async function getPassageFor(t: string | null | undefined, q: string, opts: { pin?: boolean } = {}): Promise<TranslatedPassage> {
  const tr = translationById(t);

  if (tr.source === "esv") {
    const model = await getEsvPassage(q, opts);
    return { ...model, translation: "esv", attribution: tr.attribution };
  }

  const bare = normalizeQuery(q);
  const queryKey = `${tr.id}:${bare}`;
  const cached = await prisma.esvPassage.findUnique({ where: { queryKey } });
  const expired = cached && !tr.cacheForever && Date.now() - cached.fetchedAt.getTime() > APIBIBLE_TTL_MS;

  if (cached && !expired) {
    await prisma.esvPassage.update({ where: { queryKey }, data: { lastAccessAt: new Date() } });
    return rebuild(tr.id, queryKey, bare, cached.html);
  }

  if (tr.source === "helloao") {
    const ref = resolveHelloaoRef(bare);
    if (!ref) throw new Error(`Couldn't read the reference "${q}"`);
    const raw = await fetchHelloaoChapterRaw(tr.helloaoId!, ref.book, ref.chapter);
    const model = transformHelloaoChapter(queryKey, raw, ref);
    if (!model.verses.length) throw new Error(`No verses for "${q}" in ${tr.label}`);
    await storeRaw(queryKey, model, JSON.stringify(raw));
    return { ...model, translation: tr.id, attribution: tr.attribution };
  }

  // api.bible
  if (!tr.apiBibleId) throw new Error(`${tr.label} isn't set up yet — the API key and Bible id are missing`);
  const { envelope, ref } = await fetchApiBiblePassage(tr.apiBibleId, bare);
  const model = transformApiBibleText(queryKey, envelope, ref);
  if (!model.verses.length) throw new Error(`No verses for "${q}" in ${tr.label}`);
  await storeRaw(queryKey, model, JSON.stringify(envelope));
  return { ...model, translation: tr.id, attribution: tr.attribution, fumsToken: envelope.fumsToken };
}

async function storeRaw(queryKey: string, model: PassageModel, payload: string) {
  await prisma.esvPassage.upsert({
    where: { queryKey },
    create: { queryKey, canonical: model.canonical, html: payload, verseCount: model.verses.length, audioUrl: null, pinned: false },
    update: { canonical: model.canonical, html: payload, verseCount: model.verses.length, fetchedAt: new Date(), lastAccessAt: new Date() },
  });
}

function rebuild(trId: string, queryKey: string, bare: string, payload: string): TranslatedPassage {
  const tr = translationById(trId);
  const ref = resolveHelloaoRef(bare);
  if (!ref) throw new Error(`Couldn't read the cached reference "${bare}"`);
  if (tr.source === "helloao") {
    const raw = JSON.parse(payload) as HelloaoChapter;
    const model = transformHelloaoChapter(queryKey, raw, ref);
    return { ...model, translation: tr.id, attribution: tr.attribution };
  }
  const envelope = JSON.parse(payload) as ApiBibleEnvelope;
  const model = transformApiBibleText(queryKey, envelope, ref);
  // a cached serve is still a view — FUMS fires with the stored token
  return { ...model, translation: tr.id, attribution: tr.attribution, fumsToken: envelope.fumsToken };
}
