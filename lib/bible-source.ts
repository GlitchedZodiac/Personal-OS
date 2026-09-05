// The translation registry — the thing that did not exist. "ESV" was a hardcoded
// literal in a dozen files and a fused fetch+parser in two more; highlights and ink
// were translation-independent from day one (they anchor to BBCCCVVV refInts —
// lib/bible-refs.ts says that is the reason refInt exists), but nothing above the
// data layer knew more than one Bible was possible.
//
// Sources, and the licensing truth behind each (researched 2026-09-05, see
// docs/state.md for the round notes):
//  - "esv"      Crossway's API. Free personal non-commercial tier, ALREADY licensed.
//  - "helloao"  bible.helloao.org — the keyless public-domain/open corpus the app
//               already uses for the BSB Track 2. No limits, no keys, self-hostable.
//  - "apibible" scripture.api.bible (American Bible Society). Free non-commercial
//               Starter tier; carries RVR60 — the pew Bible of his Spanish
//               congregation. Requires API_BIBLE_KEY, a FUMS view-tracking call,
//               and caches cleared within 14 days. Dormant until his key lands.

export interface BibleTranslation {
  id: string;
  /** the short badge — what the header switcher shows */
  label: string;
  name: string;
  lang: "en" | "es";
  source: "esv" | "helloao" | "apibible";
  /** helloao translation id, e.g. "eng_kjv" */
  helloaoId?: string;
  /** api.bible bibleId (filled in when his key + Bible selection exist) */
  apiBibleId?: string;
  /** the line the reader shows under the chapter — for licensed texts it is an obligation, not decor */
  attribution: string;
  /** public domain → cache forever; api.bible terms → refresh within 14 days */
  cacheForever: boolean;
}

export const TRANSLATIONS: BibleTranslation[] = [
  {
    id: "esv",
    label: "ESV",
    name: "English Standard Version",
    lang: "en",
    source: "esv",
    // the ESV API appends its own "(ESV)" short copyright to the text
    attribution: "Scripture quotations are from the ESV® Bible, © 2001 by Crossway. Used by permission.",
    cacheForever: false,
  },
  {
    id: "kjv",
    label: "KJV",
    name: "King James Version",
    lang: "en",
    source: "helloao",
    helloaoId: "eng_kjv",
    attribution: "King James Version · public domain",
    cacheForever: true,
  },
  {
    id: "web",
    label: "WEB",
    name: "World English Bible",
    lang: "en",
    source: "helloao",
    helloaoId: "ENGWEBP",
    attribution: "World English Bible · public domain",
    cacheForever: true,
  },
  {
    id: "bsb",
    label: "BSB",
    name: "Berean Standard Bible",
    lang: "en",
    source: "helloao",
    helloaoId: "BSB",
    attribution: "Berean Standard Bible · public domain (CC0) · berean.bible",
    cacheForever: true,
  },
  {
    id: "rvr09",
    label: "RVR09",
    name: "Reina-Valera 1909",
    lang: "es",
    source: "helloao",
    helloaoId: "spa_r09",
    attribution: "Reina-Valera 1909 · dominio público",
    cacheForever: true,
  },
  {
    id: "rvr60",
    label: "RVR60",
    name: "Reina-Valera 1960",
    lang: "es",
    source: "apibible",
    // Set after he registers at api.bible and selects RVR60; commonly
    // "592420522e16049f-01", but never assume — read it from the account.
    apiBibleId: process.env.API_BIBLE_RVR60_ID || undefined,
    attribution:
      "Reina-Valera 1960 © Sociedades Bíblicas en América Latina; © renovado 1988 Sociedades Bíblicas Unidas. Utilizado con permiso.",
    cacheForever: false,
  },
];

export function translationById(id: string | null | undefined): BibleTranslation {
  return TRANSLATIONS.find((t) => t.id === (id ?? "esv")) ?? TRANSLATIONS[0];
}

/** SERVER-SIDE ONLY (reads env): which translations can actually serve text right now. */
export function availableTranslations(): BibleTranslation[] {
  return TRANSLATIONS.filter((t) => {
    if (t.source !== "apibible") return true;
    return Boolean(process.env.API_BIBLE_KEY && t.apiBibleId);
  });
}
