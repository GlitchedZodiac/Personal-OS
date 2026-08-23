// Notebooks and page templates for the iPad desk.
//
// System notebooks (Sermons · Term N · Free · Worksheets) are created on
// first use; pages are created pre-headed so a page is never blank
// (docs/design/pitaya-ipad-01/03/04/09). Templates are OBJECTS on the
// page (header, section heads, prompts) — he writes anywhere around them.

import { prisma } from "@/lib/prisma";
import type { InkPage } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { newId, type PageObject } from "@/lib/ink";
import { parseReadingRef, readingSpan } from "@/lib/spirit-refs";

export const PAGE_PAD = 24;

const SYSTEM: Record<"sermons" | "free" | "worksheets", { title: string; accent: string; inkLang: string; audioLang: string; sortOrder: number }> = {
  sermons: { title: "Sermons", accent: "#A63D63", inkLang: "en", audioLang: "es", sortOrder: 0 },
  free: { title: "Free", accent: "#5E7FA6", inkLang: "en", audioLang: "es", sortOrder: 2 },
  worksheets: { title: "Worksheets", accent: "#C9C7CD", inkLang: "en", audioLang: "es", sortOrder: 3 },
};

export async function ensureSystemNotebooks() {
  const out: Record<string, { id: string; title: string; kind: string }> = {};
  for (const [kind, def] of Object.entries(SYSTEM)) {
    let nb = await prisma.spiritNotebook.findFirst({ where: { kind, archivedAt: null } });
    if (!nb) nb = await prisma.spiritNotebook.create({ data: { kind, ...def } });
    out[kind] = nb;
  }
  const term = await prisma.term.findFirst({ where: { status: "active" } });
  if (term) {
    let nb = await prisma.spiritNotebook.findFirst({ where: { kind: "term", termId: term.id } });
    if (!nb) {
      nb = await prisma.spiritNotebook.create({
        data: {
          kind: "term",
          termId: term.id,
          title: `Term ${term.orderIndex} — ${term.title}`,
          accent: "#5F4B8B",
          sortOrder: 1,
        },
      });
    }
    out.term = nb;
  }
  return out;
}

export async function notebookForKind(kind: "sermons" | "free" | "worksheets" | "term") {
  const all = await ensureSystemNotebooks();
  return all[kind] ?? null;
}

// ——— object factories ———

export function headerObject(data: {
  kicker: string;
  title: string;
  chips?: string[];
  aim?: string | null;
  editable?: boolean;
}): PageObject {
  return { id: newId(), type: "header", x: PAGE_PAD, y: PAGE_PAD - 6, w: 800 - PAGE_PAD * 2, h: 104, data };
}

export function sectionObject(label: string, y: number): PageObject {
  return { id: newId(), type: "section", x: PAGE_PAD, y, w: 800 - PAGE_PAD * 2, h: 18, data: { label } };
}

export function promptObject(
  y: number,
  data: { label?: string | null; text?: string | null; lined?: boolean; lines?: number; sketch?: boolean; chip?: string | null; chipRef?: string | null; field?: boolean },
  h?: number,
): PageObject {
  const lines = data.lines ?? 3;
  const height = h ?? (data.sketch ? 200 : (data.label ? 22 : 0) + (data.text ? 28 : 0) + (data.lined ? lines * 32 + 8 : data.field ? 40 : 0));
  return { id: newId(), type: "prompt", x: PAGE_PAD, y, w: 800 - PAGE_PAD * 2, h: height, data };
}

// ——— templates ———

export function sermonTemplate(opts: {
  dateLabel: string; // "SUN · AUG 23, 2026"
  church: string;
  preacher: string;
  seriesTitle: string;
  weekIndex: number;
  passageLabel: string;
}): PageObject[] {
  const kicker = [opts.dateLabel, opts.church, opts.preacher].filter(Boolean).join(" · ").toUpperCase();
  const objs: PageObject[] = [
    headerObject({
      kicker,
      title: opts.weekIndex > 0 ? `${opts.seriesTitle} — week ${opts.weekIndex}` : opts.seriesTitle,
      chips: opts.passageLabel ? [opts.passageLabel.toUpperCase()] : [],
      editable: true,
    }),
  ];
  // The six section heads — generous gaps; he writes anywhere.
  const sections: [string, number][] = [
    ["BIG IDEA", 150],
    ["OUTLINE", 300],
    ["VERSES READ", 470],
    ["QUOTES WORTH KEEPING", 640],
    ["APPLICATION", 800],
    ["QUESTIONS TO BRING BACK", 960],
  ];
  for (const [label, y] of sections) objs.push(sectionObject(label, y));
  return objs;
}

