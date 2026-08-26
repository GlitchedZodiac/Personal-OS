"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatStepPrescription } from "@/lib/sequences";
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
    thumbs?: string[];
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
  product: "SAVE TO MY USUALS",
};

// ————— Quick filters —————
// The thread is the log book, so it needs a way to be read as one. Each tab
// is a lens over the SAME transcript (nothing is hidden permanently) and
// keys off the proposal kinds the model already emits.
type FilterKey = "all" | "food" | "usuals" | "weight" | "chat";

const FILTERS: { key: FilterKey; label: string; kinds?: string[] }[] = [
  { key: "all", label: "All" },
  { key: "food", label: "Food", kinds: ["food", "edit_food"] },
  { key: "usuals", label: "Usuals", kinds: ["product"] },
  { key: "weight", label: "Weight", kinds: ["measurement"] },
  { key: "chat", label: "Chat" },
];

function matchesFilter(msg: ChatMsg, filter: FilterKey): boolean {
  if (filter === "all") return true;
  // "Chat" is the plain conversation — everything that isn't a proposal card.
  if (filter === "chat") return msg.role !== "proposal";
  if (msg.role !== "proposal") return false;
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
  return kinds.includes(msg.meta?.kind ?? "");
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot h-[5px] w-[5px] rounded-full bg-[#A63D63]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

function fmtTime(iso?: string) {
  return new Date(iso ?? Date.now())
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
}

// ————— Measurement card —————
// Head-to-toe, the same order the measurement wizard asks for them in, so a
// card and the wizard read as the same form. A proposal card is the last
// chance to catch a mis-heard number, so it has to be legible: labelled rows,
// nothing he didn't measure, and no raw ISO timestamps.
const MEASUREMENT_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
  { key: "neckCm", label: "Neck", unit: "cm" },
  { key: "shouldersCm", label: "Shoulders", unit: "cm" },
  { key: "chestCm", label: "Chest", unit: "cm" },
  { key: "waistCm", label: "Waist", unit: "cm" },
  { key: "hipsCm", label: "Hips", unit: "cm" },
  { key: "armsCm", label: "Arms", unit: "cm" },
  { key: "forearmsCm", label: "Forearms", unit: "cm" },
  { key: "legsCm", label: "Legs", unit: "cm" },
  { key: "calvesCm", label: "Calves", unit: "cm" },
];

/// Only what he actually measured. A 0 is not a measurement — the model used
/// to zero-fill every field it wasn't given, and the API drops those to null
/// anyway, so showing them promised a save that never happened.
function measurementRows(data: ProposalData) {
  return MEASUREMENT_FIELDS.flatMap(({ key, label, unit }) => {
    const raw = data[key];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return [];
    return [{ key, label, value: `${raw} ${unit}` }];
  });
}

/**
 * Decimals he spoke that the proposal doesn't account for.
 *
 * He dictates in rapid pairs and the pairing flips mid-sentence ("42.7 calf
 * 57.8 neck 39.3 shoulder width 50.9"). When the model can't place one, it
 * drops it silently — 57.8 vanished from his 08-20 check-in and the card
 * gave no sign. Prompting the model to ask instead did not hold (it still
 * dropped it), so the card checks the arithmetic itself.
 *
 * Only decimals count. Every measurement he dictates has a decimal point,
 * while stray integers ("the 20th", "5 kg per ankle") do not — so this
 * never cries wolf, at the cost of missing a dropped whole number.
 */
function unaccountedNumbers(said: string | undefined, data: ProposalData): string[] {
  if (!said) return [];
  const spoken = said.match(/\d+\.\d+/g);
  if (!spoken) return [];

  const used = new Set<string>();
  for (const { key } of MEASUREMENT_FIELDS) {
    const v = data[key];
    if (typeof v === "number" && v > 0) used.add(String(v));
  }
  // A number the model explained in notes ("Navel: 89.8 cm") is accounted
  // for — he can see where it went.
  const notes = typeof data.notes === "string" ? data.notes : "";
  for (const n of notes.match(/\d+\.\d+/g) ?? []) used.add(n);

  return [...new Set(spoken)].filter((n) => !used.has(n) && !used.has(String(Number(n))));
}

/// "Today at 10:04 AM" / "Aug 18 at 7:30 AM" — never the raw ISO string.
function fmtWhen(iso?: unknown) {
  if (typeof iso !== "string" || !iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = when.toDateString() === new Date().toDateString();
  if (sameDay) return `Today at ${time}`;
  return `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [micLevel, setMicLevel] = useState(0);

  // Mirror of toolLine so the hot delta path can check it without closing
  // over changing state (and without a set-state per token).
  const toolLineRef = useRef("");
  useEffect(() => {
    toolLineRef.current = toolLine;
  }, [toolLine]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Streaming used to call scrollIntoView({behavior:"smooth"}) once PER TOKEN,
  // so every delta re-targeted an in-flight smooth scroll — the single biggest
  // source of the "clunky" feel. Now: smooth for a new message, instant while
  // tokens land, and nothing at all if he has scrolled up to read history.
  const pinnedRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 140;
  }, []);

  useEffect(() => {
    const onScroll = () => {
      pinnedRef.current = isNearBottom();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  const scrollDown = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior, block: "end" })
    );
  }, []);

  useEffect(() => {
    fetch("/api/ai/chat/messages")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        setMessages(d.messages ?? []);
        scrollDown("auto");
      })
      .catch(() => {});
  }, [scrollDown]);

  // New bubbles get the smooth ride; streaming tokens get an instant nudge.
  useEffect(() => {
    if (pinnedRef.current) scrollDown("smooth");
  }, [messages, scrollDown]);

  useEffect(() => {
    if (streamText && pinnedRef.current) scrollDown("auto");
  }, [streamText, scrollDown]);

  // Dock hand-off: voice/text spoken anywhere in the app arrives here —
  // as a pending payload when the dock navigated, or live via event when
  // already on this screen.
  const sendRef = useRef<typeof send | null>(null);

  const send = useCallback(
    async (
      text: string,
      source: "text" | "voice" | "photo",
      photos?: { images: string[]; thumbs: string[] }
    ) => {
      const clean = text.trim();
      const images = photos?.images ?? [];
      // A capture with no words still sends — the photos are the message.
      if ((!clean && images.length === 0) || busy) return;
      setBusy(true);
      setDraft("");
      setStreamText("");
      setToolLine("");
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: clean || `(${images.length} photo${images.length === 1 ? "" : "s"})`,
          meta: { source, ...(photos?.thumbs?.length ? { thumbs: photos.thumbs } : {}) },
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
            images,
            thumbs: photos?.thumbs ?? [],
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

        // Deltas arrive faster than the screen refreshes. Painting each one
        // meant a full list re-render per token; coalescing to one paint per
        // frame keeps the text flowing without the stutter.
        let pendingPaint = 0;
        const paintSoon = () => {
          if (pendingPaint) return;
          pendingPaint = requestAnimationFrame(() => {
            pendingPaint = 0;
            setStreamText(assistantText);
          });
        };
        const paintNow = () => {
          if (pendingPaint) cancelAnimationFrame(pendingPaint);
          pendingPaint = 0;
          setStreamText(assistantText);
        };

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
              paintSoon();
              if (toolLineRef.current) setToolLine("");
            } else if (event.type === "tool") {
              setToolLine("checking your data…");
            } else if (event.type === "proposal" && event.id) {
              if (assistantText) {
                paintNow();
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

        if (pendingPaint) cancelAnimationFrame(pendingPaint);
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
    // One shape for both hand-off paths (navigated → sessionStorage, or
    // live → event): text, source, and optionally a photo capture.
    type HandOff = {
      text?: string;
      source?: string;
      photos?: { images: string[]; thumbs: string[] };
    };
    const dispatch = (payload: HandOff) => {
      const text = payload.text ?? "";
      const photos = payload.photos;
      if (!text && !photos?.images?.length) return;
      const source: "text" | "voice" | "photo" = photos
        ? "photo"
        : payload.source === "voice"
          ? "voice"
          : "text";
      sendRef.current?.(text, source, photos);
    };

    const pending = sessionStorage.getItem("pitaya:pending-chat");
    if (pending) {
      sessionStorage.removeItem("pitaya:pending-chat");
      try {
        dispatch(JSON.parse(pending) as HandOff);
      } catch {
        // malformed handoff — ignore
      }
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as HandOff | undefined;
      if (detail) dispatch(detail);
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

      // Live input level — the chat composer had no listening feedback at all
      // beyond a colour swap, so there was no way to tell a live mic from a
      // dead one. Failure here is cosmetic: recording still works.
      let levelRaf = 0;
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(bins);
          const avg = bins.reduce((s, v) => s + v, 0) / bins.length;
          setMicLevel(Math.min(1, avg / 90));
          levelRaf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // no level meter — the halo still animates
      }
      const stopLevels = () => {
        if (levelRaf) cancelAnimationFrame(levelRaf);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setMicLevel(0);
      };

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopLevels();
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
            // Mid-draft dictation APPENDS instead of sending — his "split"
            // ask: keep talking or typing, then hit send deliberately.
            const spoken = body.text.trim();
            setDraft((prev) => {
              if (prev.trim()) return `${prev.trim()} ${spoken}`;
              // empty draft → the classic flow: speak and it sends
              sendRef.current?.(spoken, "voice");
              return prev;
            });
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

  const visibleMessages = useMemo(
    () => messages.filter((m) => matchesFilter(m, filter)),
    [messages, filter]
  );

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
          body: JSON.stringify({
            id: data.id,
            match: data.match,
            set: data.set,
            assignments: data.assignments,
            exercises: data.exercises,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Edit failed");
        followUp = Array.isArray(data.exercises)
          ? "Structured — the session now carries what you actually did, measured against the recording. PRs checked."
          : "Fixed — PRs recalculated.";
      } else if (kind === "product") {
        const res = await fetch("/api/health/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            foodDescription: data.foodDescription,
            mealType: data.mealType ?? "snack",
            calories: data.calories,
            proteinG: data.proteinG,
            carbsG: data.carbsG,
            fatG: data.fatG,
            servingLabel: data.servingLabel,
            kind: "product",
            logNow: false, // the paired log_food card owns what was eaten
          }),
        });
        if (!res.ok) throw new Error("Save failed");
        followUp = `${String(data.foodDescription ?? "Product")} is in My usuals — one tap next time.`;
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
    // The message that prompted this card — the NEAREST one before it. (This
    // used to take the first match, i.e. the oldest user message in the whole
    // thread, and was then thrown away with `void source`.)
    const source = messages
      .filter(
        (m) => m.role === "user" && m.createdAt && msg.createdAt && m.createdAt <= msg.createdAt
      )
      .at(-1);
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
                {((data.steps as { exerciseName: string; sets?: number; reps?: number; seconds?: number; toFailure?: boolean; weightKg?: number; restSeconds?: number }[]) ?? []).map(
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
                          formatStepPrescription(s),
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

          {kind === "product" && (
            <div className="py-2">
              <p
                className="text-[15px] font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {String(data.foodDescription ?? "Product")}
              </p>
              {data.servingLabel != null && (
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8C2F51]">
                  per {String(data.servingLabel)}
                </p>
              )}
              <p className="mt-1.5 text-[13px] tabular-nums text-secondary-foreground">
                {String(data.calories ?? 0)} kcal · {String(data.proteinG ?? 0)}P ·{" "}
                {String(data.carbsG ?? 0)}C · {String(data.fatG ?? 0)}F
              </p>
            </div>
          )}

          {kind === "edit_workout" && (
            <div className="py-3 text-[13.5px] leading-relaxed text-foreground">
              <span className="font-semibold">{String(data.label ?? "Entry")}</span>
              {Array.isArray(data.exercises) && data.exercises.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 text-[12.5px]">
                  {(data.exercises as { name: string; sets?: number; reps?: number; seconds?: number; weightKg?: number }[]).map(
                    (e, i) => (
                      <li key={i} className="text-secondary-foreground">
                        {e.name}
                        {e.sets ? ` · ${e.sets}×${e.reps ?? "?"}` : e.reps ? ` · ${e.reps} reps` : ""}
                        {e.seconds ? ` · ${e.seconds}s` : ""}
                        {e.weightKg ? ` · ${e.weightKg} kg` : ""}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <>
                  {" → "}
                  {Array.isArray(data.assignments) && data.assignments.length > 0
                    ? (data.assignments as { match: string; weightKg: number }[])
                        .map((a) =>
                          a.match === "*" || a.match === ""
                            ? `everything ${a.weightKg} kg`
                            : `${a.match} ${a.weightKg} kg`
                        )
                        .join(" · ")
                    : Object.entries((data.set as object) ?? {})
                        .map(([k, v]) =>
                          k === "weightKg" ? `${v} kg` : k === "seconds" ? `${v}s` : `${k} ${v}`
                        )
                        .join(" · ")}
                </>
              )}
            </div>
          )}

          {kind === "measurement" && (
            <div className="py-2">
              {measurementRows(data).length > 0 ? (
                <div>
                  {measurementRows(data).map(({ key, label, value }) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between border-b border-muted py-[7px] last:border-b-0"
                    >
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-secondary-foreground">
                        {label}
                      </span>
                      <span className="text-[14px] font-semibold tabular-nums text-foreground">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-1 text-[13px] text-muted-foreground">
                  No measurements read — say the numbers again?
                </p>
              )}

              {typeof data.notes === "string" && data.notes.trim() !== "" && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-secondary-foreground">
                  {data.notes}
                </p>
              )}

              {(() => {
                const missed = unaccountedNumbers(source?.content, data);
                if (missed.length === 0) return null;
                return (
                  <p className="mt-2 rounded-[8px] bg-accent px-2.5 py-2 text-[12px] leading-relaxed text-[#8C2F51]">
                    <span className="font-semibold">
                      {missed.join(", ")} {missed.length === 1 ? "isn't" : "aren't"} on this card
                    </span>{" "}
                    — say which measurement, and I&apos;ll add it.
                  </p>
                );
              })()}

              {fmtWhen(data.measuredAt) && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {fmtWhen(data.measuredAt)}
                </p>
              )}
            </div>
          )}

          {!["food", "routine", "routine_update", "exercise", "edit_workout", "product", "measurement"].includes(kind) && (
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
                  // A zero-filled numeric field is the model padding out a
                  // schema, not something the user reported — and the CRUD
                  // routes drop it to null on save, so showing it lies.
                  .filter(([, v]) => v !== 0)
                  .map(([k, v]) => {
                    // "waistCm: 88" reads like a debug dump — humanize.
                    if (k.endsWith("Kg")) return `${k.slice(0, -2)} ${v} kg`;
                    if (k.endsWith("Cm")) return `${k.slice(0, -2)} ${v} cm`;
                    if (k.endsWith("Pct")) return `${k.slice(0, -3)} ${v}%`;
                    if (k.endsWith("Minutes")) return `${v} min`;
                    // ISO datetimes ("startedAt", "loggedAt") are unreadable
                    // raw — every card that carries one shows a clock time.
                    if (/(At|Date)$/.test(k)) {
                      const when = fmtWhen(v);
                      if (when) return when.toLowerCase();
                    }
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

      {/* Quick filters — read the thread as a food log, a usuals shelf, a
          weight history, or just the conversation. */}
      <div className="mt-3.5 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === "all"
              ? messages.length
              : messages.filter((m) => matchesFilter(m, f.key)).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-[6px] text-[12px] font-semibold transition-colors ${
                active
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-secondary-foreground"
              }`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 tabular-nums ${
                    active ? "text-white/70" : "text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-[14px] flex flex-1 flex-col gap-3">
        {filter !== "all" && visibleMessages.length === 0 && (
          <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] text-muted-foreground">
            Nothing filed under{" "}
            <span className="font-semibold">
              {FILTERS.find((f) => f.key === filter)?.label}
            </span>{" "}
            yet.
          </div>
        )}
        {messages.length === 0 && !busy && (
          <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
            Say it or type it — &ldquo;log lunch&rdquo;, &ldquo;what&apos;s my
            swing PR?&rdquo;, &ldquo;change the rice to 2 cups&rdquo;. Tap the{" "}
            <span className="font-semibold text-[#8C2F51]">mic</span> and just
            talk.
          </div>
        )}

        {visibleMessages.map((msg) => {
          if (msg.role === "proposal") return renderProposal(msg);
          if (msg.role === "user") {
            const thumbs = msg.meta?.thumbs ?? [];
            return (
              <div key={msg.id} className="msg-in max-w-[300px] self-end">
                {thumbs.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                    {thumbs.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-[74px] w-[74px] rounded-[12px] border border-[#E9CFDC] object-cover"
                      />
                    ))}
                  </div>
                )}
                <div className="rounded-[18px] rounded-br-[5px] bg-primary px-3.5 py-[11px] text-sm leading-relaxed text-white">
                  {msg.content}
                </div>
                {(msg.meta?.source === "voice" || msg.meta?.source === "photo") && (
                  <p className="mt-1 text-right text-[10.5px] text-muted-foreground">
                    {msg.meta.source === "photo" ? "via photo" : "via voice"}
                  </p>
                )}
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className="msg-in max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground"
            >
              {msg.content}
            </div>
          );
        })}

        {/* Live turn — hidden under a filter that this reply won't match, so
            the lens stays honest while it's still being written. */}
        {(filter === "all" || filter === "chat") && (
          <>
            {streamText && (
              <div className="msg-in max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground">
                {streamText}
                <span className="stream-caret ml-[2px] inline-block h-[13px] w-[2px] translate-y-[2px] rounded-full bg-[#A63D63]" />
              </div>
            )}
            {busy && !streamText && (
              <div className="msg-in flex max-w-[310px] items-center gap-2 self-start rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[13px]">
                <TypingDots />
                {toolLine && (
                  <span className="text-[11.5px] text-muted-foreground">
                    {toolLine}
                  </span>
                )}
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Listening strip — sits directly above the composer so the state is
          readable without hunting for a colour change on the button. The
          bars ride the real input level: silence = flat, speech = moving. */}
      {(recording || transcribing) && (
        <div
          className="msg-in sticky z-10 mx-auto -mb-1 flex items-center gap-2 rounded-full bg-[#A63D63] px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(166,61,99,0.35)]"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9.2rem)" }}
        >
          {recording ? (
            <>
              <span className="flex items-end gap-[2px]" aria-hidden>
                {[0.55, 1, 0.75].map((scale, i) => (
                  <span
                    key={i}
                    className="w-[2.5px] rounded-full bg-white"
                    style={{
                      height: `${4 + micLevel * 11 * scale}px`,
                      transition: "height 80ms linear",
                    }}
                  />
                ))}
              </span>
              Listening — tap the mic to stop
            </>
          ) : (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Writing that down…
            </>
          )}
        </div>
      )}

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
        {/* Mic is always available (mid-draft dictation appends); the send
            arrow joins it whenever there's text — his "split" ask.
            Listening state: breathing halo + a ring that rides the real
            input level, so a live mic is unmistakable from a dead one. */}
        <div className="relative flex shrink-0 items-center justify-center">
          {recording && (
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-[#A63D63]/25"
              style={{
                width: `${36 + micLevel * 26}px`,
                height: `${36 + micLevel * 26}px`,
                opacity: 0.35 + micLevel * 0.5,
                transition: "width 90ms linear, height 90ms linear",
              }}
            />
          )}
          <button
            type="button"
            onClick={() =>
              recording ? recorderRef.current?.stop() : startVoice()
            }
            disabled={busy || transcribing}
            aria-label={recording ? "Stop recording" : "Start voice input"}
            aria-pressed={recording}
            className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              recording ? "mic-halo" : ""
            }`}
            style={{ background: recording ? "#A63D63" : "#F6E3EB" }}
          >
            {transcribing ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#8C2F51] border-t-transparent" />
            ) : (
              <MicGlyph color={recording ? "#FFFFFF" : "#8C2F51"} />
            )}
          </button>
        </div>
        {draft.trim() && (
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
        )}
      </form>
    </div>
  );
}
