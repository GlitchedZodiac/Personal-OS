import { beforeEach, describe, expect, it, vi } from "vitest";

const created: unknown[] = [];
const updates: Array<{ where: unknown; data: unknown }> = [];
let failCreate = false;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voiceClip: {
      create: vi.fn(async (args: unknown) => {
        if (failCreate) throw new Error("db down");
        created.push(args);
        return { id: "clip-1" };
      }),
      updateMany: vi.fn(async (args: { where: unknown; data: unknown }) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
    voiceClipAudio: { deleteMany: vi.fn(async () => ({ count: 3 })) },
  },
}));

import {
  clipIdOf,
  linkVoiceClips,
  pruneVoiceAudio,
  readVoiceContext,
  recordVoiceClip,
  VOICE_AUDIO_KEEP_DAYS,
} from "@/lib/voice-audit";
import { prisma } from "@/lib/prisma";
import type { SetLogEntry } from "@/lib/set-log";

beforeEach(() => {
  created.length = 0;
  updates.length = 0;
  failCreate = false;
});

describe("readVoiceContext", () => {
  it("keeps what the watch may send and nothing else", () => {
    expect(
      readVoiceContext({
        workoutId: " 154C35ED ",
        t: 742.6,
        kind: "freestyle",
        build: "4",
        bells: [16, 20, 24, "x", -1, 400],
        previous: { name: "Kettlebell Snatch", reps: 8 },
        junk: true,
      })
    ).toEqual({
      workoutId: "154C35ED",
      t: 743,
      kind: "freestyle",
      build: "4",
      bells: [16, 20, 24],
      previous: { name: "Kettlebell Snatch", reps: 8 },
    });
  });

  it.each([null, undefined, "x", 4, []])("is empty for %j", (raw) => {
    expect(readVoiceContext(raw)).toEqual({});
  });

  it("drops a previous entry with no name, and an empty rack", () => {
    expect(readVoiceContext({ previous: { reps: 8 }, bells: [] })).toEqual({});
  });
});

describe("clipIdOf", () => {
  it("maps every entry of a clip to the one recording", () => {
    expect(clipIdOf("7A459C17")).toBe("7A459C17");
    expect(clipIdOf("7A459C17#3")).toBe("7A459C17");
  });
});

describe("recordVoiceClip", () => {
  const base = {
    entryId: "E1",
    context: { workoutId: "W1", t: 583, kind: "freestyle", bells: [16, 20, 24] },
    transcript: "eight clean and press, 16 kilograms on each side",
    parser: "rules",
    rulesResult: { entries: [], confident: true, normalized: "8 clean and press" },
    entries: [{ name: "Clean and Press", reps: 8, weightKg: 16, implements: 2 }],
    ms: { transcribe: 900, parse: 2, total: 910 },
  };

  it("stores the text, the parse and the recording", async () => {
    const id = await recordVoiceClip({
      ...base,
      audio: { bytes: Buffer.from([1, 2, 3, 4]), mime: "audio/m4a" },
      audioSeconds: 3.2,
      transcribeModel: "gpt-transcribe",
    });
    expect(id).toBe("clip-1");
    const { data } = created[0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      entryId: "E1",
      workoutExternalId: "W1",
      workoutKind: "freestyle",
      elapsedSeconds: 583,
      transcript: base.transcript,
      parser: "rules",
      audioSizeBytes: 4,
      audioSeconds: 3.2,
      context: { bells: [16, 20, 24] },
      entries: base.entries,
    });
    expect((data.audio as { create: { mimeType: string } }).create.mimeType).toBe("audio/m4a");
  });

  it("stores a clip with no recording (a transcript-only smoke)", async () => {
    await recordVoiceClip(base);
    const { data } = created[0] as { data: Record<string, unknown> };
    expect(data.audio).toBeUndefined();
    expect(data.audioSizeBytes).toBeNull();
  });

  it("never throws — the audit must not cost him an entry", async () => {
    failCreate = true;
    await expect(recordVoiceClip(base)).resolves.toBeNull();
  });
});

describe("linkVoiceClips", () => {
  const e = (id: string, status: SetLogEntry["status"], source: "voice" | "tap" = "voice"): SetLogEntry => ({
    id,
    t: 10,
    source,
    status,
    name: "Jerk",
  });

  it("stamps each clip with what became of it, and drops the rest of the session", async () => {
    await linkVoiceClips({
      workoutLogId: "wl-1",
      externalId: "W1",
      setLog: [
        e("A", "ok"),
        e("B", "ok"),
        e("B#2", "review"), // one clip, two movements: the flagged one speaks for it
        e("C", "undone"),
        e("D", "failed"),
        e("T", "ok", "tap"), // tapped sets have no clip
      ],
    });
    const byOutcome = Object.fromEntries(
      updates
        .filter((u) => (u.data as { outcome: string }).outcome !== "dropped")
        .map((u) => [
          (u.data as { outcome: string }).outcome,
          (u.where as { entryId: { in: string[] } }).entryId.in,
        ])
    );
    expect(byOutcome).toEqual({ ok: ["A"], review: ["B"], undone: ["C"], failed: ["D"] });
    for (const u of updates) expect((u.data as { workoutLogId: string }).workoutLogId).toBe("wl-1");

    const dropped = updates.find((u) => (u.data as { outcome: string }).outcome === "dropped");
    expect(dropped?.where).toEqual({
      workoutExternalId: "W1",
      NOT: { entryId: { in: ["A", "B", "C", "D"] } },
    });
  });

  it("does not guess at a session when the workout has no id", async () => {
    await linkVoiceClips({ workoutLogId: "wl-2", externalId: null, setLog: [e("A", "ok")] });
    expect(updates).toHaveLength(1);
  });
});

describe("pruneVoiceAudio", () => {
  it("drops only recordings past the keep window", async () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(await pruneVoiceAudio(now)).toBe(3);
    const where = vi.mocked(prisma.voiceClipAudio.deleteMany).mock.calls[0][0]?.where as {
      clip: { createdAt: { lt: Date } };
    };
    const days = (now.getTime() - where.clip.createdAt.lt.getTime()) / 86_400_000;
    expect(days).toBe(VOICE_AUDIO_KEEP_DAYS);
  });
});
