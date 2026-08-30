// Sermon recordings: ~2-minute segments transcribed with timestamps, then
// glossed into English when the audio is Spanish. Runs a few segments per
// call so a 45-minute sermon never fights a function timeout — the client
// polls until status is "ready".

import { toFile } from "openai";
import { prisma } from "@/lib/prisma";
import { openai, TRANSCRIBE_MODEL, TRANSCRIBE_FALLBACK_MODEL, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
  gloss?: string | null;
}

interface VerboseLike {
  text?: string;
  duration?: number;
  segments?: { start: number; end: number; text: string }[];
}

function extFor(mime: string) {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "m4a";
}

/** the vocabulary that is true of every sermon he records, whatever it is about */
const DOMAIN_VOCAB =
  "Sermón expositivo reformado. Biblia, versículos, la ley, la fe, el Espíritu, pacto, gracia, justificación, santificación.";
const PROMPT_LIMIT = 850; // ≈224 tokens, whisper-1's ceiling; the newer models tolerate more

/**
 * Build the transcription prompt. Whisper-family models treat it as the text that PRECEDED
 * this audio, which is why the tail of the previous segment is worth so much more than a
 * keyword list: it fixes words split across a boundary, holds proper nouns steady, and stops
 * the model drifting. The recording already knows its preacher and passage; none of that was
 * being used.
 */
function buildPrompt(ctx: { preacher?: string | null; passageRef?: string | null; title?: string | null; tail?: string }) {
  const who = ctx.preacher?.trim();
  const where = ctx.passageRef?.trim();
  const head = [
    who && where ? `Sermón de ${who} sobre ${where}.` : who ? `Sermón de ${who}.` : where ? `Sermón sobre ${where}.` : null,
    DOMAIN_VOCAB,
  ]
    .filter(Boolean)
    .join(" ");
  const tail = ctx.tail?.trim();
  const full = tail ? `${head} ${tail}` : head;
  // keep the TAIL when trimming — it is the part doing the real work
  return full.length <= PROMPT_LIMIT ? full : full.slice(full.length - PROMPT_LIMIT);
}

async function transcribeOne(
  bytes: Uint8Array,
  mime: string,
  lang: string | null,
  index: number,
  prompt: string,
): Promise<{ lines: { start: number; end: number; text: string }[]; duration: number | null; model: string }> {
  const attempt = async (model: string) => {
    // Rebuild the File per attempt — handing the same one to a second call after its stream
    // has been consumed is not reliable, and the fallback path is exactly a second call.
    const file = await toFile(Buffer.from(bytes), `segment-${index}.${extFor(mime)}`, { type: mime });
    const res = (await openai.audio.transcriptions.create({
      file,
      model,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      ...(lang ? { language: lang } : {}),
      prompt,
    } as Parameters<typeof openai.audio.transcriptions.create>[0])) as unknown as VerboseLike;
    return res;
  };
  let model = TRANSCRIBE_MODEL;
  let res: VerboseLike;
  try {
    res = await attempt(model);
  } catch (err) {
    // This used to be a bare `catch {}`. If the primary model rejects every call — because it
    // does not support verbose_json, say — every segment silently paid two round trips and ran
    // on the weaker model, and nothing anywhere said so. Now it is in the logs.
    console.warn(`[recordings] ${TRANSCRIBE_MODEL} failed on segment ${index}, falling back to ${TRANSCRIBE_FALLBACK_MODEL}:`, (err as Error)?.message ?? err);
    model = TRANSCRIBE_FALLBACK_MODEL;
    res = await attempt(model);
  }
  const lines = (res.segments ?? []).map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() }));
  if (!lines.length && res.text?.trim()) lines.push({ start: 0, end: Number(res.duration) || 0, text: res.text.trim() });
  return { lines, duration: typeof res.duration === "number" ? res.duration : null, model };
}

