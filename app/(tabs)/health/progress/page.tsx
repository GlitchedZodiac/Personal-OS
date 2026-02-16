"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Camera,
  ImagePlus,
  Mic,
  MicOff,
  ArrowLeft,
  Trash2,
  Calendar,
  X,
  Maximize2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ProgressPhoto {
  id: string;
  takenAt: string;
  journalNote: string | null;
  createdAt: string;
  imageData?: string;
}

// Compress image to max width and return base64
async function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = (h * maxWidth) / w;
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ProgressPhotosPage() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/health/progress-photos");
      if (res.ok) {
        const data = await res.json();
        setPhotos(data);
      }
    } catch (err) {
      console.error("Failed to fetch photos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const compressed = await compressImage(file);
      setPreviewSrc(compressed);
      setShowUpload(true);
    } catch (err) {
      console.error("Failed to compress image:", err);
    }
  };

  const handleUpload = async () => {
    if (!previewSrc) return;
    setUploading(true);
    try {
      const res = await fetch("/api/health/progress-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: previewSrc,
          journalNote: journalText.trim() || null,
        }),
      });
      if (res.ok) {
        setShowUpload(false);
        setPreviewSrc(null);
        setJournalText("");
        fetchPhotos();
      }
    } catch (err) {
      console.error("Failed to upload photo:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this progress photo?")) return;
    try {
      const res = await fetch(`/api/health/progress-photos?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        if (selectedPhoto?.id === id) setSelectedPhoto(null);
      }
    } catch (err) {
      console.error("Failed to delete photo:", err);
    }
  };

  const openPhoto = (photo: ProgressPhoto) => {
    setSelectedPhoto(photo);
  };

  // Voice-to-text for journal note
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const usedMime = mimeType || mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: usedMime });
        if (blob.size < 100) return;

        let ext = "webm";
        if (usedMime.includes("mp4") || usedMime.includes("m4a")) ext = "mp4";
        else if (usedMime.includes("ogg")) ext = "ogg";
        else if (usedMime.includes("wav")) ext = "wav";

        try {
          const formData = new FormData();
          formData.append("audio", blob, `recording.${ext}`);
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const { text } = await res.json();
            if (text) setJournalText((prev) => (prev ? prev + " " + text : text));
          }
        } catch (err) {
          console.error("Transcription error:", err);
        }
      };

      mediaRecorder.start(250); // Chunk every 250ms for reliability
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone error:", err);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Progress Photos</h1>
          <p className="text-xs text-muted-foreground">
            Track your visual progress over time
          </p>
        </div>
      </div>

      {/* Upload Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 gap-2"
          variant="outline"
        >
          <Camera className="h-4 w-4" />
          Take Photo
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 gap-2"
          variant="outline"
        >
          <ImagePlus className="h-4 w-4" />
          Upload
        </Button>
        {/* Hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Upload Preview + Journal */}
      {showUpload && previewSrc && (
        <Card className="overflow-hidden">
          <CardContent className="p-3 space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black/50">
              <img
                src={previewSrc}
                alt="Preview"
                className="w-full max-h-72 object-contain"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7 bg-black/50 hover:bg-black/70"
                onClick={() => {
                  setShowUpload(false);
                  setPreviewSrc(null);
                  setJournalText("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Journal Note (optional)
              </label>
              <div className="flex gap-2">
                <textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="How are you feeling? Any progress notes..."
                  className="flex-1 min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-[60px] w-10 shrink-0",
                    isRecording && "bg-red-500/20 border-red-500/50"
                  )}
                  onClick={toggleRecording}
                >
                  {isRecording ? (
                    <MicOff className="h-4 w-4 text-red-400" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? "Saving..." : "Save Progress Photo"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              No progress photos yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Take your first photo to start tracking
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => openPhoto(photo)}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
            >
              {photo.imageData ? (
                <img
                  src={photo.imageData}
                  alt="Progress"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="h-6 w-6 text-muted-foreground/30" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <p className="text-[9px] text-white/80 font-medium">
                  {format(new Date(photo.takenAt), "MMM d")}
                </p>
                {photo.journalNote && (
                  <p className="text-[8px] text-white/60 truncate">
                    {photo.journalNote}
                  </p>
                )}
              </div>
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <Maximize2 className="h-4 w-4 text-white drop-shadow" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Full Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-white font-medium flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(selectedPhoto.takenAt), "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-xs text-white/50">
                {format(new Date(selectedPhoto.takenAt), "h:mm a")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-400 hover:bg-red-500/20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(selectedPhoto.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white"
                onClick={() => setSelectedPhoto(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedPhoto.imageData ? (
              <img
                src={selectedPhoto.imageData}
                alt="Progress"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-white/50 text-sm">Loading image...</div>
            )}
          </div>

          {selectedPhoto.journalNote && (
            <div className="p-4 pt-0" onClick={(e) => e.stopPropagation()}>
              <Card className="bg-white/10 border-white/10">
                <CardContent className="p-3">
                  <p className="text-sm text-white/90">
                    {selectedPhoto.journalNote}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
