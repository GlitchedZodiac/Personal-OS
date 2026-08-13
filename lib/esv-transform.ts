import { refParts } from "./bible-refs";

// Pure ESV HTML → verse-model transform (prisma-free so it's testable —
// same split as lib/vesync). lib/esv owns the API + cache.

export interface VerseSegment {
  refInt: number;
  verseNum: number;
  text: string;
  lines?: string[];
  heading?: string;
  psalmTitle?: string;
  woc?: boolean;
  crossrefs: { letter: string; ref: string }[];
  footnotes: { marker: string; text: string }[];
}

export interface PassageModel {
  queryKey: string;
  canonical: string;
  audioUrl: string | null;
  verses: VerseSegment[];
}

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").replace(/–|—/g, "-");
}



function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Segment ESV HTML into per-verse blocks. Tolerant by design: the marker
 * is `<b class="verse-num" id="vNNNNNNNN-…">` (chapter starts use
 * `chapter-num` with the same id shape); everything until the next
 * marker belongs to the verse. Poetry is detected from `line`/
 * `block-indent` classes inside the span; crossrefs (`a.cf`) and
 * footnotes (`a.fn` / `span.footnote`) are lifted out per verse.
 */
export function transformPassage(
  queryKey: string,
  canonical: string,
  html: string
): PassageModel {
  const audioMatch = html.match(/href="(https:\/\/audio\.esv\.org\/[^"]+)"/);
  const audioUrl = audioMatch ? audioMatch[1] : null;

  // Footnote bodies live in a trailing block — index them by marker.
  const footnoteBodies = new Map<string, string>();
  const fnBlock = html.match(/<div class="footnotes[^"]*">([\s\S]*?)<\/div>/);
  if (fnBlock) {
    const noteRe = /<span class="footnote">([\s\S]*?)<\/span>/g;
    let m: RegExpExecArray | null;
    let i = 1;
    while ((m = noteRe.exec(fnBlock[1]))) {
      footnoteBodies.set(String(i++), stripTags(m[1]));
    }
  }

  const markerRe =
    /<b class="(?:verse-num|chapter-num)[^"]*"[^>]*id="v(\d{8})-\d+"[^>]*>[\s\S]*?<\/b>/g;
  const markers: { refInt: number; index: number; length: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(html))) {
    markers.push({
      refInt: Number(mm[1]),
      index: mm.index,
      length: mm[0].length,
    });
  }

  const verses: VerseSegment[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : html.length;
    let segment = html.slice(start, end);
    // Trim the trailing copyright / footnote block from the last verse.
    segment = segment
      .split(/<div class="footnotes/)[0]
      .split(/<p>\(<a href="http:\/\/www\.esv\.org"/)[0];

    const refInt = markers[i].refInt;
    const { verse } = refParts(refInt);

    // Heading directly BEFORE this verse's marker (look back a bit).
    const lookback = html.slice(Math.max(0, markers[i].index - 400), markers[i].index);
    const headingMatch = [...lookback.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].pop();
    const psalmMatch = [...lookback.matchAll(/<h4 [^>]*class="psalm-title"[^>]*>([\s\S]*?)<\/h4>/g)].pop();

    const crossrefs: VerseSegment["crossrefs"] = [];
    const cfRe = /<sup><a class="cf"[^>]*title="([^"]*)"[^>]*>([a-z0-9]+)<\/a><\/sup>/g;
    let cf: RegExpExecArray | null;
    while ((cf = cfRe.exec(segment))) {
      crossrefs.push({ letter: cf[2], ref: cf[1].replace(/^See /, "") });
    }

    const footnotes: VerseSegment["footnotes"] = [];
    const fnRe = /<sup><a class="fn"[^>]*>(\d+)<\/a><\/sup>/g;
    let fn: RegExpExecArray | null;
    while ((fn = fnRe.exec(segment))) {
      footnotes.push({ marker: fn[1], text: footnoteBodies.get(fn[1]) ?? "" });
    }

    const woc = /class="woc"/.test(segment);

    // Poetry: line spans separated by <br/>. The first line's opening
    // span sits BEFORE the verse marker, so split on the breaks instead
    // of matching spans — every line survives, including the first.
    const isPoetry = /class="[^"]*\bline\b/.test(segment) || /<br\s*\/?\s*>/.test(segment);
    const lines = isPoetry
      ? segment
          .split(/<br\s*\/?\s*>/)
          .map((part) => stripTags(part))
          .filter(Boolean)
      : undefined;

    verses.push({
      refInt,
      verseNum: verse,
      text: stripTags(segment),
      ...(lines && lines.length > 0 ? { lines } : {}),
      ...(headingMatch ? { heading: stripTags(headingMatch[1]) } : {}),
      ...(psalmMatch ? { psalmTitle: stripTags(psalmMatch[1]) } : {}),
      ...(woc ? { woc: true } : {}),
      crossrefs,
      footnotes,
    });
  }

  return { queryKey, canonical, audioUrl, verses };
}
