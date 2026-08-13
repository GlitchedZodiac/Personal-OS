"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getOrCreateMicrophoneStream,
  deactivateMicrophoneStream,
} from "@/lib/microphone";

// Church series — the Sunday track. Speak it, photograph the slides,
// or paste a transcript; the AI proposes, HE confirms, then it commits
// (the confirmation-dock shape, kept). Runs beside the term, never
// instead of it.

interface Proposal {
  title: string;
  expectedWeeks: number | null;
  lengthNote: string | null;
  passages: { ref: string; label: string }[];
  themes: string | null;
}

interface Series {
  id: string;
  title: string;
  expectedWeeks: number | null;
  currentWeek: number;
  weeks: { index: number; passageRef: string; title: string; context: string; questions: string[] }[];
}

type Step = "entry" | "capture" | "parsing" | "confirm" | "live";
type Mode = "speak" | "photo" | "paste";

export default function SpiritChurchPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("entry");
  const [mode, setMode] = useState<Mode>("paste");
  const [series, setSeries] = useState<Series | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    fetch("/api/spirit/church")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.series) {
          setSeries(d.series);
          setStep("live");
        }
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const pick = (m: Mode) => {
    setMode(m);
    setStep("capture");
    if (m === "photo") setTimeout(() => fileRef.current?.click(), 60);
    if (m === "speak") startRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        deactivateMicrophoneStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        setBusy(true);
        try {
          const form = new FormData();
          form.append("audio", blob, `series.${mime.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.text?.trim()) {
            setText((prev) => (prev ? `${prev} ${body.text.trim()}` : body.text.trim()));
          } else {
            toast.error("Couldn't hear that.");
          }
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: string[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      list.push(dataUrl);
    }
    setImages((prev) => [...prev, ...list].slice(0, 4));
  };

  const parse = async () => {
    if (busy || (!text.trim() && images.length === 0)) return;
    setBusy(true);
    setStep("parsing");
    try {
      const res = await fetch("/api/spirit/church", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, images: images.length ? images : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Parse failed");
      setProposal(body.proposal);
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
      setStep("capture");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/spirit/church", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't start the track");
      setSeries(body.series);
      setStep("live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the track");
    } finally {
      setBusy(false);
    }
  };

  const editField = (field: "title" | "lengthNote" | "themes") => {
    if (!proposal) return;
    const current = proposal[field] ?? "";
    const next = window.prompt("Edit", String(current));
    if (next !== null) setProposal({ ...proposal, [field]: next });
  };

  const week = series?.weeks?.find?.((w) => w.index === series.currentWeek) ?? series?.weeks?.[0];

  return (
    <div className="push-in stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/spirit")}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            CHURCH · THE SUNDAY TRACK
          </div>
          <div
            className="text-2xl font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {step === "live" ? "The Sunday track" : "My church started a series"}
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {step === "entry" && (
        <>
          <p className="mt-3.5 text-[12.5px] leading-[1.65] text-[#66646C]">
            Your church announces little ahead — the first sermon explains where the
            series is going. Tell the app what you heard, any way you like:
          </p>
          <div className="mt-3.5 grid gap-2.5">
            {(
              [
                ["speak", "Speak it", "“Pastor started Galatians today, sounded like eight weeks…”",
                  <svg key="m" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="11.5" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" /></svg>],
                ["photo", "Photograph the slides", "multi-photo — the app parses title, outline, passages",
                  <svg key="c" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5a2 2 0 0 1 2-2h1.6l1.4-2h6l1.4 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.5" r="3.4" /></svg>],
                ["paste", "Paste a transcript", "from the church's podcast or your own recording",
                  <svg key="t" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2.5" width="8" height="4" rx="1.2" /><path d="M16 4.5h2a2 2 0 0 1 2 2V19a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19V6.5a2 2 0 0 1 2-2h2M8.5 11h7M8.5 15h7" /></svg>],
              ] as [Mode, string, string, React.ReactNode][]
            ).map(([m, title, sub, icon]) => (
              <button
                key={m}
                onClick={() => pick(m)}
                className="tap-scale flex items-center gap-3.5 rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent">
                  {icon}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-[#66646C]">{sub}</span>
                </span>
                <span className="text-sm text-[#C9C7CD]">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {(step === "capture" || step === "parsing") && (
        <>
          <div className="mt-4 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            {mode === "speak" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => (recording ? recorderRef.current?.stop() : startRecording())}
                  className="flex h-12 w-12 flex-none items-center justify-center rounded-full shadow-[0_0_0_5px_#F6E3EB]"
                  style={{ background: recording ? "#8C2F51" : "#A63D63" }}
                  aria-label={recording ? "Stop recording" : "Record"}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
                  </svg>
                </button>
                <p className="text-[12px] leading-[1.55] text-[#66646C]">
                  {recording
                    ? "Listening — tap to stop."
                    : busy
                      ? "Transcribing…"
                      : "Tap and say what the pastor announced."}
                </p>
              </div>
            )}
            {mode === "photo" && (
              <div>
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={img} alt={`slide ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  ))}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#D9D7DC] text-xl text-[#96949B]"
                    aria-label="Add slide photo"
                  >
                    +
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Up to 4 slide photos — title slide, outline, passages.
                </p>
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={mode === "paste" ? 6 : 3}
              placeholder={
                mode === "paste"
                  ? "Paste the transcript or the announcement…"
                  : "Anything else worth adding (optional)…"
              }
              className="mt-3 w-full resize-none rounded-xl border border-[#E4E2E6] px-3 py-2.5 text-[13px] leading-[1.6] outline-none"
            />
          </div>
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={parse}
              disabled={busy || (!text.trim() && images.length === 0)}
              className="flex-[1.6] rounded-[11px] bg-[#A63D63] py-3 text-[13px] font-semibold text-white hover:bg-[#8C2F51] disabled:opacity-50"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {step === "parsing" ? "Reading it…" : "Parse the announcement"}
            </button>
            <button
              onClick={() => {
                setStep("entry");
                setText("");
                setImages([]);
              }}
              className="flex-1 rounded-[11px] border border-[#D9D7DC] py-3 text-[12.5px] font-semibold text-[#66646C] hover:bg-[#FAF9FA]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Back
            </button>
          </div>
        </>
      )}

      {step === "confirm" && proposal && (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.14em] text-[#8C2F51]">
              PARSED FROM YOUR {mode === "photo" ? "PHOTOS" : mode === "speak" ? "WORDS" : "TRANSCRIPT"}
            </span>
            <span className="h-px flex-1 bg-[#E4E2E6]" />
            <span className="text-[10px] text-muted-foreground">confirm before it commits</span>
          </div>
          <div className="mt-2.5 grid gap-px overflow-hidden rounded-[16px] border border-[#E4E2E6] bg-[#E4E2E6]">
            <button onClick={() => editField("title")} className="flex items-center justify-between bg-white px-4 py-3 text-left">
              <span>
                <span className="block text-[10px] font-bold tracking-[0.1em] text-muted-foreground">SERIES TITLE</span>
                <span className="mt-0.5 block text-[14.5px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  {proposal.title}
                </span>
              </span>
              <span className="text-[13px] text-[#A63D63]">✎</span>
            </button>
            <button onClick={() => editField("lengthNote")} className="flex items-center justify-between bg-white px-4 py-3 text-left">
              <span>
                <span className="block text-[10px] font-bold tracking-[0.1em] text-muted-foreground">EXPECTED LENGTH</span>
                <span className="mt-0.5 block text-[13px] text-[#454349]">
                  {proposal.expectedWeeks ? `≈ ${proposal.expectedWeeks} Sundays` : "unknown"}
                  {proposal.lengthNote ? ` · ${proposal.lengthNote}` : ""}
                </span>
              </span>
              <span className="text-[13px] text-[#A63D63]">✎</span>
            </button>
            <div className="bg-white px-4 py-3">
              <span className="block text-[10px] font-bold tracking-[0.1em] text-muted-foreground">PASSAGES</span>
              <div className="mt-1.5 flex flex-wrap gap-[5px]">
                {proposal.passages.map((p, i) => (
                  <span
                    key={i}
                    className="rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold"
                    style={{
                      background: p.label === "coming" ? "#F2F1F2" : "#F6E3EB",
                      color: p.label === "coming" ? "#66646C" : "#8C2F51",
                    }}
                  >
                    {p.ref}
                    {p.label === "preached" ? " ✓ preached" : p.label === "next" ? " · next" : ""}
                  </span>
                ))}
                {proposal.passages.length === 0 && (
                  <span className="text-[12px] text-muted-foreground">none named yet</span>
                )}
              </div>
            </div>
            <button onClick={() => editField("themes")} className="flex items-center justify-between bg-white px-4 py-3 text-left">
              <span>
                <span className="block text-[10px] font-bold tracking-[0.1em] text-muted-foreground">THEMES</span>
                <span className="mt-0.5 block text-[12.5px] text-[#454349]">{proposal.themes ?? "—"}</span>
              </span>
              <span className="text-[13px] text-[#A63D63]">✎</span>
            </button>
          </div>
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={confirm}
              disabled={busy}
              className="flex-[1.6] rounded-[11px] bg-[#A63D63] py-3 text-[13px] font-semibold text-white hover:bg-[#8C2F51] disabled:opacity-60"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {busy ? "Binding the track…" : "Looks right — start the track"}
            </button>
            <button
              onClick={() => {
                setProposal(null);
                setStep("entry");
                setText("");
                setImages([]);
              }}
              className="flex-1 rounded-[11px] border border-[#D9D7DC] py-3 text-[12.5px] font-semibold text-[#66646C] hover:bg-[#FAF9FA]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Start over
            </button>
          </div>
        </>
      )}

      {step === "live" && series && (
        <>
          <div className="mt-4 flex items-center gap-2.5 rounded-[14px] bg-[#EAF3ED] px-4 py-3">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-white text-[13px] text-[#3E7A54]">
              ✓
            </span>
            <span className="text-[12.5px] font-semibold text-[#2C5A3E]">
              Sunday track live — it runs beside the term, never instead of it.
            </span>
          </div>
          <div className="mt-3 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                SUNDAY · {series.title.split("—")[0].trim().toUpperCase()}
              </p>
              <span className="rounded-full bg-accent px-[9px] py-[2.5px] text-[9.5px] font-semibold text-[#8C2F51]">
                wk {series.currentWeek}
                {series.expectedWeeks ? ` of ≈${series.expectedWeeks}` : ""}
              </span>
            </div>
            <p className="mt-1.5 text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              {week ? `This week: ${week.title}` : series.title}
            </p>
            {week && (
              <>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-[#66646C]">{week.context}</p>
                <div className="mt-2.5 grid gap-1.5">
                  {week.questions.map((q1, i) => (
                    <div key={i} className="flex gap-2 rounded-lg bg-[#FAF9FA] px-3 py-2">
                      <span className="text-[11px] font-bold text-[#8C2F51]">{i + 1}</span>
                      <span className="text-[12px] leading-[1.55] text-[#454349]">{q1}</span>
                    </div>
                  ))}
                </div>
                {week.passageRef && (
                  <button
                    onClick={() => router.push(`/spirit/read?q=${encodeURIComponent(week.passageRef.split(/[-–,]/)[0].trim())}`)}
                    className="mt-3 rounded-[10px] bg-accent px-4 py-2 text-xs font-semibold text-[#8C2F51] hover:bg-[#F0D3E0]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Open {week.passageRef} in the reader →
                  </button>
                )}
              </>
            )}
            <p className="mt-3 text-[11px] leading-[1.55] text-muted-foreground">
              A voice note during the sermon lands in the Notebook, tagged to the passage.
              You arrive next Sunday primed.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-[11px] text-muted-foreground">
              Series running long?{" "}
              <span className="font-semibold text-[#8C2F51]">Promoting it to a term arrives with the pipeline</span>
            </span>
            <button
              onClick={() => router.push("/spirit")}
              className="rounded-[9px] border border-[#D9D7DC] px-4 py-2 text-xs font-semibold text-[#66646C] hover:bg-[#FAF9FA]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
