"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  Check,
  X,
  MessageSquare,
  Pencil,
  RotateCcw,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraIcon, ChatBubbleIcon, MicIcon } from "@/components/pitaya-icons";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import { deactivateMicrophoneStream, getOrCreateMicrophoneStream } from "@/lib/microphone";

// One capture = up to this many photos (plate + label + receipt…).
const MAX_SHOTS = 6;

interface VoiceInputProps {
  onDataLogged?: () => void;
}

interface FoodItem {
  mealType: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes?: string;
  loggedAt?: string;
}

interface AIResponse {
  type: "food" | "measurement" | "workout" | "water" | "todo" | "reminder" | "general";
  message: string;
  data?: unknown;
  items?: FoodItem[];
  measurement?: {
    measuredAt?: string | null;
    weightKg?: number;
    bodyFatPct?: number;
    waistCm?: number;
    chestCm?: number;
    armsCm?: number;
    legsCm?: number;
    hipsCm?: number;
    shouldersCm?: number;
    neckCm?: number;
    forearmsCm?: number;
    calvesCm?: number;
    notes?: string;
  };
  workout?: {
    workoutType: string;
    durationMinutes: number;
    description?: string;
    caloriesBurned?: number;
    startedAt?: string | null;
    exercises?: Array<{
      name: string;
      sets?: number;
      reps?: number;
      weightKg?: number;
    }>;
  };
  water?: {
    glasses: number;
    amountMl: number;
  };
  todo?: {
    action: "add" | "complete";
    title: string;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: string;
  };
  todos?: Array<{
    action: "add" | "complete";
    title: string;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: string;
  }>;
  reminder?: {
    id: string;
    title: string;
    remindAt: string;
  };
}

