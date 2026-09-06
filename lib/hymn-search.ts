// V3 §9 — the himnario's search: every line of every stanza, both languages,
// accents forgiven. Pure module (client filters the full library — it is a
// personal hymnal, not a catalog), so the matched line can be SHOWN in context
// under the title, which is the whole point: he remembers a line, not a name.

import { parseHymn } from "./hymns";

/** NFD-strip: "óyeme" matches "oyeme" matches "ÓYEME" */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface HymnHit {
  id: string;
  /** the line that matched, verbatim — shown under the title */
  line: string | null;
  /** true when the title itself matched */
  titleHit: boolean;
}

export function searchHymns(
  hymns: { id: string; title: string; body: string }[],
  query: string,
): HymnHit[] {
  const q = fold(query.trim());
  if (!q) return hymns.map((h) => ({ id: h.id, line: null, titleHit: false }));
  const hits: HymnHit[] = [];
  for (const h of hymns) {
    const titleHit = fold(h.title).includes(q);
    let line: string | null = null;
    for (const st of parseHymn(h.body)) {
      for (const l of st.lines) {
        if (fold(l).includes(q)) { line = l; break; }
      }
      if (line) break;
    }
    if (titleHit || line) hits.push({ id: h.id, line, titleHit });
  }
  return hits;
}

/** a cheap honest guess for the ES/EN chip — his sheets are Spanish, his studies English */
export function guessLang(body: string): "es" | "en" {
  if (/[áéíóúñü¿¡]/i.test(body)) return "es";
  const es = (body.match(/\b(el|la|los|las|de|que|y|en|su|por|con|dios|señor)\b/gi) ?? []).length;
  const en = (body.match(/\b(the|and|of|to|in|his|for|with|god|lord)\b/gi) ?? []).length;
  return es >= en ? "es" : "en";
}