export function studyTemplate(opts: {
  termIndex: number;
  termTitle: string;
  studyNumber: number | null;
  weekIndex: number;
  title: string;
  readingLabels: string[];
  aim?: string | null;
}): PageObject[] {
  const kicker = `TERM ${opts.termIndex} · ${opts.termTitle.toUpperCase()}${opts.studyNumber ? ` · STUDY ${opts.studyNumber}` : ""} · WK ${opts.weekIndex}`;
  return [
    headerObject({
      kicker,
      title: opts.title,
      chips: opts.readingLabels.map((l) => l.toUpperCase()),
      aim: opts.aim ? `aim — ${opts.aim}` : null,
    }),
  ];
}

export interface HomeworkLike {
  kind?: string;
  label?: string;
  minutes?: number;
  text?: string;
}

/** The worksheet family (09): one grammar, six kinds, plus the written assignment every study carries. */
export function worksheetTemplate(opts: {
  kind: string;
  homework: HomeworkLike | null;
  writtenPrompt: string | null;
  termIndex: number;
  studyNumber: number | null;
  readingLabel: string;
  title: string;
}): { objects: PageObject[]; background: string } {
  const kind = (opts.kind || "write").toLowerCase();
  const KIND_TITLE: Record<string, string> = {
    write: "Leave a trace",
    research: "Find one thing out",
    compare: "Two translations",
    sit: "Sit with it",
    read: "Read one more",
    ask: "Bring it to someone",
  };
  const minutes = opts.homework?.minutes ? ` · ≤ ${opts.homework.minutes} min` : "";
  const objs: PageObject[] = [
    headerObject({
      kicker: `${kind.toUpperCase()} · TERM ${opts.termIndex}${opts.studyNumber ? ` · STUDY ${opts.studyNumber}` : ""}${minutes}`,
      title: KIND_TITLE[kind] ?? opts.homework?.label ?? "Worksheet",
      chips: opts.readingLabel ? [opts.readingLabel.toUpperCase()] : [],
      aim: opts.homework?.text ?? null,
    }),
  ];
  let y = 150;
  const push = (o: PageObject) => {
    objs.push(o);
    y += (o.h ?? 40) + 22;
  };
  switch (kind) {
    case "write":
      push(promptObject(y, { lined: true, lines: 8 }));
      break;
    case "research":
      push(promptObject(y, { label: "THE THING", lined: true, lines: 2 }));
      push(promptObject(y, { label: "WHERE I FOUND IT", field: true, text: "Logos in Split View · ISBE, a commentary, a map" }));
      push(promptObject(y, { label: "ONE LINE", lined: true, lines: 2 }));
      push(promptObject(y, { label: "SKETCH — A MAP, A TIMELINE, A FLOOR PLAN", sketch: true }));
      break;
    case "compare":
      push(promptObject(y, { label: "ESV | BSB", chip: opts.readingLabel, chipRef: opts.readingLabel, field: false, text: "two columns below · NBLA stays in Logos" }, 150));
      push(promptObject(y, { label: "WHAT SHIFTS", lined: true, lines: 3 }));
      break;
    case "sit":
      push(promptObject(y, { label: "CARRIED FROM THIS MORNING", text: opts.homework?.text ?? "", lined: true, lines: 2 }));
      break;
    case "read":
      push(promptObject(y, { label: "TONIGHT'S SECOND PASSAGE", chip: opts.readingLabel, chipRef: opts.readingLabel, text: "What does this complicate?", lined: true, lines: 3 }));
      break;
    case "ask":
      push(promptObject(y, { label: "THE QUESTION", lined: true, lines: 1 }));
      push(promptObject(y, { label: "WHO", field: true }));
      push(promptObject(y, { label: "WHAT THEY SAID", lined: true, lines: 2 }));
      break;
    default:
      push(promptObject(y, { lined: true, lines: 5 }));
  }
  if (opts.writtenPrompt && kind !== "write") {
    push(promptObject(y, { label: "THE WRITTEN ASSIGNMENT", text: opts.writtenPrompt, lined: true, lines: 4 }));
  }
  return { objects: objs, background: kind === "write" ? "lined" : "dots" };
}

export function refsFromLabel(label: string | null | undefined): { refStart: number | null; refEnd: number | null } {
  if (!label) return { refStart: null, refEnd: null };
  const span = readingSpan(parseReadingRef(label));
  return span ? { refStart: span.refStart, refEnd: span.refEnd } : { refStart: null, refEnd: null };
}

export const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Find-or-create races (a double tap, React's dev double-mount, two panes
 * resolving the same context) can leave two pages where one was meant.
 * The oldest page is canonical; newer EMPTY twins (no ink, no recording)
 * are removed, and every caller gets the same page back.
 */
export async function canonicalPage(where: Prisma.InkPageWhereInput, fallback: InkPage): Promise<InkPage> {
  const all = await prisma.inkPage.findMany({ where: { ...where, deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (all.length <= 1) return all[0] ?? fallback;
  const [keep, ...extra] = all;
  const empties = extra.filter((p) => p.strokeCount === 0 && !p.recordingId && !p.transcribedAt).map((p) => p.id);
  if (empties.length) await prisma.inkPage.deleteMany({ where: { id: { in: empties } } });
  return keep;
}