export function VoiceInput({ onDataLogged }: VoiceInputProps) {
  const floatingBottomClass = "bottom-[calc(env(safe-area-inset-bottom,0px)+7.25rem)]";
  const router = useRouter();
  const pathname = usePathname();
  const onChatScreen = pathname === "/chat";

  // Voice and text from the dock land in the chat thread (2b fold) — the
  // conversational proposal cards replace the dock's old review UI, and
  // follow-ups ("make it two eggs") work by just talking again.
  const handOffToChat = useCallback(
    (
      text: string,
      source: "text" | "voice" | "photo",
      photos?: { images: string[]; thumbs: string[] }
    ) => {
      const detail = { text, source, ...(photos ? { photos } : {}) };
      if (onChatScreen) {
        window.dispatchEvent(new CustomEvent("pitaya:chat-send", { detail }));
      } else {
        sessionStorage.setItem("pitaya:pending-chat", JSON.stringify(detail));
        router.push("/chat");
      }
    },
    [onChatScreen, router]
  );

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);

  // v4 (2026-08-29, his pick): the idle pill hides on scroll-down and
  // returns on ANY scroll-up (or near the top) — every page's last element
  // becomes reachable ("Delete this workout" sat under the mic). No
  // idle-timer return: it would re-cover the exact thing being read. Active
  // states (recording/confirm/edit) pin the dock visible below.
  const [scrolledAway, setScrolledAway] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y < 50) setScrolledAway(false);
        else if (delta > 12) setScrolledAway(true);
        else if (delta < -4) setScrolledAway(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<FoodItem | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureShots, setCaptureShots] = useState<{ full: string; thumb: string }[]>([]);
  const [captureNote, setCaptureNote] = useState("");
  const libraryInputRef = useRef<HTMLInputElement>(null);
  // While the capture sheet is open, dictation fills its note instead of
  // sending a standalone chat message.
  const captureOpenRef = useRef(false);
  captureOpenRef.current = captureOpen;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Rolling conversation memory so follow-ups work ("actually make that 2 eggs").
  // Sent to the chat API with every message; capped there to the last 12 turns.
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const activeMimeRef = useRef<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();
      streamRef.current = stream;

      // Find the best supported audio format — prefer webm (Chrome/Firefox),
      // fall back to mp4 (Safari), then browser default
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
      ];
      const mimeType =
        candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";

      console.log("[VoiceInput] Selected MIME type:", mimeType || "(browser default)");

      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;
      activeMimeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio level monitoring
        cancelAnimationFrame(animFrameRef.current);
        audioContextRef.current?.close();
        audioContextRef.current = null;
        setAudioLevel(0);

        const usedMime = activeMimeRef.current || mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: usedMime });
        // Keep permission alive for later recordings, but disable idle capture
        deactivateMicrophoneStream();
        streamRef.current = null;

        console.log(`[VoiceInput] Recording done: ${blob.size} bytes, type: ${usedMime}, chunks: ${chunksRef.current.length}`);

        if (blob.size === 0) {
          toast.error("No audio was captured. Please check your microphone permissions.");
          return;
        }

        // Determine the correct file extension for Whisper
        let ext = "webm";
        if (usedMime.includes("mp4") || usedMime.includes("m4a")) ext = "mp4";
        else if (usedMime.includes("ogg")) ext = "ogg";
        else if (usedMime.includes("wav")) ext = "wav";

        await processAudio(blob, ext);
      };

      // Set up audio level monitoring with Web Audio API
      try {
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const monitorLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          // Average of first 20 bins (voice frequencies)
          let sum = 0;
          const bins = Math.min(20, dataArray.length);
          for (let i = 0; i < bins; i++) sum += dataArray[i];
          const avg = sum / bins / 255; // 0..1
          setAudioLevel(avg);
          animFrameRef.current = requestAnimationFrame(monitorLevel);
        };
        monitorLevel();
      } catch {
        // Audio level monitoring is optional — recording still works without it
        console.warn("[VoiceInput] Could not set up audio level monitoring");
      }

      mediaRecorder.start(250); // Get data chunks every 250ms for reliability
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error("Microphone access denied. Please allow microphone access.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Step 1: Transcribe audio → show text for review
  const processAudio = async (audioBlob: Blob, ext: string = "webm") => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${ext}`);

      const transcribeRes = await fetch("/api/ai/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}));
        throw new Error(errData.error || "Transcription failed");
      }
      const { text } = await transcribeRes.json();

      if (!text || text.trim() === "") {
        toast.error("Could not understand the audio. Please try again.");
        setIsTranscribing(false);
        return;
      }

      setLastFailedText(null);
      setIsTranscribing(false);

      // Into the chat thread — proposals render there, follow-ups by voice.
      if (captureOpenRef.current) {
        setCaptureNote((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
      } else {
        handOffToChat(text.trim(), "voice");
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      const msg = error instanceof Error ? error.message : "Failed to transcribe audio";
      toast.error(msg.includes("format") ? msg : `${msg}. Try typing your message instead.`);
      // Show text input so user can type instead
      setShowTextInput(true);
      setIsTranscribing(false);
    }
  };

  // The legacy /api/ai/chat review flow now serves ONLY the camera path
  // (photo → analyze → confirm card); voice and text go through the chat
  // thread via handOffToChat.

  // ── Photo handling ──────────────────────────────────────────────────
  const compressImage = useCallback(
    (file: File, maxWidth = 1024, quality = 0.8): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas not supported"));
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality));
          };
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      }),
    []
  );

  // Capture sheet (2026-08-12): photos — camera OR library, several at a
  // time — plus typed/spoken context, handed to the chat thread as ONE
  // message so the AI can propose every action it implies (log the meal,
  // save the product, …), each confirmed on its own card. Replaces the
  // legacy photo→analyze→dock-card path.
  const handleShotsSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = ""; // let the same file be picked again
      if (files.length === 0) return;

      setIsAnalyzingPhoto(true);
      try {
        const room = MAX_SHOTS - captureShots.length;
        if (files.length > room) {
          toast.error(`Up to ${MAX_SHOTS} photos per capture.`);
        }
        const shots = await Promise.all(
          files.slice(0, Math.max(0, room)).map(async (file) => ({
            full: await compressImage(file, 1024, 0.8),
            thumb: await compressImage(file, 220, 0.5),
          }))
        );
        setCaptureShots((prev) => [...prev, ...shots]);
        setCaptureOpen(true);
      } catch (error) {
        console.error("Photo read failed:", error);
        toast.error("Couldn't read that photo.");
      } finally {
        setIsAnalyzingPhoto(false);
      }
    },
    [compressImage, captureShots.length]
  );

  const sendCapture = useCallback(() => {
    if (captureShots.length === 0) return;
    const payload = {
      images: captureShots.map((s) => s.full),
      thumbs: captureShots.map((s) => s.thumb),
    };
    const note = captureNote.trim();
    setCaptureOpen(false);
    setCaptureShots([]);
    setCaptureNote("");
    handOffToChat(note, "photo", payload);
  }, [captureShots, captureNote, handOffToChat]);

  const handleEditItem = (index: number) => {
    if (aiResponse?.items) {
      setEditingIndex(index);
      setEditValues({ ...aiResponse.items[index] });
    }
  };

  const handleSaveEdit = () => {
    if (aiResponse?.items && editingIndex !== null && editValues) {
      const newItems = [...aiResponse.items];
      newItems[editingIndex] = editValues;
      setAiResponse({ ...aiResponse, items: newItems });
      setEditingIndex(null);
      setEditValues(null);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (aiResponse?.items) {
      const newItems = aiResponse.items.filter((_, i) => i !== index);
      if (newItems.length === 0) {
        handleReject();
      } else {
        setAiResponse({ ...aiResponse, items: newItems });
      }
    }
  };

  const handleConfirm = async () => {
    if (!aiResponse) return;
    setIsProcessing(true);

    try {
      let endpoint = "";
      let body: unknown;

      switch (aiResponse.type) {
        case "food":
          endpoint = "/api/health/food/batch";
          body = { items: aiResponse.items, loggedAt: new Date().toISOString() };
          break;
        case "measurement":
          endpoint = "/api/health/body";
          body = aiResponse.measurement;
          break;
        case "workout":
          endpoint = "/api/health/workouts";
          body = aiResponse.workout;
          break;
        case "water":
          // Log water — one batched request, however many glasses
          if (aiResponse.water) {
            const glassCount = aiResponse.water.glasses || 1;
            const mlPerGlass = Math.round(aiResponse.water.amountMl / glassCount);
            await fetch("/api/health/water", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amountMl: mlPerGlass, glasses: glassCount }),
            });
            toast.success("Water logged!");
            onDataLogged?.();
            setIsProcessing(false);
            setShowConfirmation(false);
            setAiResponse(null);
            setTextInput("");
            setLastFailedText(null);
            return;
          }
          break;
        case "reminder": {
          // Reminder was already created by the AI chat endpoint, just confirm
          toast.success("Reminder set!");
          // Request notification permission if not already granted
          if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
          }
          onDataLogged?.();
          setIsProcessing(false);
          setShowConfirmation(false);
          setAiResponse(null);
          setTextInput("");
          setLastFailedText(null);
          return;
        }
        case "todo": {
          const todoItems = aiResponse.todos || (aiResponse.todo ? [aiResponse.todo] : []);
          if (todoItems.length > 0 && todoItems[0].action === "add") {
            // Create all todos
            for (const item of todoItems) {
              // Build proper due date with time
              let dueDateValue: string | null = null;
              if (item.dueDate) {
                if (item.dueTime) {
                  // Combine date + time as local datetime
                  dueDateValue = `${item.dueDate}T${item.dueTime}:00`;
                } else {
                  // Date only — set to noon local to avoid timezone shifting
                  dueDateValue = `${item.dueDate}T12:00:00`;
                }
              }
              const res = await fetch("/api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: item.title,
                  dueDate: dueDateValue,
                  priority: item.priority || "normal",
                }),
              });
              if (!res.ok) {
                toast.error(`Failed to add: ${item.title}`);
              }
            }
            toast.success(`${todoItems.length} task${todoItems.length > 1 ? "s" : ""} added!`);
            onDataLogged?.();
          } else if (todoItems.length > 0 && todoItems[0].action === "complete") {
            endpoint = "/api/todos/complete-by-title";
            body = { title: todoItems[0].title };
          }
          break;
        }
      }

      if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          toast.success("Logged successfully!");
          onDataLogged?.();
        } else {
          toast.error("Failed to save data.");
        }
      }
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save data.");
    } finally {
      setIsProcessing(false);
      setShowConfirmation(false);
      setAiResponse(null);
      setEditingIndex(null);
      setEditValues(null);
      setTextInput("");
      setLastFailedText(null);
    }
  };

  const handleReject = () => {
    setShowConfirmation(false);
    setAiResponse(null);
    setEditingIndex(null);
    setEditValues(null);
    toast.info("Cancelled.");
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput("");
    setShowTextInput(false);
    handOffToChat(text, "text");
  };

  const handleRetry = async () => {
    const text = lastFailedText || textInput.trim();
    if (text) handOffToChat(text, "text");
  };

  // Editing overlay for a food item
  if (editingIndex !== null && editValues) {
    return (
      <div className={cn("fixed left-0 right-0 px-4 z-[60]", floatingBottomClass)}>
        <Card className="floating-action-dock max-w-lg mx-auto rounded-[28px] border-white/10 bg-[rgba(17,20,24,0.92)] shadow-2xl">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Edit Item
            </p>
            <Input
              value={editValues.foodDescription}
              onChange={(e) =>
                setEditValues({ ...editValues, foodDescription: e.target.value })
              }
              className="text-sm"
              placeholder="Food description"
            />
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Cal</label>
                <Input
                  type="number"
                  value={editValues.calories}
                  onChange={(e) =>
                    setEditValues({
                      ...editValues,
                      calories: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm h-8"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Protein</label>
                <Input
                  type="number"
                  value={editValues.proteinG}
                  onChange={(e) =>
                    setEditValues({
                      ...editValues,
                      proteinG: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm h-8"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Carbs</label>
                <Input
                  type="number"
                  value={editValues.carbsG}
                  onChange={(e) =>
                    setEditValues({
                      ...editValues,
                      carbsG: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm h-8"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Fat</label>
                <Input
                  type="number"
                  value={editValues.fatG}
                  onChange={(e) =>
                    setEditValues({
                      ...editValues,
                      fatG: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm h-8"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} size="sm" className="flex-1">
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button
                onClick={() => {
                  setEditingIndex(null);
                  setEditValues(null);
                }}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirmation card
  if (showConfirmation && aiResponse) {
    const totalCal =
      aiResponse.items?.reduce((sum, item) => sum + item.calories, 0) || 0;

    return (
      <div className={cn("fixed left-0 right-0 px-4 z-[60]", floatingBottomClass)}>
        <Card className="floating-action-dock max-w-lg mx-auto rounded-[28px] border-white/10 bg-[rgba(17,20,24,0.92)] shadow-2xl backdrop-blur-sm">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm leading-relaxed">{aiResponse.message}</p>

            {/* Food items - editable */}
            {aiResponse.type === "food" && aiResponse.items && (
              <div className="space-y-1.5">
                {aiResponse.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs bg-secondary/50 rounded-lg px-3 py-2 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {item.foodDescription}
                      </p>
                      <p className="text-muted-foreground">
                        P:{Math.round(item.proteinG)}g C:{Math.round(item.carbsG)}g F:{Math.round(item.fatG)}g
                      </p>
                    </div>
                    <span className="font-bold text-sm whitespace-nowrap">
                      {Math.round(item.calories)}
                    </span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => handleEditItem(i)}
                        className="p-1 rounded hover:bg-background/50 transition-colors"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(i)}
                        className="p-1 rounded hover:bg-background/50 transition-colors"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 pt-1 text-xs font-semibold">
                  <span>Total</span>
                  <span>{Math.round(totalCal)} cal</span>
                </div>
              </div>
            )}

            {/* Measurement preview */}
            {aiResponse.type === "measurement" && aiResponse.measurement && (
              <div className="flex flex-wrap gap-2 text-xs">
                {aiResponse.measurement.weightKg && (
                  <span className="bg-blue-500/20 text-blue-400 rounded-lg px-3 py-1.5 font-medium">
                    {aiResponse.measurement.weightKg} kg
                  </span>
                )}
                {aiResponse.measurement.bodyFatPct && (
                  <span className="rounded-lg bg-cyan-500/20 px-3 py-1.5 font-medium text-cyan-300">
                    {aiResponse.measurement.bodyFatPct}% body fat
                  </span>
                )}
                {aiResponse.measurement.waistCm && (
                  <span className="bg-green-500/20 text-green-400 rounded-lg px-3 py-1.5 font-medium">
                    {aiResponse.measurement.waistCm} cm waist
                  </span>
                )}
              </div>
            )}

            {/* Workout preview */}
            {aiResponse.type === "workout" && aiResponse.workout && (
              <div className="space-y-1 rounded-lg bg-cyan-500/10 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="capitalize font-medium">
                    {aiResponse.workout.workoutType}
                  </span>
                  <span className="text-muted-foreground">
                    {aiResponse.workout.durationMinutes} min
                  </span>
                  {aiResponse.workout.caloriesBurned && (
                    <span className="text-orange-400 text-xs">
                      ~{Math.round(aiResponse.workout.caloriesBurned)} cal
                    </span>
                  )}
                </div>
                {aiResponse.workout.exercises &&
                  aiResponse.workout.exercises.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                      {aiResponse.workout.exercises.map((ex, i) => (
                        <p key={i}>
                          {ex.name}
                          {ex.sets ? ` — ${ex.sets}×${ex.reps || "?"}` : ""}
                          {ex.weightKg ? ` @ ${ex.weightKg}kg` : ""}
                        </p>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {/* Water preview */}
            {aiResponse.type === "water" && aiResponse.water && (
              <div className="bg-blue-500/10 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">💧 Log Water</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {aiResponse.water.glasses} glass{aiResponse.water.glasses !== 1 ? "es" : ""} ({aiResponse.water.amountMl}ml)
                </p>
              </div>
            )}

            {/* Todo preview */}
            {aiResponse.type === "todo" && (aiResponse.todos?.length || aiResponse.todo) && (
              <div className="bg-green-500/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">
                    {(aiResponse.todos?.[0] || aiResponse.todo)?.action === "add"
                      ? `📝 Add ${(aiResponse.todos?.length || 1)} Task${(aiResponse.todos?.length || 1) > 1 ? "s" : ""}`
                      : "✅ Complete Todo"}
                  </span>
                </div>
                {(aiResponse.todos || (aiResponse.todo ? [aiResponse.todo] : [])).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-green-400 mt-0.5">•</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        {item.dueDate && (
                          <span>📅 {item.dueDate}</span>
                        )}
                        {item.dueTime && (
                          <span>🕐 {item.dueTime}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reminder preview */}
            {aiResponse.type === "reminder" && aiResponse.reminder && (
              <div className="bg-amber-500/10 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">🔔 Reminder Set</span>
                </div>
                <p className="text-xs font-medium">{aiResponse.reminder.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  Will notify you at {new Date(aiResponse.reminder.remindAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleConfirm}
                size="sm"
                className="flex-1 h-10"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" /> Confirm
                  </>
                )}
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
                size="sm"
                className="flex-1 h-10"
              >
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The pill stays pinned while anything is in flight — hiding a live
  // recording or a mid-transcription state would read as data loss.
  const dockHidden =
    scrolledAway &&
    !isRecording &&
    !isTranscribing &&
    !isProcessing &&
    !showTextInput &&
    !lastFailedText;

  return (
    <div
      className={cn(
        "fixed left-0 right-0 px-4 z-[60] pointer-events-none transition-all duration-300 ease-out",
        floatingBottomClass,
        dockHidden && "translate-y-[240px] opacity-0"
      )}
      aria-hidden={dockHidden}
    >
      <div
        className={cn("max-w-lg mx-auto", dockHidden ? "pointer-events-none" : "pointer-events-auto")}
      >
        {/* Failed text recovery banner */}
        {lastFailedText && (
          <Card className="mb-3 rounded-[24px] border-red-500/30 bg-red-500/5 shadow-lg">
            <CardContent className="p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-red-400 font-medium mb-1">
                    AI failed — your text is saved:
                  </p>
                  <p className="text-xs text-foreground line-clamp-2">{lastFailedText}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={handleRetry}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Text input mode */}
        {showTextInput && (
          <Card className="floating-action-dock mb-3 rounded-[24px] border-white/10 bg-[rgba(17,20,24,0.9)] shadow-lg">
            <CardContent className="p-2.5 flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="I had chicken and rice for lunch..."
                className="flex-1 text-sm border-0 bg-transparent focus-visible:ring-0 px-2"
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                disabled={isProcessing || isTranscribing}
                autoFocus
              />
              <Button
                size="icon"
                className="h-9 w-9 rounded-full shrink-0"
                onClick={handleTextSubmit}
                disabled={isProcessing || isTranscribing || !textInput.trim()}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ——— Capture sheet: photos + context → one chat message ——— */}
        {captureOpen && (
          <>
            <div
              className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
              onClick={() => setCaptureOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-10 pt-6 sheet-up">
              <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
              <p
                className="text-xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Add photos
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A plate, a label, a receipt — several at once. Say or type what
                they are and the chat proposes each action.
              </p>

              {captureShots.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {captureShots.map((shot, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.thumb}
                        alt=""
                        className="h-[70px] w-[70px] rounded-[12px] border border-[#E9CFDC] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCaptureShots((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label="Remove photo"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#232227] text-[11px] leading-none text-white"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={captureShots.length >= MAX_SHOTS || isAnalyzingPhoto}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#D9D7DC] py-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <CameraIcon size={17} /> Take photo
                </button>
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={captureShots.length >= MAX_SHOTS || isAnalyzingPhoto}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#D9D7DC] py-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {/* No library glyph exists in the design — plain stroke
                      shape in the icon set's style (undesigned element). */}
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <path d="M3 16l4.5-4.5 4 4 3-3L21 17" />
                    <circle cx="9" cy="9.5" r="1.3" />
                  </svg>
                  Library
                </button>
              </div>

              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={captureNote}
                  onChange={(e) => setCaptureNote(e.target.value)}
                  rows={2}
                  placeholder={
                    isTranscribing
                      ? "Transcribing…"
                      : "e.g. I had 2.5 servings of this — save it as a usual"
                  }
                  className="min-h-[52px] flex-1 resize-none rounded-[12px] border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  aria-label="Dictate a note"
                  className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ background: isRecording ? "#A63D63" : "#F6E3EB" }}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#8C2F51]" />
                  ) : (
                    <MicIcon size={20} />
                  )}
                </button>
              </div>

              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setCaptureOpen(false);
                    setCaptureShots([]);
                    setCaptureNote("");
                  }}
                  className="flex-1 rounded-[12px] border border-[#D9D7DC] py-3 text-[13.5px] font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendCapture}
                  disabled={captureShots.length === 0 || isAnalyzingPhoto}
                  className="flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {isAnalyzingPhoto
                    ? "Reading…"
                    : captureShots.length > 0
                      ? `Send ${captureShots.length} photo${captureShots.length === 1 ? "" : "s"}`
                      : "Send"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Hidden inputs: camera (take one) and library (pick many) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleShotsSelected}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleShotsSelected}
        />

        {/* Main dock — design: floating pill, chat 46 · mic 54 raspberry · camera 46 */}
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card/95 p-[7px] shadow-[0_10px_30px_rgba(35,34,39,0.16)] backdrop-blur-xl">
          {/* Chat bubble → the Chat screen (design: dock chat active on it) */}
          <button
            type="button"
            onClick={() => {
              if (!onChatScreen) router.push("/chat");
            }}
            className={cn(
              "flex h-[46px] w-[46px] items-center justify-center rounded-full transition-all duration-200 hover:scale-105",
              onChatScreen
                ? "bg-primary text-primary-foreground"
                : "text-[#8C2F51] hover:bg-secondary"
            )}
          >
            <ChatBubbleIcon size={20} />
          </button>

          <div className="relative flex items-center justify-center">
            {/* Listening state. The old version swapped bg-primary for
                #8C2F51 — two near-identical maroons — behind a 20%-opacity
                ring, so "is it actually listening?" was a real question.
                Now: a breathing halo (constant, reads at a glance) with the
                real audio-level ring riding on top of it. */}
            {isRecording && (
              <div
                className="pointer-events-none absolute rounded-full bg-[#DC74A0]/40"
                style={{
                  width: `${60 + audioLevel * 46}px`,
                  height: `${60 + audioLevel * 46}px`,
                  opacity: 0.45 + audioLevel * 0.45,
                  transition: "width 90ms linear, height 90ms linear",
                }}
              />
            )}
            <button
              type="button"
              aria-label={isRecording ? "Stop recording" : "Start voice input"}
              aria-pressed={isRecording}
              className={cn(
                "relative z-10 flex h-[54px] w-[54px] items-center justify-center rounded-full transition-all duration-200 hover:scale-105",
                isRecording ? "mic-halo bg-[#8C2F51] ring-2 ring-white" : "bg-primary",
                (isProcessing || isTranscribing || isAnalyzingPhoto) && "opacity-60"
              )}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing || isTranscribing || isAnalyzingPhoto}
            >
              {isTranscribing || isProcessing ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
              ) : isRecording ? (
                <MicOff className="h-6 w-6 text-primary-foreground" />
              ) : (
                <MicIcon size={22} />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            disabled={isProcessing || isTranscribing || isRecording}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[#8C2F51] transition-all duration-200 hover:scale-105 hover:bg-secondary disabled:opacity-50"
          >
            {isAnalyzingPhoto ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <CameraIcon size={20} />
            )}
          </button>
        </div>

        {isRecording && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {/* Level bars, not a pulsing label: silence reads as flat, so a
                dead mic is visible instead of merely suspected. */}
            <span className="flex items-end gap-[2.5px]" aria-hidden>
              {[0.6, 1, 0.8, 0.45].map((scale, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-[#A63D63]"
                  style={{
                    height: `${4 + audioLevel * 13 * scale}px`,
                    transition: "height 80ms linear",
                  }}
                />
              ))}
            </span>
            <p className="text-xs font-semibold text-[#8C2F51]">
              Listening — tap to stop
            </p>
          </div>
        )}
        {isTranscribing && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            Transcribing your voice...
          </p>
        )}
        {isProcessing && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            Processing with AI...
          </p>
        )}
      </div>
    </div>
  );
}
