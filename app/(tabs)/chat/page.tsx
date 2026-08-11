"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getOrCreateMicrophoneStream,
  deactivateMicrophoneStream,
} from "@/lib/microphone";

// Pitaya Chat — "the notebook that talks back" (docs/design/
// pitaya-app.dc.html, screen 1). Streams from the Responses-API loop at
// /api/ai/chat/stream; proposal cards keep the confirm-first shape and
// persist through the same CRUD endpoints the dock uses. Surfaced
// deviations: the empty-thread hint uses honest copy (the design's
// references demo state), and a small "checking your data" line shows
// while the model reads real logs (no spec in the design for it).

interface FoodItem {
  mealType?: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedAt?: string;
}

interface ProposalData {
  message?: string;
  items?: FoodItem[]; // food
  [key: string]: unknown; // measurement/workout/water/edit/delete fields
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "proposal";
  content: string;
  meta?: {
    source?: string;
    kind?: string;
    data?: ProposalData;
    status?: "pending" | "saved" | "rejected";
  } | null;
  createdAt?: string;
}

const KIND_TITLES: Record<string, string> = {
  food: "PROPOSED LOG",
  measurement: "PROPOSED MEASUREMENT",
  workout: "PROPOSED WORKOUT",
  water: "PROPOSED WATER",
  edit_food: "PROPOSED EDIT",
  delete: "PROPOSED DELETE",
  routine: "PROPOSED ROUTINE",
  routine_update: "ROUTINE UPDATE",
  exercise: "NEW MOVEMENT",
  edit_workout: "WORKOUT FIX",
};

function fmtTime(iso?: string) {
  return new Date(iso ?? Date.now())
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
}

