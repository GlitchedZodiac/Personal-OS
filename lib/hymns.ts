// The hymn body's one convention, parsed. Storage is PLAIN TEXT on purpose —
// hand-editable, pastes cleanly, one string over MCP — and structure is a rendering
// concern: blank line = new stanza; a lone "Coro:" / "Chorus:" / "Estribillo:" line
// labels the stanza that FOLLOWS it, exactly the way his church's printed sheets do.
// Pure and prisma-free so it is unit-testable (tests/hymns.test.ts).

export interface Stanza {
  /** "Coro" — or null for a plain numbered stanza */
  label: string | null;
  lines: string[];
}

const LABEL_RE = /^\s*(coro|chorus|estribillo)\s*[:.]?\s*$/i;

function normalize(body: string): string {
  return (body ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function parseHymn(body: string): Stanza[] {
  const blocks = normalize(body)
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  const stanzas: Stanza[] = [];
  let pendingLabel: string | null = null;
  for (const lines of blocks) {
    // a label may stand alone as its own block, or lead the block it labels
    if (lines.length === 1 && LABEL_RE.test(lines[0])) {
      pendingLabel = lines[0].replace(/\s*[:.]\s*$/, "").trim();
      continue;
    }
    let label = pendingLabel;
    pendingLabel = null;
    let start = 0;
    if (LABEL_RE.test(lines[0])) {
      label = lines[0].replace(/\s*[:.]\s*$/, "").trim();
      start = 1;
    }
    const rest = lines.slice(start);
    if (rest.length) stanzas.push({ label, lines: rest });
  }
  return stanzas;
}

/** The first real line — what a library row shows, and what he half-remembers when the name escapes him. */
export function firstLine(body: string): string {
  for (const stanza of parseHymn(body)) {
    if (stanza.lines[0]) return stanza.lines[0];
  }
  return "";
}
