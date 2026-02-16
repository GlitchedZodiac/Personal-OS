"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WhisperButtonProps {
  onTranscription: (text: string) => void;
  className?: string;
  size?: "sm" | "default" | "icon";
}

/**
 * A compact mic button that records audio, transcribes it via Whisper,
 * and returns the text to the parent.
 */
export function WhisperButton({ onTranscription, className, size = "icon" }: WhisperButtonProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect best MIME type
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let selectedMime = "audio/webm";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }
      mimeRef.current = selectedMime;

      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: selectedMime });

        if (blob.size < 100) {
          toast.error("Recording was too short. Try again.");
          return;
        }

        // Transcribe
        setTranscribing(true);
        try {
          const ext = selectedMime.includes("mp4") ? "mp4" : "webm";
          const formData = new FormData();
          formData.append("audio", blob, `recording.${ext}`);

          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Transcription failed");
          }

          const { text } = await res.json();
          if (!text || text.trim() === "") {
            toast.error("Couldn't understand the audio. Try again.");
            return;
          }

          onTranscription(text.trim());
        } catch (err) {
          console.error("Whisper error:", err);
          toast.error("Failed to transcribe. Try again.");
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      console.error("Mic access error:", err);
      toast.error("Could not access microphone.");
    }
  }, [onTranscription]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const handleClick = () => {
    if (transcribing) return;
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      size={size}
      onClick={handleClick}
      disabled={transcribing}
      className={cn(
        "shrink-0",
        recording && "animate-pulse",
        className
      )}
      title={recording ? "Stop recording" : "Speak description"}
    >
      {transcribing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : recording ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Mic className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