function MicGlyph({ size = 16, color = "#8C2F51" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="7" y="2" width="6" height="11" rx="3" fill={color} />
      <path
        d="M4 9 a6 6 0 0 0 12 0 M10 15 v3"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [toolLine, setToolLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [itemScales, setItemScales] = useState<Record<string, number[]>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    );
  }, []);

  useEffect(() => {
    fetch("/api/ai/chat/messages")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        setMessages(d.messages ?? []);
        scrollDown();
      })
      .catch(() => {});
  }, [scrollDown]);

  useEffect(scrollDown, [messages, streamText, scrollDown]);

  // Dock hand-off: voice/text spoken anywhere in the app arrives here —
  // as a pending payload when the dock navigated, or live via event when
  // already on this screen.
  const sendRef = useRef<typeof send | null>(null);

  const send = useCallback(
    async (text: string, source: "text" | "voice") => {
      const clean = text.trim();
      if (!clean || busy) return;
      setBusy(true);
      setDraft("");
      setStreamText("");
      setToolLine("");
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: clean,
          meta: { source },
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        const res = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: clean,
            source,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Chat unavailable");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let event: {
              type: string;
              text?: string;
              id?: string;
              kind?: string;
              data?: ProposalData;
              query?: string;
              message?: string;
            };
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.type === "delta" && event.text) {
              assistantText += event.text;
              setStreamText(assistantText);
              setToolLine("");
            } else if (event.type === "tool") {
              setToolLine("checking your data…");
            } else if (event.type === "proposal" && event.id) {
              if (assistantText) {
                setMessages((prev) => [
                  ...prev,
                  { id: `a-${Date.now()}`, role: "assistant", content: assistantText },
                ]);
                assistantText = "";
                setStreamText("");
              }
              setMessages((prev) => [
                ...prev,
                {
                  id: event.id as string,
                  role: "proposal",
                  content: event.data?.message ?? "",
                  meta: { kind: event.kind, data: event.data, status: "pending" },
                  createdAt: new Date().toISOString(),
                },
              ]);
            } else if (event.type === "error") {
              toast.error(event.message ?? "Chat error");
            }
          }
        }

        if (assistantText) {
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: "assistant", content: assistantText },
          ]);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chat unavailable");
      } finally {
        setStreamText("");
        setToolLine("");
        setBusy(false);
      }
    },
    [busy]
  );
  sendRef.current = send;

  useEffect(() => {
    const pending = sessionStorage.getItem("pitaya:pending-chat");
    if (pending) {
      sessionStorage.removeItem("pitaya:pending-chat");
      try {
        const { text, source } = JSON.parse(pending);
        if (text) sendRef.current?.(text, source === "voice" ? "voice" : "text");
      } catch {
        // malformed handoff — ignore
      }
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { text?: string; source?: string }
        | undefined;
      if (detail?.text) {
        sendRef.current?.(detail.text, detail.source === "voice" ? "voice" : "text");
      }
    };
    window.addEventListener("pitaya:chat-send", handler);
    return () => window.removeEventListener("pitaya:chat-send", handler);
  }, []);

  // ——— voice (tap to talk, tap to stop) ———
  const startVoice = async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();
      const mimes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        deactivateMicrophoneStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, `chat.${mime.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.text?.trim()) {
            send(body.text.trim(), "voice");
          } else {
            toast.error("Couldn't hear that — try again.");
          }
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  // ——— proposal actions ———
  const resolveCard = async (id: string, status: "saved" | "rejected") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, meta: { ...m.meta, status } } : m
      )
    );
    fetch("/api/ai/chat/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
  };

  const scaledItems = (msg: ChatMsg): FoodItem[] => {
    const items = msg.meta?.data?.items ?? [];
    const scales = itemScales[msg.id] ?? items.map(() => 1);
    return items.map((it, i) => {
      const s = scales[i] ?? 1;
      return {
        ...it,
        calories: Math.round(it.calories * s),
        proteinG: Math.round(it.proteinG * s),
        carbsG: Math.round(it.carbsG * s),
        fatG: Math.round(it.fatG * s),
      };
    });
  };

  const bumpScale = (msgId: string, idx: number, dir: 1 | -1, count: number) => {
    setItemScales((prev) => {
      const scales = [...(prev[msgId] ?? Array.from({ length: count }, () => 1))];
      scales[idx] = Math.max(0.25, Math.round((scales[idx] + dir * 0.25) * 100) / 100);
      return { ...prev, [msgId]: scales };
    });
  };

  const confirmProposal = async (msg: ChatMsg) => {
    const kind = msg.meta?.kind;
    const data = msg.meta?.data ?? {};
    setConfirmBusy(msg.id);
    try {
      let followUp = "";

      if (kind === "food") {
        const items = scaledItems(msg);
        const res = await fetch("/api/health/food/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, loggedAt: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error("Save failed");
        const kcal = items.reduce((s, i) => s + i.calories, 0);
        followUp = `${kcal.toLocaleString()} kcal in the book.`;
      } else if (kind === "measurement") {
        const { message: _m, ...fields } = data;
        void _m;
        const res = await fetch("/api/health/body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error("Save failed");
        followUp = "Measurement saved.";
      } else if (kind === "workout") {
        const { message: _m, ...fields } = data;
        void _m;
        const res = await fetch("/api/health/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        const prs = Array.isArray(body.newPRs) ? body.newPRs : [];
        followUp = prs.length
          ? prs
              .map(
                (p: { exerciseName: string; value: number; unit: string }) =>
                  `NEW PR — ${p.exerciseName}: ${p.value} ${p.unit === "kg-reps" ? "kg total" : "kg"}.`
              )
              .join(" ")
          : "Session saved.";
      } else if (kind === "water") {
        const glasses = Number(data.glasses) || 1;
        const perGlass = Math.round(Number(data.amountMl ?? 250) / glasses);
        for (let i = 0; i < glasses; i++) {
          await fetch("/api/health/water", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amountMl: perGlass }),
          });
        }
        followUp = "Hydration logged.";
      } else if (kind === "edit_food") {
        const res = await fetch(
          `/api/health/food?id=${encodeURIComponent(String(data.id))}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data.set ?? {}),
          }
        );
        if (!res.ok) throw new Error("Edit failed");
        followUp = "Updated.";
      } else if (kind === "routine" || kind === "routine_update") {
        const { message: _m, ...fields } = data;
        void _m;
        const res = await fetch("/api/health/sequences", {
          method: kind === "routine_update" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        const minted: string[] = Array.isArray(body.mintedExercises)
          ? body.mintedExercises
          : [];
        followUp =
          kind === "routine_update"
            ? `${String(data.name ?? "Routine")} updated — the watch picks it up on next open.`
            : `${String(data.name ?? "Routine")} is in Routines — and on the watch list.`;
        if (minted.length > 0) {
          followUp += ` New movement${minted.length > 1 ? "s" : ""} minted: ${minted.join(", ")}.`;
        }
      } else if (kind === "exercise") {
        const { message: _m, ...fields } = data;
        void _m;
        const res = await fetch("/api/health/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        followUp = body.created
          ? `${String(body.exercise?.name ?? data.name ?? "Movement")} added — voice, PRs, and routines all know it now.`
          : `Already knew that one — it resolves to ${String(body.exercise?.name ?? "an existing movement")}.`;
      } else if (kind === "edit_workout") {
        const res = await fetch("/api/health/workouts/entry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.id, match: data.match, set: data.set }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Edit failed");
        followUp = "Fixed — PRs recalculated.";
      } else if (kind === "delete") {
        const entity = String(data.entity ?? "food");
        const endpoint =
          entity === "workout"
            ? "/api/health/workouts"
            : entity === "measurement"
              ? "/api/health/body"
              : "/api/health/food";
        const res = await fetch(`${endpoint}?id=${encodeURIComponent(String(data.id))}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        followUp = "Gone.";
      }

      await resolveCard(msg.id, "saved");
      setEditingCard(null);
      if (followUp) {
        setMessages((prev) => [
          ...prev,
          { id: `f-${Date.now()}`, role: "assistant", content: followUp },
        ]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setConfirmBusy(null);
    }
  };

  // ——— render helpers ———
  const renderProposal = (msg: ChatMsg) => {
    const kind = msg.meta?.kind ?? "food";
    const status = msg.meta?.status ?? "pending";
    const data = msg.meta?.data ?? {};
    const source = messages.find(
      (m) => m.role === "user" && m.createdAt && msg.createdAt && m.createdAt <= msg.createdAt
    );
    void source;
    const editing = editingCard === msg.id;
    const items = kind === "food" ? scaledItems(msg) : [];
    const totalKcal = items.reduce((s, i) => s + i.calories, 0);
    const totals = items.reduce(
      (acc, i) => ({ p: acc.p + i.proteinG, c: acc.c + i.carbsG, f: acc.f + i.fatG }),
      { p: 0, c: 0, f: 0 }
    );

    return (
      <div
        key={msg.id}
        className="overflow-hidden rounded-[16px] border-[1.5px] border-[#E9CFDC] bg-card"
        style={{ animation: "fadeUp .45s ease both" }}
      >
        <div className="flex items-center justify-between bg-accent px-3.5 py-2.5">
          <span className="text-[10.5px] font-bold tracking-[0.14em] text-[#8C2F51]">
            {KIND_TITLES[kind] ?? "PROPOSED"} · {fmtTime(msg.createdAt)}
          </span>
        </div>

        <div className="px-3.5 pt-1">
          {kind === "food" &&
            items.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-muted py-2.5"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {it.foodDescription}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {it.proteinG}P · {it.carbsG}C · {it.fatG}F
                  </p>
                </div>
                {editing ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => bumpScale(msg.id, i, -1, items.length)}
                      className="h-[26px] w-[26px] rounded-[8px] border border-[#D9D7DC] bg-card text-[15px] leading-none text-[#8C2F51]"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-[13.5px] font-bold tabular-nums text-[#8C2F51]">
                      {it.calories}
                    </span>
                    <button
                      onClick={() => bumpScale(msg.id, i, 1, items.length)}
                      className="h-[26px] w-[26px] rounded-[8px] border border-[#D9D7DC] bg-card text-[15px] leading-none text-[#8C2F51]"
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <span className="text-[13.5px] font-semibold tabular-nums text-foreground">
                    {it.calories}
                  </span>
                )}
              </div>
            ))}

          {kind === "food" && items.length > 0 && (
            <div className="flex items-center justify-between py-[11px]">
              <span
                className="text-sm font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Total · {totals.p}P / {totals.c}C / {totals.f}F
              </span>
              <span
                className="text-[17px] font-bold tabular-nums text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {totalKcal.toLocaleString()} kcal
              </span>
            </div>
          )}

          {(kind === "routine" || kind === "routine_update") && (
            <div className="py-2">
              <p
                className="text-[15px] font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {String(data.name ?? "Routine")}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8C2F51]">
                {String(data.kind ?? "")}
                {data.durationMinutes ? ` · ${data.durationMinutes} min` : ""}
                {data.rounds ? ` · ${data.rounds} rounds` : ""}
                {data.restSecondsDefault ? ` · rest ${data.restSecondsDefault}s` : ""}
              </p>
              <div className="mt-2">
                {((data.steps as { exerciseName: string; sets?: number; reps?: number; seconds?: number; weightKg?: number; restSeconds?: number }[]) ?? []).map(
                  (s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-t border-muted py-2 first:border-t-0"
                    >
                      <span className="text-[13px] font-semibold text-foreground">
                        {s.exerciseName}
                      </span>
                      <span className="text-[12px] tabular-nums text-secondary-foreground">
                        {[
                          s.sets && s.reps
                            ? `${s.sets} × ${s.reps}`
                            : s.reps
                              ? `${s.reps} reps`
                              : s.seconds
                                ? `${s.seconds}s`
                                : null,
                          s.weightKg ? `${s.weightKg} kg` : null,
                          s.restSeconds ? `rest ${s.restSeconds}s` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {kind === "exercise" && (
            <div className="py-2">
              <p
                className="text-[15px] font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {String(data.name ?? "Movement")}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8C2F51]">
                {String(data.category ?? "other")}
              </p>
              {Array.isArray(data.aliases) && data.aliases.length > 0 && (
                <p className="mt-1.5 text-[12px] text-secondary-foreground">
                  also answers to {(data.aliases as string[]).join(", ")}
                </p>
              )}
            </div>
          )}

          {kind === "edit_workout" && (
            <div className="py-3 text-[13.5px] leading-relaxed text-foreground">
              <span className="font-semibold">{String(data.label ?? "Entry")}</span>
              {" → "}
              {Object.entries((data.set as object) ?? {})
                .map(([k, v]) =>
                  k === "weightKg" ? `${v} kg` : k === "seconds" ? `${v}s` : `${k} ${v}`
                )
                .join(" · ")}
            </div>
          )}

          {!["food", "routine", "routine_update", "exercise", "edit_workout"].includes(kind) && (
            <div className="py-3 text-[13.5px] leading-relaxed text-foreground">
              {kind === "delete" ? (
                <>Delete <span className="font-semibold">{String(data.label ?? "this entry")}</span>?</>
              ) : kind === "edit_food" ? (
                <>
                  <span className="font-semibold">{String(data.label ?? "Entry")}</span>
                  {" → "}
                  {Object.entries((data.set as object) ?? {})
                    .map(([k, v]) => `${k.replace(/G$/, "")} ${v}`)
                    .join(" · ")}
                </>
              ) : (
                Object.entries(data)
                  .filter(([k, v]) => k !== "message" && v != null && typeof v !== "object")
                  .map(([k, v]) => {
                    // "waistCm: 88" reads like a debug dump — humanize.
                    if (k.endsWith("Kg")) return `${k.slice(0, -2)} ${v} kg`;
                    if (k.endsWith("Cm")) return `${k.slice(0, -2)} ${v} cm`;
                    if (k.endsWith("Pct")) return `${k.slice(0, -3)} ${v}%`;
                    if (k.endsWith("Minutes")) return `${v} min`;
                    return `${k} ${v}`;
                  })
                  .join(" · ")
              )}
            </div>
          )}
        </div>

        {status === "pending" && (
          <div className="flex gap-2 px-3.5 pb-3.5 pt-1">
            <button
              onClick={() => confirmProposal(msg)}
              disabled={confirmBusy === msg.id}
              className="flex-[1.4] rounded-[10px] bg-primary py-[11px] text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {confirmBusy === msg.id
                ? "Saving…"
                : editing
                  ? "Save edits"
                  : "Confirm"}
            </button>
            {kind === "food" && (
              <button
                onClick={() => setEditingCard(editing ? null : msg.id)}
                className="flex-1 rounded-[10px] border border-[#D9D7DC] py-[11px] text-[13px] font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {editing ? "Done" : "Edit"}
              </button>
            )}
            <button
              onClick={() => resolveCard(msg.id, "rejected")}
              className="flex-1 rounded-[10px] border border-border py-[11px] text-[13px] font-semibold text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Reject
            </button>
          </div>
        )}
        {status === "saved" && (
          <div className="bg-[#EAF3ED] px-3.5 py-3 text-[13px] font-semibold text-[#3E7A54]">
            ✓ Saved · {fmtTime(msg.createdAt)}
          </div>
        )}
        {status === "rejected" && (
          <div className="bg-background px-3.5 py-3 text-[13px] font-semibold text-muted-foreground">
            Discarded. Nothing saved.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col px-4 pb-44 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      <p className="micro-label">The notebook that talks back</p>
      <h1
        className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Chat
      </h1>

      <div className="mt-[18px] flex flex-1 flex-col gap-3">
        {messages.length === 0 && !busy && (
          <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
            Say it or type it — &ldquo;log lunch&rdquo;, &ldquo;what&apos;s my
            swing PR?&rdquo;, &ldquo;change the rice to 2 cups&rdquo;. Tap the{" "}
            <span className="font-semibold text-[#8C2F51]">mic</span> and just
            talk.
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "proposal") return renderProposal(msg);
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="max-w-[300px] self-end">
                <div className="rounded-[18px] rounded-br-[5px] bg-primary px-3.5 py-[11px] text-sm leading-relaxed text-white">
                  {msg.content}
                </div>
                {msg.meta?.source === "voice" && (
                  <p className="mt-1 text-right text-[10.5px] text-muted-foreground">
                    via voice
                  </p>
                )}
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className="max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground"
            >
              {msg.content}
            </div>
          );
        })}

        {streamText && (
          <div className="max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground">
            {streamText}
          </div>
        )}
        {busy && !streamText && (
          <div className="self-start px-1 text-[11.5px] italic text-muted-foreground">
            {toolLine || "…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft, "text");
        }}
        className="sticky mt-4 flex items-center gap-2.5 rounded-full border border-border bg-card py-2 pl-[18px] pr-2 shadow-[0_6px_20px_rgba(35,34,39,0.08)]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            transcribing ? "Transcribing…" : "Type, or tap the mic…"
          }
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {draft.trim() ? (
          // Typed something → the button sends. Mic returns when it's empty.
          <button
            type="submit"
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4Z" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              recording ? recorderRef.current?.stop() : startVoice()
            }
            disabled={busy || transcribing}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{ background: recording ? "#A63D63" : "#F6E3EB" }}
          >
            <MicGlyph color={recording ? "#FFFFFF" : "#8C2F51"} />
          </button>
        )}
      </form>
    </div>
  );
}
