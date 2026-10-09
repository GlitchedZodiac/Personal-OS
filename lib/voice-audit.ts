// The audit trail for wrist voice logging (2026-10-09). Every clip the watch
// posts leaves a row: the recording, what the recogniser heard, what each
// parser made of it and what the wrist was shown. When the workout arrives
// the rows are tied to it and stamped with what became of each entry.
//
// Why it exists: after his first real session, half the entries carried a
// "?" and several were stored differently from what he said ("16 kilograms
// on each side" became 32 kg, "sixteen" was heard as "60"). None of that
// could be checked afterwards — the audio was gone and nothing recorded
// which parser had answered. The parser is tuned from these rows.
//
// Writing is best-effort and never on the response path: a clip must come
// back to the wrist just as fast with the audit failing as with it working.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SetLogEntry } from "@/lib/set-log";

/** How long the recordings are kept. The text rows are kept for good. */
export const VOICE_AUDIO_KEEP_DAYS = 180;

export interface VoiceClipContext {
  /** The watch's session UUID — the workout's externalId once it is saved. */
  workoutId?: string;
  /** Elapsed seconds into the session when he spoke. */
  t?: number;
  kind?: string;
  build?: string;
  /** Kettlebells on his rack, kg. */
  bells?: number[];
  /** The entry logged just before this one. */
  previous?: Record<string, unknown>;
}

const str = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

/** Read the optional `context` object off a voice request. Never throws. */
export function readVoiceContext(raw: unknown): VoiceClipContext {
  if (raw == null || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: VoiceClipContext = {};
  const workoutId = str(r.workoutId, 80);
  if (workoutId) out.workoutId = workoutId;
  if (typeof r.t === "number" && Number.isFinite(r.t) && r.t >= 0) out.t = Math.round(r.t);
  const kind = str(r.kind, 40);
  if (kind) out.kind = kind;
  const build = str(r.build, 40);
  if (build) out.build = build;
  if (Array.isArray(r.bells)) {
    const bells = r.bells
      .filter((kg): kg is number => typeof kg === "number" && Number.isFinite(kg) && kg > 0 && kg <= 100)
      .slice(0, 40);
    if (bells.length > 0) out.bells = bells;
  }
  if (r.previous != null && typeof r.previous === "object" && !Array.isArray(r.previous)) {
    const p = r.previous as Record<string, unknown>;
    if (typeof p.name === "string" && p.name.trim()) out.previous = p;
  }
  return out;
}

export interface VoiceClipRecord {
  entryId: string | null;
  context: VoiceClipContext;
  transcript: string;
  transcribeModel?: string | null;
  audioSeconds?: number | null;
  audio?: { bytes: Buffer; mime: string } | null;
  parser: string;
  rulesResult?: unknown;
  llmRaw?: string | null;
  entries: unknown[];
  ms?: Record<string, number>;
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

/** Store one clip. Swallows its own errors — the audit must never cost him an entry. */
export async function recordVoiceClip(record: VoiceClipRecord): Promise<string | null> {
  try {
    const { context } = record;
    const parserContext: Record<string, unknown> = {};
    if (context.bells) parserContext.bells = context.bells;
    if (context.previous) parserContext.previous = context.previous;
    const clip = await prisma.voiceClip.create({
      data: {
        entryId: record.entryId,
        workoutExternalId: context.workoutId ?? null,
        workoutKind: context.kind ?? null,
        elapsedSeconds: context.t ?? null,
        appBuild: context.build ?? null,
        transcript: record.transcript,
        transcribeModel: record.transcribeModel ?? null,
        audioSeconds: record.audioSeconds ?? null,
        audioSizeBytes: record.audio?.bytes.length ?? null,
        parser: record.parser,
        ...(record.rulesResult != null ? { rulesResult: json(record.rulesResult) } : {}),
        llmRaw: record.llmRaw ?? null,
        entries: json(record.entries),
        ...(Object.keys(parserContext).length > 0 ? { context: json(parserContext) } : {}),
        ...(record.ms ? { ms: json(record.ms) } : {}),
        ...(record.audio
          ? {
              audio: {
                create: { mimeType: record.audio.mime, bytes: new Uint8Array(record.audio.bytes) },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return clip.id;
  } catch (error) {
    console.warn("[VoiceAudit] could not store the clip:", (error as Error)?.message);
    return null;
  }
}

/** "<uuid>#2" → "<uuid>": a clip that named several movements shares one recording. */
export const clipIdOf = (entryId: string) => entryId.split("#")[0];

const OUTCOME_RANK: Record<string, number> = { failed: 0, queued: 1, undone: 2, ok: 3, review: 4 };

/**
 * A saved workout arrived: tie its clips to it and stamp what became of each.
 * A clip posted for this session that is not in the saved log at all was
 * taken back on the wrist before the log kept undone entries — "dropped".
 */
export async function linkVoiceClips(input: {
  workoutLogId: string;
  externalId: string | null;
  setLog: SetLogEntry[];
}): Promise<void> {
  try {
    const outcome = new Map<string, string>();
    for (const entry of input.setLog) {
      if (entry.source !== "voice") continue;
      const id = clipIdOf(entry.id);
      const seen = outcome.get(id);
      // One clip, several entries: the entry that most needs a look speaks for it.
      if (seen == null || (OUTCOME_RANK[entry.status] ?? 0) > (OUTCOME_RANK[seen] ?? 0)) {
        outcome.set(id, entry.status);
      }
    }
    const byOutcome = new Map<string, string[]>();
    for (const [id, status] of outcome) {
      byOutcome.set(status, [...(byOutcome.get(status) ?? []), id]);
    }
    for (const [status, ids] of byOutcome) {
      await prisma.voiceClip.updateMany({
        where: { entryId: { in: ids } },
        data: { workoutLogId: input.workoutLogId, outcome: status },
      });
    }
    if (input.externalId) {
      await prisma.voiceClip.updateMany({
        where: {
          workoutExternalId: input.externalId,
          ...(outcome.size > 0 ? { NOT: { entryId: { in: [...outcome.keys()] } } } : {}),
        },
        data: { workoutLogId: input.workoutLogId, outcome: "dropped" },
      });
    }
  } catch (error) {
    console.warn("[VoiceAudit] could not link clips:", (error as Error)?.message);
  }
}

/** Fields safe to hand to a screen or a model — never the audio. */
export const VOICE_CLIP_FIELDS = {
  id: true,
  entryId: true,
  createdAt: true,
  workoutExternalId: true,
  workoutLogId: true,
  workoutKind: true,
  elapsedSeconds: true,
  appBuild: true,
  transcript: true,
  transcribeModel: true,
  audioSeconds: true,
  audioSizeBytes: true,
  parser: true,
  rulesResult: true,
  llmRaw: true,
  entries: true,
  context: true,
  ms: true,
  outcome: true,
} as const;

/** Drop recordings past their keep window. Returns how many went. */
export async function pruneVoiceAudio(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - VOICE_AUDIO_KEEP_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.voiceClipAudio.deleteMany({
    where: { clip: { createdAt: { lt: cutoff } } },
  });
  return result.count;
}
