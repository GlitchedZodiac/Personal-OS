import { NextRequest, NextResponse } from "next/server";
import {
  openai,
  TRANSCRIBE_MODEL,
  TRANSCRIBE_FALLBACK_MODEL,
} from "@/lib/openai";
import { TRANSCRIBE_PROMPT } from "@/lib/ai-prompts";
import fs from "fs";
import path from "path";
import os from "os";
import {
  enforceDemoAIBudget,
  recordDemoAIFixedCharge,
} from "@/lib/demo-ai-budget";

// Allow up to 60s for transcription (Vercel Pro)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Get file info
    const fileName = audioFile.name || "recording.webm";
    const ext = path.extname(fileName) || ".webm";
    const mimeType = audioFile.type || "audio/webm";

    console.log(
      `[Transcribe] File: ${fileName}, size: ${audioFile.size} bytes, type: ${mimeType}, ext: ${ext}`
    );

    // Reject empty files
    if (audioFile.size < 100) {
      console.error(`[Transcribe] File too small: ${audioFile.size} bytes`);
      return NextResponse.json(
        { error: "Audio recording is empty. Please try again." },
        { status: 400 }
      );
    }

    // Write audio to a temp file - most reliable way to upload to OpenAI
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    tempPath = path.join(os.tmpdir(), `whisper-${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, buffer);

    console.log(`[Transcribe] Wrote temp file: ${tempPath} (${buffer.length} bytes)`);

    const blocked = await enforceDemoAIBudget();
    if (blocked) return blocked;

    // Don't specify language — auto-detect handles the English/Spanish mix.
    // The prompt biases recognition toward this app's domain vocabulary.
    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: TRANSCRIBE_MODEL,
        prompt: TRANSCRIBE_PROMPT,
      });
    } catch (primaryError) {
      console.warn(
        `[Transcribe] ${TRANSCRIBE_MODEL} failed, falling back to ${TRANSCRIBE_FALLBACK_MODEL}:`,
        primaryError instanceof Error ? primaryError.message : primaryError
      );
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: TRANSCRIBE_FALLBACK_MODEL,
      });
    }
    await recordDemoAIFixedCharge(
      Number(process.env.DEMO_AI_TRANSCRIPTION_COST_USD || "0.002")
    );

    console.log(`[Transcribe] Success: "${transcription.text?.substring(0, 60)}..."`);

    return NextResponse.json({ text: transcription.text });
  } catch (error: unknown) {
    console.error("Transcription error:", error);

    const errMsg =
      error instanceof Error ? error.message : "Failed to transcribe audio";

    // Provide a user-friendly error message
    const userMsg = errMsg.includes("could not be decoded")
      ? "Audio format not supported. Please try typing your message instead."
      : errMsg;

    return NextResponse.json({ error: userMsg }, { status: 500 });
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
