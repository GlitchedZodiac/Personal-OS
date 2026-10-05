"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatHistoryDrawer } from "@/components/chat-history-drawer";
import { PhotoTray } from "@/components/photo-tray";
import { CameraIcon, JournalIcon, MicIcon } from "@/components/pitaya-icons";
import { HANDOFF_EVENT, takeChatHandOff, type ChatHandOff } from "@/lib/chat-handoff";
import { isStale, normalizeGapHours, type ConversationSummary } from "@/lib/chat-history";
import { haptic } from "@/lib/haptics";
import { getSettings } from "@/lib/settings";
import { formatStepPrescription } from "@/lib/sequences";
import {
  getOrCreateMicrophoneStream,
  deactivateMicrophoneStream,
} from "@/lib/microphone";
import {
  MAX_SHOTS,
  filesToShots,
  fitPayloadBudget,
  roomFor,
  type Shot,
} from "@/lib/photo-capture";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";

// Pitaya Chat — "the notebook that talks back" (docs/design/
// pitaya-app.dc.html, screen 1). Streams from the Responses-API loop at
// /api/ai/chat/stream; proposal cards keep the confirm-first shape and
// persist through the same CRUD endpoints the dock uses. Surfaced
// deviations: the empty-thread hint uses honest copy (the design's
// references demo state), and a small "checking your data" line shows
// while the model reads real logs (no spec in the design for it).
//
// LAYOUT (2026-10-04). The screen is a column that fills exactly what is
// visible — header, the thread (its own scroller), composer — instead of a
// tall page scrolled by the window with a sticky composer laid over it.
// Two bugs lived in the old shape: the newest message parked underneath the
// composer and the thread un-pinned itself (lib/chat-scroll.ts), and the
// keyboard covered whatever was pinned to "the bottom" (lib/visual-viewport
// .ts). Surfaced deviations from the design: the composer is fixed at the
// foot rather than flowing after the last message, and a "Latest" pill
// appears while he reads history (neither exists in the design's static
// frame).
//
// CHATS (2026-10-04). The thread is no longer one endless transcript: this
// screen shows ONE chat, the ☰ opens the shelf of all of them
// (components/chat-history-drawer.tsx), and "New" starts a clean one. A
// chat that has gone quiet for longer than the setting (6 h by default)
// is not continued — the next message starts a new chat by itself. Nothing
// is created until he actually says something. Surfaced deviation: the ☰,
// the "New" pill and the chat's title line are not in the design.
//
// PHOTOS (2026-10-04). The composer has its own camera now. It used to have
// none: the dock is hidden on this screen, so the only way to send a photo
// from the chat was to leave it. Photos collect in a tray above the input —
// each with its ✕, then "Add another" (straight back into the camera) and
// "Library" — and go out as ONE message with whatever he typed or said.
// Tray, compression and the six-frame cap are shared with the dock's sheet
// (components/photo-tray.tsx, lib/photo-capture.ts). Surfaced deviation: the
// design's composer is text + mic only.

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
  trail: "NAME THIS TRAIL",
  plan_week: "THE WEEK, PLANNED",
  reminder: "PROPOSED REMINDER",
};

const weekdayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
    : day;
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  // ——— photos waiting to be sent with the next message ———
  const [shots, setShots] = useState<Shot[]>([]);
  const [readingShots, setReadingShots] = useState(false);
  // Three inputs, three behaviours: the composer's button gets the system's
  // own menu (Photo Library / Take Photo); the tray's tiles go straight to
  // the camera or straight to a multi-select library.
  const anySourceRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  // What is in the composer right now, readable from callbacks that outlive
  // the render they were created in (the recorder's onstop).
  const composing = useRef({ draft: "", shots: 0 });
  useEffect(() => {
    composing.current = { draft, shots: shots.length };
  }, [draft, shots.length]);

  // Messages that ARRIVED in this session animate in; a thread loaded from
  // history, and a streamed reply settling into its final bubble, do not —
  // otherwise opening the chat is sixty bubbles fading up at once, and every
  // finished reply blinks as its live bubble is swapped for the stored one.
  const fresh = useRef(new Set<string>());

  // The thread follows the newest message unless he has scrolled up to read
  // (rules + the bug they replace: lib/chat-scroll.ts). `watch` is everything
  // that makes the thread taller from React's side.
  const { scrollerRef, contentRef, pinned, unseen, pinNow, jumpToLatest } = useStickToBottom({
    watch: `${messages.length}:${streamText.length}:${busy}:${toolLine}:${filter}:${editingCard}:${shots.length}:${readingShots}`,
  });

  // ——— which chat is on screen ———
  // `conversation` null = a new chat that does not exist yet (it is created
  // by the first message). The ref mirrors it for send(), which must read
  // the chat as of the moment of sending, not as of its own last render.
  const [conversation, setConversationState] = useState<ConversationSummary | null>(null);
  const conversationRef = useRef<ConversationSummary | null>(null);
  const applyConversation = useCallback((next: ConversationSummary | null) => {
    conversationRef.current = next;
    setConversationState(next);
  }, []);
  // The chat the quiet-gap rule declined to continue — named on the empty
  // screen so "where did my messages go" has a one-tap answer.
  const [passedOver, setPassedOver] = useState<ConversationSummary | null>(null);
  // He picked this chat from the shelf himself. Continuing an old chat on
  // purpose is not "going quiet", so the gap rule leaves it alone.
  const pickedByHim = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shelfVersion, setShelfVersion] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Until the thread has answered, "you haven't said anything yet" is not
  // known to be true — and showing it for the half-second of the fetch made
  // every visit open on an empty-state card that then vanished.
  const [loaded, setLoaded] = useState(false);
  // Resolves once the current chat is known. A message sent before that —
  // a dock hand-off arriving with the navigation, a fast thumb — waits for
  // it, or it would start a new chat while a live one was still loading.
  const ready = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (ready.current) return; // StrictMode's second pass reuses the first load
    ready.current = (async () => {
      try {
        const gap = normalizeGapHours(getSettings().chatNewChatGapHours);
        const res = await fetch(`/api/ai/chat/messages?gap=${gap}`);
        if (!res.ok) return;
        const d = (await res.json()) as {
          conversation: ConversationSummary | null;
          latest: ConversationSummary | null;
          messages: ChatMsg[];
        };
        applyConversation(d.conversation ?? null);
        setPassedOver(d.conversation ? null : (d.latest ?? null));
        setMessages(d.messages ?? []);
      } catch {
        // offline or failed: the screen opens on an empty new chat
      } finally {
        setLoaded(true);
      }
    })();
  }, [applyConversation]);

  const openChat = useCallback(
    async (target: ConversationSummary) => {
      setDrawerOpen(false);
      if (target.id === conversationRef.current?.id) return;
      try {
        const res = await fetch(
          `/api/ai/chat/messages?conversationId=${encodeURIComponent(target.id)}`
        );
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.conversation) throw new Error();
        pickedByHim.current = true;
        fresh.current.clear();
        setFilter("all");
        setEditingCard(null);
        setPassedOver(null);
        setRenaming(false);
        applyConversation(d.conversation as ConversationSummary);
        pinNow(); // a chat opens on its newest message
        setMessages((d.messages ?? []) as ChatMsg[]);
      } catch {
        toast.error("Couldn't open that chat.");
      }
    },
    [applyConversation, pinNow]
  );

  const startNewChat = useCallback(() => {
    setDrawerOpen(false);
    pickedByHim.current = false;
    fresh.current.clear();
    setFilter("all");
    setEditingCard(null);
    setRenaming(false);
    // the chat being left is the one worth naming on the empty screen
    setPassedOver(conversationRef.current);
    applyConversation(null);
    setMessages([]);
    draftRef.current?.focus();
  }, [applyConversation]);

  const commitTitle = useCallback(async () => {
    const current = conversationRef.current;
    setRenaming(false);
    if (!current) return;
    const title = titleDraft.trim();
    if (title === current.title) return;
    try {
      const res = await fetch(`/api/ai/chat/conversations/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.conversation) throw new Error();
      if (conversationRef.current?.id === current.id) {
        applyConversation(body.conversation as ConversationSummary);
      }
      setShelfVersion((v) => v + 1);
      haptic("light");
    } catch {
      toast.error("Couldn't rename this chat.");
    }
  }, [applyConversation, titleDraft]);

  // The composer grows with what he has written (dictation appends whole
  // sentences) up to a few lines, then scrolls inside itself.
  useLayoutEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

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
      haptic("light");

      // Which chat does this join? Not decided until the current chat is
      // known — and a chat that has sat quiet past the gap is finished, even
      // if it has been open on this screen the whole time.
      await ready.current;
      let target = conversationRef.current;
      const gap = normalizeGapHours(getSettings().chatNewChatGapHours);
      if (target && !pickedByHim.current && isStale(target.lastMessageAt, new Date(), gap)) {
        setPassedOver(target);
        fresh.current.clear();
        applyConversation(null);
        setMessages([]);
        target = null;
      }

      // His own message always pulls the thread to the end — even if he was
      // reading history a moment ago.
      pinNow();
      const localId = `local-${Date.now()}`;
      fresh.current.add(localId);
      setMessages((prev) => [
        ...prev,
        {
          id: localId,
          role: "user",
          content: clean || `(${images.length} photo${images.length === 1 ? "" : "s"})`,
          meta: { source, ...(photos?.thumbs?.length ? { thumbs: photos.thumbs } : {}) },
          createdAt: new Date().toISOString(),
        },
      ]);

      // Assigned once the stream is open; until then "finishing" is just
      // letting go of the composer (a failed request must not leave it locked).
      let finish = () => {
        setStreamText("");
        setToolLine("");
        setBusy(false);
      };

      try {
        const res = await fetch("/api/ai/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: clean,
            source,
            images,
            thumbs: photos?.thumbs ?? [],
            conversationId: target?.id ?? null,
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
        let finished = false;

        // Deltas arrive faster than the screen refreshes. Painting each one
        // meant a full list re-render per token; coalescing to one paint per
        // frame keeps the text flowing without the stutter.
        let pendingPaint = 0;
        const paintSoon = () => {
          if (pendingPaint) return;
          pendingPaint = requestAnimationFrame(() => {
            pendingPaint = 0;
            if (!finished) setStreamText(assistantText);
          });
        };
        // The turn is over: settle the reply into its bubble and free the
        // composer. Runs on the server's "done" — which now arrives BEFORE
        // the stream closes, because a new chat's title is written after it
        // and he should not wait on a title to type his next message.
        finish = () => {
          if (finished) return;
          finished = true;
          if (pendingPaint) cancelAnimationFrame(pendingPaint);
          pendingPaint = 0;
          const settled = assistantText;
          assistantText = "";
          if (settled) {
            setMessages((prev) => [
              ...prev,
              { id: `a-${Date.now()}`, role: "assistant", content: settled },
            ]);
          }
          setStreamText("");
          setToolLine("");
          setBusy(false);
          const current = conversationRef.current;
          if (current) {
            applyConversation({ ...current, lastMessageAt: new Date().toISOString() });
          }
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
              title?: string;
              titleSource?: string;
              created?: boolean;
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
              fresh.current.add(event.id);
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
            } else if (event.type === "conversation" && event.id) {
              // Which chat this turn landed in — new information when it
              // was sent with no id (a new chat was just born).
              const now = new Date().toISOString();
              const known = conversationRef.current;
              applyConversation({
                id: event.id,
                title: event.title ?? known?.title ?? "",
                titleSource: event.titleSource ?? known?.titleSource ?? "auto",
                createdAt: known?.id === event.id ? known.createdAt : now,
                lastMessageAt: now,
                messageCount: known?.id === event.id ? known.messageCount : 0,
              });
              if (event.created) {
                setPassedOver(null);
                setShelfVersion((v) => v + 1);
              }
            } else if (event.type === "title" && event.id && event.title) {
              const known = conversationRef.current;
              if (known?.id === event.id) {
                applyConversation({ ...known, title: event.title, titleSource: "ai" });
              }
              setShelfVersion((v) => v + 1);
            } else if (event.type === "done") {
              finish();
            } else if (event.type === "error") {
              toast.error(event.message ?? "Chat error");
            }
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Chat unavailable");
      } finally {
        finish();
      }
    },
    [applyConversation, busy, pinNow]
  );
  sendRef.current = send;

  useEffect(() => {
    // One shape for both hand-off paths (navigated → the stash in
    // lib/chat-handoff.ts, or live → event): text, source, and optionally a
    // photo capture.
    const dispatch = (payload: ChatHandOff) => {
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

    // send() itself waits for the current chat to be known, so a hand-off
    // that arrives with the navigation joins the live chat instead of
    // racing its load and starting a second one.
    const pending = takeChatHandOff();
    if (pending) dispatch(pending);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ChatHandOff | undefined;
      if (detail) dispatch(detail);
    };
    window.addEventListener(HANDOFF_EVENT, handler);
    return () => window.removeEventListener(HANDOFF_EVENT, handler);
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
            // ask: keep talking or typing, then hit send deliberately. With
            // photos in the tray the same holds: what he says is their
            // caption, and sending it alone would leave the photos behind.
            const spoken = body.text.trim();
            const { draft: typed, shots: waiting } = composing.current;
            if (typed.trim() || waiting > 0) {
              setDraft((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
            } else {
              // empty composer → the classic flow: speak and it sends
              sendRef.current?.(spoken, "voice");
            }
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

  // ——— photos ———
  const onPhotosPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same photo be picked again
    if (files.length === 0) return;
    const { accept, dropped } = roomFor(composing.current.shots, files.length);
    if (dropped > 0) {
      toast.error(`Up to ${MAX_SHOTS} photos per message — kept the first ${accept}.`);
    }
    if (accept === 0) return;
    setReadingShots(true);
    try {
      const next = await filesToShots(files.slice(0, accept));
      setShots((prev) => [...prev, ...next].slice(0, MAX_SHOTS));
      haptic("light");
    } catch {
      toast.error("Couldn't read that photo.");
    } finally {
      setReadingShots(false);
    }
  };

  /** Send what is in the composer: the words, and every photo in the tray. */
  const sendComposer = async () => {
    if (busy || readingShots) return;
    if (shots.length === 0) {
      send(draft, "text");
      return;
    }
    const fitted = await fitPayloadBudget(shots).catch(() => shots);
    // Hand over first, clear after: the tray only empties once the message
    // has actually been taken.
    send(draft, "photo", {
      images: fitted.map((shot) => shot.full),
      thumbs: fitted.map((shot) => shot.thumb),
    });
    setShots([]);
  };

  // ——— proposal actions ———
  const resolvedNow = useRef(new Set<string>());
  const resolveCard = async (id: string, status: "saved" | "rejected") => {
    resolvedNow.current.add(id);
    if (status === "rejected") haptic("soft");
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
            ...(typeof data.packKg === "number" ? { packKg: data.packKg } : {}),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Edit failed");
        followUp = Array.isArray(data.exercises)
          ? "Structured — the session now carries what you actually did, measured against the recording. PRs checked."
          : typeof data.packKg === "number" && !data.match && !data.assignments
            ? `Pack recorded — ${data.packKg} kg carried.`
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
      } else if (kind === "trail") {
        const res = await fetch("/api/health/trails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name, workoutId: data.workoutId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        followUp = body.created
          ? `${String(body.trail?.name ?? data.name)} saved — the watch lists it under Saved trails now.`
          : `Linked to ${String(body.trail?.name ?? data.name)} — repeat runs compare from here.`;
      } else if (kind === "plan_week") {
        const res = await fetch("/api/health/planner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            days: data.days,
            replaceWeek: data.replaceWeek === true,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        const created = Number(body.created ?? 0);
        const reminders = Number(body.remindersCreated ?? 0);
        followUp = `${created} day${created === 1 ? "" : "s"} planned${
          reminders ? ` · ${reminders} reminder${reminders === 1 ? "" : "s"} set` : ""
        } — the week strip on Train has it, and the 7am nudge knows.`;
      } else if (kind === "reminder") {
        const res = await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            remindAt: data.remindAt,
            url: "/dashboard",
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Save failed");
        followUp = `Reminder set — ${new Date(String(data.remindAt)).toLocaleString("en-US", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}.`;
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
      haptic("success");
      if (followUp) {
        const followId = `f-${Date.now()}`;
        fresh.current.add(followId);
        setMessages((prev) => [
          ...prev,
          { id: followId, role: "assistant", content: followUp },
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
        style={fresh.current.has(msg.id) ? { animation: "fadeUp .45s ease both" } : undefined}
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
                  {/* v4: fold-matched against saved usuals server-side */}
                  {(() => {
                    const raw = (data.items as { usual?: { foodDescription: string } }[])?.[i];
                    return raw?.usual ? (
                      <p className="mt-0.5 text-[10.5px] font-semibold text-[#3E7A54]">
                        ≈ your usual · {raw.usual.foodDescription}
                      </p>
                    ) : null;
                  })()}
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

          {kind === "trail" && (
            <div className="py-2">
              <p
                className="text-[15px] font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {String(data.name ?? "Trail")}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8C2F51]">
                names {String(data.label ?? "the workout")}
              </p>
            </div>
          )}

          {kind === "plan_week" && Array.isArray(data.days) && (
            <div className="py-1">
              {(data.days as Array<{
                date?: string;
                title?: string;
                routineName?: string;
                trailName?: string;
                targetWeightKg?: number;
                reminders?: Array<{ atLocal?: string; title?: string }>;
              }>).map((d, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between border-b border-muted py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {String(d.title ?? "")}
                      {d.targetWeightKg ? ` · ${d.targetWeightKg} kg` : ""}
                    </p>
                    {(d.routineName || d.trailName) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.routineName ?? d.trailName}
                      </p>
                    )}
                    {Array.isArray(d.reminders) && d.reminders.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-[#8C2F51]">
                        {d.reminders
                          .map((r) =>
                            `${String(r.atLocal ?? "").slice(11)} ${String(r.title ?? "")}`.trim()
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                    {weekdayLabel(String(d.date ?? ""))}
                  </span>
                </div>
              ))}
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
                        .join(" · ") ||
                      (typeof data.packKg === "number" ? `pack ${data.packKg} kg` : "")}
                </>
              )}
              {typeof data.packKg === "number" &&
                Boolean(data.exercises || data.match || data.assignments) && (
                  <div className="mt-1 text-[12.5px] text-secondary-foreground">
                    pack · {String(data.packKg)} kg carried
                  </div>
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
              ) : kind === "reminder" ? (
                <>
                  Remind you:{" "}
                  <span className="font-semibold">{String(data.title ?? "…")}</span>
                  {fmtWhen(data.remindAt) ? ` · ${fmtWhen(data.remindAt)}` : ""}
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
              className="tap-scale flex-[1.4] rounded-[10px] bg-primary py-[11px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
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
                className="tap-scale flex-1 rounded-[10px] border border-[#D9D7DC] py-[11px] text-[13px] font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {editing ? "Done" : "Edit"}
              </button>
            )}
            {/* v4: single-item card matching a saved usual — the zero-drift
                path: log the usual's exact macros, discard the estimate */}
            {kind === "food" &&
              items.length === 1 &&
              (() => {
                const usual = (data.items as { usual?: Record<string, unknown> }[])?.[0]?.usual;
                if (!usual) return null;
                return (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/health/favorites", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ...usual,
                            logNow: true,
                            loggedAt: (data.items as { loggedAt?: string }[])?.[0]?.loggedAt,
                          }),
                        });
                        if (!res.ok) throw new Error();
                        await resolveCard(msg.id, "rejected");
                        toast.success("Logged your usual — exact saved macros");
                      } catch {
                        toast.error("Couldn't log the usual");
                      }
                    }}
                    className="flex-1 rounded-[10px] border border-[#BFDCC9] bg-[#EAF3ED] py-[11px] text-[13px] font-semibold text-[#3E7A54]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Log usual
                  </button>
                );
              })()}
            <button
              onClick={() => resolveCard(msg.id, "rejected")}
              className="tap-scale flex-1 rounded-[10px] border border-border py-[11px] text-[13px] font-semibold text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Reject
            </button>
          </div>
        )}
        {/* design: the verdict strip arrives with fadeUp .35s — but only
            when HE just decided it, not for every old card in the thread */}
        {status === "saved" && (
          <div
            className="bg-[#EAF3ED] px-3.5 py-3 text-[13px] font-semibold text-[#3E7A54]"
            style={resolvedNow.current.has(msg.id) ? { animation: "fadeUp .35s ease both" } : undefined}
          >
            <span className={resolvedNow.current.has(msg.id) ? "saved-check" : undefined}>✓</span>{" "}
            Saved · {fmtTime(msg.createdAt)}
          </div>
        )}
        {status === "rejected" && (
          <div
            className="bg-background px-3.5 py-3 text-[13px] font-semibold text-muted-foreground"
            style={resolvedNow.current.has(msg.id) ? { animation: "fadeUp .35s ease both" } : undefined}
          >
            Discarded. Nothing saved.
          </div>
        )}
      </div>
    );
  };

  const hasPhotos = shots.length > 0;
  // photos alone are a message — the words are optional
  const canSend = draft.trim().length > 0 || hasPhotos;
  const showLive = busy && (filter === "all" || filter === "chat");

  return (
    <div
      data-chat-frame
      className="max-lg:vv-frame flex flex-col bg-background lg:h-[calc(100dvh-2rem)] lg:max-w-2xl"
    >
      <header className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] lg:px-0 lg:pt-8">
        {/* While he types there is half a screen left; the label and the
            lenses step aside for the thread and come back with the keyboard. */}
        <div className="flex items-start gap-3">
          {/* ☰ — the shelf of every chat. The button is the design's round
              header control (36px, white, hairline); the glyph is not in
              the design's icon set, so it is three plain strokes in the
              set's weight (undesigned element). */}
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setDrawerOpen(true);
            }}
            aria-label="Chat history"
            className="tap-scale mt-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white text-[#232227]"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="micro-label [html[data-keyboard=open]_&]:hidden">
              The notebook that talks back
            </p>
            <h1
              className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Chat
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic("light");
              startNewChat();
            }}
            disabled={busy || (!conversation && messages.length === 0)}
            aria-label="Start a new chat"
            className="tap-scale mt-2 flex-none rounded-full bg-accent px-[13px] py-[7px] text-[11.5px] font-semibold text-[#8C2F51] transition-opacity disabled:opacity-40"
            style={{ fontFamily: "var(--font-display)" }}
          >
            + New
          </button>
        </div>

        {/* This chat's name — the app's until he changes it. */}
        <div className="mt-1.5 flex min-h-[26px] items-center">
          {renaming && conversation ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                commitTitle();
              }}
            >
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                }}
                maxLength={80}
                enterKeyHint="done"
                aria-label="Chat title"
                className="min-w-0 flex-1 rounded-[9px] border border-[#DCA8BE] bg-white px-2.5 py-[5px] font-semibold text-foreground outline-none"
                style={{ fontSize: "13px" }}
              />
            </form>
          ) : conversation ? (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(conversation.title);
                setRenaming(true);
              }}
              aria-label={`Rename this chat — ${conversation.title}`}
              className="flex min-w-0 max-w-full items-center gap-1.5 text-left text-[12.5px] font-semibold text-secondary-foreground"
            >
              <span key={conversation.title} className="fade-up truncate">
                {conversation.title || "Untitled chat"}
              </span>
              <JournalIcon size={12} className="flex-none text-[#B9B7BE]" />
            </button>
          ) : (
            <span className="text-[12.5px] font-semibold text-muted-foreground">
              {loaded ? "New chat" : "\u00a0"}
            </span>
          )}
        </div>

        {/* Quick filters — read the thread as a food log, a usuals shelf, a
            weight history, or just the conversation. */}
        <div className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 [html[data-keyboard=open]_&]:hidden">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? messages.length
                : messages.filter((m) => matchesFilter(m, f.key)).length;
            return (
              <button
                key={f.key}
                onClick={() => {
                  haptic("selection");
                  setFilter(f.key);
                }}
                className={`tap-scale shrink-0 rounded-full px-3 py-[6px] text-[12px] font-semibold transition-colors duration-200 ${
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
      </header>

      {/* The thread — its own scroller, so "the bottom" is simply its end. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          className="chat-scroller absolute inset-0 overflow-y-auto overscroll-contain px-4 lg:px-0"
        >
          <div ref={contentRef}>
          <div
            key={conversation?.id ?? "new"}
            className="thread-in flex flex-col gap-3 pb-3 pt-3.5"
          >
            {filter !== "all" && visibleMessages.length === 0 && (
              <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] text-muted-foreground">
                Nothing filed under{" "}
                <span className="font-semibold">
                  {FILTERS.find((f) => f.key === filter)?.label}
                </span>{" "}
                yet.
              </div>
            )}
            {loaded && messages.length === 0 && !busy && (
              <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
                Say it or type it — &ldquo;log lunch&rdquo;, &ldquo;what&apos;s my
                swing PR?&rdquo;, &ldquo;change the rice to 2 cups&rdquo;. Tap the{" "}
                <span className="font-semibold text-[#8C2F51]">mic</span> and just
                talk.
              </div>
            )}
            {/* A new chat is a clean page, not a lost one: name the chat it
                follows and offer the way back into it. */}
            {loaded && messages.length === 0 && !busy && passedOver && (
              <p className="fade-up text-center text-[11.5px] leading-relaxed text-muted-foreground">
                New chat. Your last one —{" "}
                <button
                  type="button"
                  onClick={() => openChat(passedOver)}
                  className="font-semibold text-[#8C2F51] underline-offset-2 active:underline"
                >
                  {passedOver.title || "untitled"}
                </button>{" "}
                — is in history, along with everything you&apos;ve logged.
              </p>
            )}

            {visibleMessages.map((msg) => {
              if (msg.role === "proposal") return renderProposal(msg);
              const arrived = fresh.current.has(msg.id);
              if (msg.role === "user") {
                const thumbs = msg.meta?.thumbs ?? [];
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[300px] self-end ${arrived ? "msg-in-right" : ""}`}
                  >
                    {thumbs.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                        {thumbs.map((src, i) => (
                          // Fixed 74×74 boxes: a photo that decodes late can
                          // change nothing about the thread's height.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt=""
                            width={74}
                            height={74}
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
                  className={`max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground ${
                    arrived ? "msg-in-left" : ""
                  }`}
                >
                  {msg.content}
                </div>
              );
            })}

            {/* Live turn — ONE bubble from first dot to last word. It used to
                be two elements (dots, then text) that each replayed their
                entrance, so every reply began with a blink. Hidden under a
                filter this reply won't match, so the lens stays honest. */}
            {showLive && (
              <div
                key="live"
                className="msg-in-left max-w-[310px] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-[5px] border border-border bg-card px-3.5 py-[11px] text-sm leading-relaxed text-foreground"
              >
                {streamText ? (
                  <>
                    {streamText}
                    <span className="stream-caret ml-[2px] inline-block h-[13px] w-[2px] translate-y-[2px] rounded-full bg-[#A63D63]" />
                  </>
                ) : (
                  <span className="flex items-center gap-2 py-[2px]">
                    <TypingDots />
                    {toolLine && (
                      <span className="fade-up text-[11.5px] text-muted-foreground">
                        {toolLine}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* He scrolled up to read: nothing yanks him back. This is the way
            down, and it says so when something new has arrived. */}
        <button
          type="button"
          onClick={() => {
            haptic("selection");
            jumpToLatest();
          }}
          aria-label={unseen ? "New messages — jump to latest" : "Jump to latest"}
          aria-hidden={pinned}
          tabIndex={pinned ? -1 : 0}
          className={`jump-latest absolute bottom-2.5 left-1/2 flex items-center gap-1.5 rounded-full border border-border bg-card py-[7px] pl-3 pr-3.5 text-[11.5px] font-semibold text-[#8C2F51] shadow-[0_6px_18px_rgba(35,34,39,0.14)] ${
            pinned ? "jump-latest-hidden" : ""
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          {unseen ? "New below" : "Latest"}
          {unseen && <span className="unseen-dot h-[6px] w-[6px] rounded-full bg-primary" />}
        </button>
      </div>

      {/* Composer zone — clears the tab bar when the keyboard is down, sits
          directly on the keys when it is up (the tab bar hides itself). */}
      <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] pt-1.5 lg:px-0 lg:pb-4 [html[data-keyboard=open]_&]:pb-2">
        {/* Listening strip — the state is readable without hunting for a
            colour change on the button. The bars ride the real input level:
            silence = flat, speech = moving. */}
        {(recording || transcribing) && (
          <div className="mb-2 flex justify-center">
            <div className="fade-up flex items-center gap-2 rounded-full bg-[#A63D63] px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(166,61,99,0.35)]">
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
          </div>
        )}

        {/* Hidden pickers. No `capture` on the first: iOS then offers its own
            Photo Library / Take Photo menu, which is the fastest honest way
            to give both from one button. */}
        <input
          ref={anySourceRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPhotosPicked}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhotosPicked}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPhotosPicked}
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendComposer();
          }}
          className="composer rounded-[26px] border border-border bg-card py-2 pl-2 pr-2 shadow-[0_6px_20px_rgba(35,34,39,0.08)]"
        >
          {/* The tray opens INSIDE the composer, above the input, so the
              photos, the words and Send read as one message being built.
              grid 0fr→1fr: the height animates without anyone measuring it. */}
          <div
            className="tray-reveal"
            data-open={hasPhotos || readingShots ? "true" : "false"}
            aria-hidden={!(hasPhotos || readingShots)}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="px-1.5 pb-2">
                <PhotoTray
                  shots={shots}
                  busy={readingShots}
                  size={60}
                  layout="row"
                  onRemove={(id) => setShots((prev) => prev.filter((shot) => shot.id !== id))}
                  onAddCamera={() => cameraRef.current?.click()}
                  onAddLibrary={() => libraryRef.current?.click()}
                />
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => {
              haptic("light");
              anySourceRef.current?.click();
            }}
            disabled={busy || readingShots || shots.length >= MAX_SHOTS}
            aria-label={hasPhotos ? "Add a photo" : "Attach a photo"}
            className="tap-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8C2F51] transition-colors active:bg-accent disabled:opacity-40"
          >
            <CameraIcon size={19} />
          </button>
          <textarea
            ref={draftRef}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Return sends; Shift+Return is a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendComposer();
              }
            }}
            enterKeyHint="send"
            placeholder={
              transcribing
                ? "Transcribing…"
                : hasPhotos
                  ? "Add a note, or just send…"
                  : "Type, or tap the mic…"
            }
            disabled={busy}
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-[7px] leading-[1.4] text-foreground outline-none placeholder:text-muted-foreground"
            style={{ fontSize: "13.5px", maxHeight: 132 }}
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
              onClick={() => {
                haptic(recording ? "light" : "medium");
                if (recording) recorderRef.current?.stop();
                else startVoice();
              }}
              disabled={busy || transcribing}
              aria-label={recording ? "Stop recording" : "Start voice input"}
              aria-pressed={recording}
              className={`tap-scale relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                recording ? "mic-halo" : ""
              }`}
              style={{ background: recording ? "#A63D63" : "#F6E3EB" }}
            >
              {transcribing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#8C2F51] border-t-transparent" />
              ) : (
                <MicIcon size={16} color={recording ? "#FFFFFF" : "#8C2F51"} />
              )}
            </button>
          </div>
          {/* Always mounted: it grows in and out beside the mic instead of
              popping the row wider the moment there is a first letter. */}
          <button
            type="submit"
            disabled={busy || readingShots || !canSend}
            aria-label={hasPhotos ? `Send ${shots.length} photo${shots.length === 1 ? "" : "s"}` : "Send"}
            aria-hidden={!canSend}
            tabIndex={canSend ? 0 : -1}
            className={`send-button flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary ${
              canSend ? "send-button-on" : ""
            }`}
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
          </div>
        </form>
      </div>

      <ChatHistoryDrawer
        open={drawerOpen}
        activeId={conversation?.id ?? null}
        version={shelfVersion}
        onClose={() => setDrawerOpen(false)}
        onOpenChat={(target) => {
          if (busy) {
            toast("Let this reply finish first.");
            return;
          }
          openChat(target);
        }}
        onNewChat={startNewChat}
        onRenamed={(renamed) => {
          if (conversationRef.current?.id === renamed.id) applyConversation(renamed);
        }}
      />
    </div>
  );
}
