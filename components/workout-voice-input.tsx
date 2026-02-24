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
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import { deactivateMicrophoneStream, getOrCreateMicrophoneStream } from "@/lib/microphone";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkoutChatResponse {
  type: "generate_plan" | "modify_plan" | "log_feedback" | "answer";
  message: string;
  // generate_plan fields
  name?: string;
  goal?: string;
  fitnessLevel?: string;
  daysPerWeek?: number;
  schedule?: unknown[];
  // modify_plan fields
  updatedSchedule?: unknown[];
  // log_feedback fields
  dayIndex?: number;
  feedback?: string;
  suggestedAdjustments?: Array<{
    exerciseName: string;
    newWeightKg?: number;
    newSets?: number;
    newReps?: number;
  }>;
}

interface WorkoutVoiceInputProps {
  currentPlan: unknown | null;
  conversationHistory: ChatMessage[];
  onResponse: (response: WorkoutChatResponse, userMessage: string) => void;
}

export function WorkoutVoiceInput({
  currentPlan,
  conversationHistory,
  onResponse,
}: WorkoutVoiceInputProps) {
  const floatingBottomClass = "bottom-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]";
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeMimeRef = useRef<string>("");

  const startRecording = useCallback(async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();

      // Find the best supported audio format for Whisper
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
      ];
      const mimeType =
        candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;
      activeMimeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const usedMime = activeMimeRef.current || mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: usedMime });
        deactivateMicrophoneStream();

        let ext = "webm";
        if (usedMime.includes("mp4") || usedMime.includes("m4a")) ext = "mp4";
        else if (usedMime.includes("ogg")) ext = "ogg";
        else if (usedMime.includes("wav")) ext = "wav";

        await processAudio(blob, ext);
      };

      mediaRecorder.start(250); // Chunk every 250ms for reliability
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied.");
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

      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { text } = await transcribeRes.json();

      if (!text?.trim()) {
        toast.error("Couldn't understand the audio. Try again.");
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
    } catch {
      toast.error("Failed to transcribe audio.");
      setIsTranscribing(false);
    }
  };

  // Step 2: Send text to AI — if it fails, text stays in the input
  const processText = async (text: string) => {
    setIsProcessing(true);
    setLastFailedText(null);
    try {
      const settings = getSettings();

      const res = await fetch("/api/health/workout-plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory,
          currentPlan,
          customInstructions: settings.aiInstructions?.health || "",
          aiLanguage: settings.aiLanguage || "english",
        }),
      });

      if (!res.ok) throw new Error("AI processing failed");
      const response: WorkoutChatResponse = await res.json();

      // Success — clear the input
      setTextInput("");
      setLastFailedText(null);
      onResponse(response, text);
    } catch {
      // Keep text in the input so user can retry
      setLastFailedText(text);
      setTextInput(text);
      setShowTextInput(true);
      toast.error("AI failed — your text is saved. Edit or tap send to retry.");
    } finally {
      setIsProcessing(false);
    }
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

  return (
    <div className={cn("fixed left-0 right-0 px-4 z-[60] pointer-events-none", floatingBottomClass)}>
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
                placeholder="I want to build muscle 4 days a week..."
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

          <Button
            size="icon"
            className={cn(
              "h-16 w-16 rounded-full shadow-lg transition-all duration-200",
              isRecording
                ? "bg-red-500 hover:bg-red-600 scale-110 shadow-red-500/30"
                : "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20",
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
            AI is thinking...
          </p>
        )}
      </div>
    </div>
  );
}