export async function transcribeRecording(recordingId: string, opts: { maxSegments?: number } = {}) {
  const max = opts.maxSegments ?? 6;
  const rec = await prisma.recording.findUnique({ where: { id: recordingId } });
  if (!rec) return null;
  const pending = await prisma.recordingSegment.findMany({
    where: { recordingId, transcribedAt: null },
    orderBy: { index: "asc" },
    take: max,
  });
  const total = await prisma.recordingSegment.count({ where: { recordingId } });
  const alreadyDone = await prisma.recordingSegment.count({ where: { recordingId, transcribedAt: { not: null } } });
  // ——— #23: nothing to transcribe at all. Without this the row wedges at "transcribing"
  // with no pending segments and no way back to a state the UI offers a retry from.
  if (total === 0) {
    const saved = await prisma.recording.update({ where: { id: recordingId }, data: { status: rec.status === "recording" ? rec.status : "uploaded", error: "no audio to transcribe" } });
    return { recording: saved, done: 0, total: 0, finished: false, audioDeleted: false };
  }
  // ——— #9: claim the run. Two concurrent passes would both read the same `pending` set and
  // append every line twice — doubling the transcript AND the AI spend. The claim is a
  // conditional update: only the caller that flips uploaded → transcribing proceeds.
  if (rec.status !== "transcribing" && pending.length) {
    const claim = await prisma.recording.updateMany({ where: { id: recordingId, status: { not: "transcribing" } }, data: { status: "transcribing" } });
    if (claim.count === 0) return { recording: rec, done: alreadyDone, total, finished: false, audioDeleted: false, busy: true };
  }
  const lang = rec.lang && rec.lang !== "auto" ? rec.lang : null;
  const transcript = (Array.isArray(rec.transcript) ? (rec.transcript as unknown as TranscriptLine[]) : []) as TranscriptLine[];
  let succeeded = 0;
  let failed = false;
  for (const seg of pending) {
    try {
      // the tail of what we have so far, in time order — the previous segment's last words
      const tail = transcript.length
        ? [...transcript].sort((a, b) => a.start - b.start).slice(-6).map((l) => l.text).join(" ")
        : "";
      const r = await transcribeOne(
        seg.bytes as unknown as Uint8Array,
        seg.mimeType,
        lang,
        seg.index,
        buildPrompt({ preacher: rec.preacher, passageRef: rec.passageRef, title: rec.title, tail }),
      );
      for (const l of r.lines) {
        transcript.push({ start: seg.startSec + l.start, end: seg.startSec + l.end, text: l.text });
      }
      recordAIUsage({ surface: "transcribe", model: r.model, audioSeconds: r.duration ?? seg.durationSec });
      // persist the lines and the segment's mark together — a failure later in the
      // pass (gloss, retention) must never strand a segment as "done" with its lines lost
      transcript.sort((a, b) => a.start - b.start);
      await prisma.$transaction([
        prisma.recording.update({ where: { id: recordingId }, data: { transcript: JSON.parse(JSON.stringify(transcript)) } }),
        prisma.recordingSegment.update({ where: { id: seg.id }, data: { transcribedAt: new Date() } }),
      ]);
      succeeded++;
    } catch (error) {
      failed = true;
      console.error("[recordings] segment transcription failed", seg.index, error);
      await prisma.recording.update({
        where: { id: recordingId },
        data: { error: (error as Error)?.message?.slice(0, 300) ?? "transcription failed" },
      });
      break;
    }
  }
  transcript.sort((a, b) => a.start - b.start);
  // Only segments that ACTUALLY transcribed count. Counting the whole pending batch meant one
  // failed call reported "ready" with a silent hole in the sermon — and, with retention set to
  // drop-after-transcript, deleted the audio that hole came from. Permanently.
  const done = alreadyDone + succeeded;
  const finished = done >= total && total > 0 && !failed;
  let status = failed ? "failed" : finished ? "ready" : "transcribing";

  // English gloss for non-English audio — one batched call, index-aligned.
  if (finished && lang && lang !== "en") {
    const needs = transcript.map((l, i) => ({ i, l })).filter(({ l }) => !l.gloss && l.text);
    for (let off = 0; off < needs.length; off += 120) {
      const chunk = needs.slice(off, off + 120);
      try {
        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: "Translate each Spanish sermon line into plain English, one gloss per line, same order, no commentary. Return JSON {\"glosses\": string[]} with exactly as many items as lines given." },
            { role: "user", content: JSON.stringify({ lines: chunk.map(({ l }) => l.text) }) },
          ],
          max_completion_tokens: 4000,
          response_format: { type: "json_object" },
        });
        recordAIUsage({ surface: "spirit-ink", model: CHAT_MODEL, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0 });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { glosses?: string[] };
        (parsed.glosses ?? []).forEach((g, k) => {
          const target = chunk[k];
          if (target) transcript[target.i].gloss = String(g ?? "");
        });
      } catch (error) {
        console.warn("[recordings] gloss pass failed (transcript kept):", (error as Error)?.message);
      }
    }
  }

  let audioDeleted = false;
  if (finished && rec.retention === "after_transcript") {
    await prisma.recordingSegment.deleteMany({ where: { recordingId } });
    status = "audio_deleted";
    audioDeleted = true;
  }
  const saved = await prisma.recording.update({
    where: { id: recordingId },
    data: {
      transcript: JSON.parse(JSON.stringify(transcript)),
      status,
      // the error only clears when the pass genuinely completed — a cleared error on a
      // half-transcribed sermon is how the retry path disappeared
      ...(finished ? { error: null } : {}),
    },
  });
  return { recording: saved, done, total, finished, audioDeleted };
}
