"use client";

import { useState, useRef, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";

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
}

interface AIResponse {
  type: "food" | "measurement" | "workout" | "water" | "todo" | "reminder" | "general";
  message: string;
  data?: unknown;
  items?: FoodItem[];
  measurement?: {
    weightKg?: number;
    bodyFatPct?: number;
    waistCm?: number;
    chestCm?: number;
    armsCm?: number;
    legsCm?: number;
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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<FoodItem | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeMimeRef = useRef<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        // Stop all tracks on the stream
        streamRef.current?.getTracks().forEach((track) => track.stop());
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

      // Show transcribed text in input for review before sending
      setTextInput(text.trim());
      setShowTextInput(true);
      setLastFailedText(null);
      setIsTranscribing(false);

      // Auto-send to AI (text is preserved in input if it fails)
      await processText(text.trim());
    } catch (error) {
      console.error("Transcription failed:", error);
      const msg = error instanceof Error ? error.message : "Failed to transcribe audio";
      toast.error(msg.includes("format") ? msg : `${msg}. Try typing your message instead.`);
      // Show text input so user can type instead
      setShowTextInput(true);
      setIsTranscribing(false);
    }
  };

  // Step 2: Send text to AI — if it fails, text stays in the input
  const processText = async (text: string) => {
    setIsProcessing(true);
    setLastFailedText(null);
    try {
      const settings = getSettings();
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          customInstructions: settings.aiInstructions?.health || "",
          aiLanguage: settings.aiLanguage || "english",
        }),
      });

      if (!chatRes.ok) throw new Error("AI processing failed");
      const response: AIResponse = await chatRes.json();

      setAiResponse(response);

      if (response.type === "general") {
        toast.info(response.message);
        setTextInput("");
        setIsProcessing(false);
      } else {
        setShowConfirmation(true);
        setTextInput("");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("AI processing failed:", error);
      // Keep text in the input so user can retry
      setLastFailedText(text);
      setTextInput(text);
      setShowTextInput(true);
      toast.error("AI failed to process — your text is saved. Edit or tap send to retry.");
      setIsProcessing(false);
    }
  };

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
          body = { items: aiResponse.items };
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
          // Log water: post one entry per glass
          if (aiResponse.water) {
            const glassCount = aiResponse.water.glasses || 1;
            const mlPerGlass = Math.round(aiResponse.water.amountMl / glassCount);
            for (let i = 0; i < glassCount; i++) {
              await fetch("/api/health/water", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amountMl: mlPerGlass }),
              });
            }
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
    // Don't clear text yet — keep it until AI succeeds
    await processText(text);
  };

  const handleRetry = async () => {
    if (lastFailedText) {
      await processText(lastFailedText);
    } else if (textInput.trim()) {
      await processText(textInput.trim());
    }
  };

  // Editing overlay for a food item
  if (editingIndex !== null && editValues) {
    return (
      <div className="fixed bottom-20 left-0 right-0 px-4 z-50">
        <Card className="max-w-lg mx-auto border-primary/50 shadow-2xl">
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
      <div className="fixed bottom-20 left-0 right-0 px-4 z-50">
        <Card className="max-w-lg mx-auto border-primary/30 shadow-2xl backdrop-blur-sm">
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
                  <span className="bg-purple-500/20 text-purple-400 rounded-lg px-3 py-1.5 font-medium">
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
              <div className="bg-purple-500/10 rounded-lg p-3 space-y-1">
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

  return (
    <div className="fixed bottom-20 left-0 right-0 px-4 z-50 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        {/* Failed text recovery banner */}
        {lastFailedText && (
          <Card className="mb-3 shadow-lg border-red-500/30 bg-red-500/5">
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
          <Card className="mb-3 shadow-lg border-border/50">
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

        {/* Main controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full border-border/50 shadow-md"
            onClick={() => setShowTextInput(!showTextInput)}
          >
            <MessageSquare
              className={cn("h-4 w-4", showTextInput && "text-primary")}
            />
          </Button>

          <div className="relative flex items-center justify-center">
            {/* Audio level ring — pulses with actual mic input */}
            {isRecording && (
              <div
                className="absolute rounded-full bg-red-500/20 transition-transform duration-100"
                style={{
                  width: `${64 + audioLevel * 48}px`,
                  height: `${64 + audioLevel * 48}px`,
                  opacity: 0.3 + audioLevel * 0.5,
                }}
              />
            )}
            <Button
              size="icon"
              className={cn(
                "h-16 w-16 rounded-full shadow-lg transition-all duration-200 relative z-10",
                isRecording
                  ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
                  : "bg-primary hover:bg-primary/90 shadow-primary/20",
                (isProcessing || isTranscribing) && "opacity-60"
              )}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing || isTranscribing}
            >
              {isTranscribing ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : isProcessing ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-7 w-7" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </Button>
          </div>

          <div className="w-11" />
        </div>

        {isRecording && (
          <p className="text-center text-xs text-red-400 mt-3 animate-pulse font-medium">
            Listening... Tap to stop
          </p>
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
