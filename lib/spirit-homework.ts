import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/timezone";

// What he is currently carrying.
//
// Each completed study leaves exactly one homework item behind. The most
// recent one stands until he ticks it — the next study's teaching opens
// by naming it, the Spirit home shows it, and the evening reminder says
// it once. Older untouched items are not a backlog; they are simply past.

export interface CarriedHomework {
  dayId: string;
  studyTitle: string;
  kind: string;
  label: string;
  minutes: number;
  text: string;
  since: string;
}

export async function carriedHomework(): Promise<CarriedHomework | null> {
  const completions = await prisma.studyCompletion.findMany({
    orderBy: { completedAt: "desc" },
    take: 20,
  });
  if (completions.length === 0) return null;

  const dayIds = completions.map((c) => c.dayId);
  const [days, checks] = await Promise.all([
    prisma.devotionalDay.findMany({ where: { id: { in: dayIds } } }),
    prisma.homeworkCheck.findMany({ where: { dayId: { in: dayIds } } }),
  ]);
  const byId = new Map(days.map((d) => [d.id, d]));
  const ticked = new Set(checks.map((c) => c.dayId));

  for (const completion of completions) {
    const day = byId.get(completion.dayId);
    const homework = day?.homework as
      | { kind?: string; label?: string; minutes?: number; text?: string }
      | null
      | undefined;
    if (!day || !homework?.text) continue;
    // The newest study with homework decides: ticked means nothing is
    // being carried, rather than falling back to an older item.
    if (ticked.has(day.id)) return null;
    return {
      dayId: day.id,
      studyTitle: day.title,
      kind: homework.kind ?? "sit",
      label: homework.label ?? "Homework",
      minutes: homework.minutes ?? 5,
      text: homework.text,
      since: getDateStringInTimeZone(completion.completedAt, DEFAULT_TIME_ZONE),
    };
  }
  return null;
}
