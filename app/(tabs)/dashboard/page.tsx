"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SettingsIcon, TrainIcon } from "@/components/pitaya-icons";
import { formatTonnage, netVsTargetLabel } from "@/lib/format-training";
import { useDataLoggedListener } from "@/components/use-data-logged";
import { SheetPortal } from "@/components/sheet-portal";
import { MacroTargetsSheet } from "@/components/macro-targets-sheet";
import {
  getOrCreateMicrophoneStream,
  deactivateMicrophoneStream,
} from "@/lib/microphone";

// Pitaya Today — full port of the design's Today screen (docs/design/
// pitaya-app.dc.html, screen 0). Calorie ring with tap-to-flip, P/C/F bars,
// Train + Weight tiles, tonight's journal page with a real voice memo
// (gpt-transcribe → appended paragraph), tappable habit ticks, Sunday
// Report row. The journal prompt line rotates locally — the reflective
// AI-written prompt arrives with the chat rebuild.

interface TodayData {
  date: string;
  streak: number;
  calories: {
    eaten: number;
    goal: number;
    protein: { g: number; goalG: number };
    carbs: { g: number; goalG: number };
    fat: { g: number; goalG: number };
    mealsLogged: number;
  };
  train: {
    weekVolumeKg: number;
    weekPRCount: number;
    weekSessions: number;
    burnedToday: number;
    netVsTargetKcal: number;
  };
  weight: { latestKg: number | null; deltaKg: number | null; spark: number[] };
  journal: {
    exists: boolean;
    text: string;
    photo: string | null;
    dayNumber: number;
  };
  habits: string[];
}

// His stack, his order (2026-08-11 ask): creatine, magnesium, complex B,
// journaling, mobility — steps stays as the daily movement floor.
const HABITS = [
  { key: "creatine", label: "Creatine" },
  { key: "magnesium", label: "Magnesium" },
  { key: "complex-b", label: "Complex B" },
  { key: "journal", label: "Journal" },
  { key: "mobility", label: "Mobility" },
  { key: "10k steps", label: "10k steps" },
];

// Local prompt rotation until the chat rebuild writes reflective ones.
const JOURNAL_PROMPTS = [
  "Swings felt heavy today. What else was heavy?",
  "What did today prove you can do?",
  "One thing you'd tell tomorrow's you?",
  "Where did the energy go today?",
  "¿Qué te sorprendió hoy?",
  "What's worth remembering about today?",
  "Body says what the calendar won't. What did it say?",
];

const fmt = (n: number) => n.toLocaleString("en-US");

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sparkPoints(values: number[], w = 120, h = 26) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = 3 + (1 - (v - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

type MemoState = "idle" | "recording" | "transcribing" | "done";

export default function TodayPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayData | null>(null);
  const [flip, setFlip] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [memoState, setMemoState] = useState<MemoState>("idle");
  const [memoSeconds, setMemoSeconds] = useState(0);
  const [showJournal, setShowJournal] = useState(false);
  const [journalDraft, setJournalDraft] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const memoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  const dateStr = localDateStr();

  const load = useCallback(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/health/today?date=${dateStr}&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [dateStr]);

  useEffect(load, [load]);
  useDataLoggedListener(load);

  const prompt =
    JOURNAL_PROMPTS[
      (dateStr.split("-").reduce((a, b) => a + Number(b), 0) || 0) %
        JOURNAL_PROMPTS.length
    ];

  const toggleHabit = async (name: string) => {
    if (!data) return;
    // Optimistic tick
    setData((prev) =>
      prev
        ? {
            ...prev,
            habits: prev.habits.includes(name)
              ? prev.habits.filter((h) => h !== name)
              : [...prev.habits, name],
          }
        : prev
    );
    const res = await fetch("/api/health/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, localDate: dateStr }),
    });
    if (!res.ok) {
      toast.error("Couldn't save the tick");
      load();
    }
  };

  const startMemo = async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let mime = "audio/webm";
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        deactivateMicrophoneStream();
        if (memoTimerRef.current) clearInterval(memoTimerRef.current);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) {
          setMemoState("idle");
          toast.error("Too short — try again.");
          return;
        }
        setMemoState("transcribing");
        try {
          const form = new FormData();
          form.append(
            "audio",
            blob,
            `memo.${mime.includes("mp4") ? "mp4" : "webm"}`
          );
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            body: form,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.text?.trim()) {
            throw new Error(body.error || "empty transcript");
          }
          const saveRes = await fetch("/api/health/journal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              localDate: dateStr,
              text: body.text.trim(),
              append: true,
            }),
          });
          if (!saveRes.ok) throw new Error("save failed");
          setMemoState("done");
          load();
          setTimeout(() => setMemoState("idle"), 4000);
        } catch {
          setMemoState("idle");
          toast.error("Couldn't transcribe — try again.");
        }
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setMemoSeconds(0);
      memoTimerRef.current = setInterval(
        () => setMemoSeconds((s) => s + 1),
        1000
      );
      setMemoState("recording");
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  const memoTap = () => {
    if (memoState === "idle" || memoState === "done") startMemo();
    else if (memoState === "recording") recorderRef.current?.stop();
  };

  const openJournal = () => {
    setJournalDraft(data?.journal.text ?? "");
    setShowJournal(true);
  };

  // One photo per day, compressed client-side — the habit anchor.
  const handleJournalPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoSaving(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxW = 900;
            const w = Math.min(img.width, maxW);
            const h = Math.round((img.height * w) / img.width);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("no canvas"));
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.72));
          };
          img.onerror = () => reject(new Error("bad image"));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/health/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localDate: dateStr, photoData: dataUrl }),
      });
      if (!res.ok) throw new Error();
      toast.success("Photo on tonight's page.");
      load();
    } catch {
      toast.error("Couldn't attach the photo");
    } finally {
      setPhotoSaving(false);
    }
  };

  const saveJournal = async () => {
    setJournalSaving(true);
    try {
      const res = await fetch("/api/health/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localDate: dateStr, text: journalDraft }),
      });
      if (res.ok) {
        toast.success("Page saved");
        setShowJournal(false);
        load();
      } else {
        toast.error("Couldn't save");
      }
    } finally {
      setJournalSaving(false);
    }
  };

  const cals = data?.calories;
  const eaten = cals?.eaten ?? 0;
  const goal = cals?.goal ?? 2000;
  const remaining = goal - eaten;
  const arcOffset = 339.3 * (1 - Math.min(eaten / goal, 1));

  const headerDate = new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
    })
    .replace(",", " ·")
    .toUpperCase();

  const memoLabel =
    memoState === "done"
      ? `0:${String(memoSeconds).padStart(2, "0")} ✓ appended`
      : memoState === "transcribing"
        ? "Writing it down…"
        : "Voice memo";

  return (
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="micro-label">{headerDate}</p>
          <h1
            className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Today
          </h1>
        </div>
        {data && data.streak > 0 && (
          <span className="flex items-center gap-[5px] rounded-full bg-accent px-3 py-[5px] text-xs font-semibold text-[#8C2F51]">
            <svg width="9" height="9" viewBox="0 0 10 10">
              <rect
                x="5"
                y="0"
                width="7"
                height="7"
                transform="rotate(45 5 1.5)"
                fill="#A63D63"
              />
            </svg>
            {data.streak}-day streak
          </span>
        )}
      </div>

      {/* Calorie ring card — the gear opens the same Targets sheet Food
          uses ("there's nowhere for me to enter my goal", 2026-08-11). */}
      <div className="relative mt-[18px] rounded-[20px] bg-card p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <button
          onClick={() => setShowTargets(true)}
          aria-label="Set calorie and macro targets"
          className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[#8C2F51] hover:bg-[#F0D3E0]"
        >
          <SettingsIcon size={16} />
        </button>
        <button
          onClick={() => setFlip((v) => !v)}
          className="flex w-full items-center gap-5 text-left"
        >
          <svg width="150" height="150" viewBox="0 0 128 128" className="shrink-0">
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#F2F1F2"
              strokeWidth="9"
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#A63D63"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray="339.3"
              strokeDashoffset={arcOffset}
              transform="rotate(-90 64 64)"
              style={{
                transition: "stroke-dashoffset 1.1s cubic-bezier(.22,.9,.3,1)",
              }}
            />
          </svg>
          <div>
            <p
              className="text-[44px] font-bold leading-none tracking-[-0.02em] tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {fmt(flip ? Math.abs(remaining) : eaten)}
            </p>
            <p className="mt-1.5 text-xs text-secondary-foreground">
              {flip ? (remaining >= 0 ? "kcal to go" : "kcal over") : "kcal in"}{" "}
              · goal {fmt(goal)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              tap to flip
            </p>
          </div>
        </button>
        <div className="mt-3.5 grid gap-2.5">
          {(
            [
              ["P", "#A63D63", cals?.protein],
              ["C", "#232227", cals?.carbs],
              ["F", "#A9A7AE", cals?.fat],
            ] as const
          ).map(([letter, color, macro]) => (
            <div key={letter} className="flex items-center gap-2.5">
              <span className="w-4 text-[11.5px] font-bold text-foreground">
                {letter}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: color,
                    width: macro
                      ? `${Math.min(100, Math.round((macro.g / Math.max(1, macro.goalG)) * 100))}%`
                      : "0%",
                    transition: "width 1s cubic-bezier(.22,.9,.3,1)",
                  }}
                />
              </div>
              <span className="w-[76px] text-right text-[11.5px] tabular-nums text-secondary-foreground">
                {macro ? `${macro.g} / ${macro.goalG} g` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Train + Weight tiles */}
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => router.push("/health/workouts")}
          className="flex-1 rounded-[16px] bg-card p-3.5 px-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)]"
        >
          <div className="flex items-center gap-1.5">
            <TrainIcon size={13} strokeWidth={2.2} className="text-primary" />
            <span className="text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground">
              TRAIN
            </span>
          </div>
          {/* Tonnage in tonnes, not five digits of kilos — and the second
              line answers "am I in deficit today?" instead of counting PR
              rows (baseline rows made that read "46 PRs this week"). */}
          <p
            className="mt-1.5 text-[15px] font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="tabular-nums">
              {formatTonnage(data?.train.weekVolumeKg ?? 0).value}
            </span>
            <span className="text-[12px] text-secondary-foreground">
              {" "}
              {formatTonnage(data?.train.weekVolumeKg ?? 0).unit}
            </span>
            <span className="text-[12px] font-medium text-secondary-foreground">
              {" · "}
              {data?.train.weekSessions ?? 0} session
              {data?.train.weekSessions === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-0.5 text-[11.5px] text-secondary-foreground">
            {data ? (
              <>
                <span className="tabular-nums">{fmt(data.train.burnedToday)}</span>{" "}
                burned ·{" "}
                <span
                  className="font-semibold tabular-nums"
                  style={{
                    color:
                      netVsTargetLabel(data.train.netVsTargetKcal).tone === "over"
                        ? "#B54B4B"
                        : "#5E9B72",
                  }}
                >
                  {netVsTargetLabel(data.train.netVsTargetKcal).text}
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </button>
        <button
          onClick={() => router.push("/health/body")}
          className="flex-1 rounded-[16px] bg-card p-3.5 px-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)]"
        >
          <span className="text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground">
            WEIGHT
          </span>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="text-[15px] font-semibold tabular-nums text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {data?.weight.latestKg != null
                ? `${data.weight.latestKg.toFixed(1)} kg`
                : "— kg"}
            </span>
            {data?.weight.deltaKg != null && (
              <span
                className="text-[11px] font-semibold"
                style={{
                  color: data.weight.deltaKg <= 0 ? "#5E9B72" : "#B54B4B",
                }}
              >
                {data.weight.deltaKg > 0 ? "+" : "−"}
                {Math.abs(data.weight.deltaKg).toFixed(1)}
              </span>
            )}
          </div>
          {data && data.weight.spark.length > 1 && (
            <svg
              width="100%"
              height="26"
              viewBox="0 0 120 26"
              preserveAspectRatio="none"
              className="mt-1"
            >
              <polyline
                points={sparkPoints(data.weight.spark)}
                fill="none"
                stroke="#A63D63"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Tonight's page */}
      <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          TONIGHT&apos;S PAGE · DAY {data?.journal.dayNumber ?? "—"}
        </p>
        <p
          className="mt-1.5 text-base font-semibold leading-snug text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {data?.journal.exists
            ? data.journal.text.length > 90
              ? `${data.journal.text.slice(0, 90)}…`
              : data.journal.text
            : prompt}
        </p>
        <div className="mt-3 flex gap-2.5">
          <button
            onClick={memoTap}
            className="flex flex-1 items-center gap-2.5 rounded-[12px] border border-border px-3 py-2.5 transition-colors duration-300"
            style={{
              background: memoState === "recording" ? "#F6E3EB" : "#FAF9FA",
            }}
          >
            {memoState === "recording" ? (
              <span className="flex h-3.5 items-end gap-[2px]">
                {[0, 0.12, 0.24, 0.36].map((delay) => (
                  <span
                    key={delay}
                    className="w-[3px] rounded-[2px] bg-primary"
                    style={{
                      height: "100%",
                      transformOrigin: "bottom",
                      animation: `vu .7s ease-in-out infinite ${delay}s`,
                    }}
                  />
                ))}
              </span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20">
                <rect
                  x="7"
                  y="2"
                  width="6"
                  height="11"
                  rx="3"
                  fill={memoState === "transcribing" ? "#A63D63" : "#66646C"}
                />
                <path
                  d="M4 9 a6 6 0 0 0 12 0 M10 15 v3"
                  stroke={memoState === "transcribing" ? "#A63D63" : "#66646C"}
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span
              className="text-[12.5px] font-semibold"
              style={{
                color: memoState === "recording" ? "#8C2F51" : "#232227",
              }}
            >
              {memoState === "recording" ? "Listening…" : memoLabel}
            </span>
          </button>
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={photoSaving}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-[1.5px] border-dashed border-[#D9D7DC]"
          >
            {data?.journal.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.journal.photo}
                alt="Tonight's photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={photoSaving ? "#A63D63" : "#96949B"}
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5a2 2 0 0 1 2-2h1.6l1.4-2h8l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                <circle cx="12" cy="13" r="3.6" />
              </svg>
            )}
          </button>
          <button
            onClick={openJournal}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-[#D9D7DC]"
          >
            <span className="text-xl leading-none text-muted-foreground">+</span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleJournalPhoto}
          />
        </div>
      </div>

      {/* Habits */}
      <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            HABITS · TODAY
          </p>
          <p className="text-[11px] text-muted-foreground">tap to tick</p>
        </div>
        {/* 6 habits wrap 3-up on phones instead of crushing into one row */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {HABITS.map(({ key, label }) => {
            const checked = data?.habits.includes(key) ?? false;
            return (
              <button
                key={key}
                onClick={() => toggleHabit(key)}
                className="text-center"
              >
                <div
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] transition-colors duration-200"
                  style={{ background: checked ? "#A63D63" : "#E7E5E9" }}
                >
                  <span className="text-sm font-bold text-white">✓</span>
                </div>
                <p className="mt-[5px] text-[10px] text-secondary-foreground">
                  {label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sunday Report */}
      <div className="mt-3 flex items-center justify-between rounded-[16px] bg-card p-3.5 px-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div>
          <p
            className="text-sm font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sunday Report
          </p>
          <p className="mt-0.5 text-[11.5px] text-secondary-foreground">
            writes itself Sunday night · last week ready
          </p>
        </div>
        <button
          onClick={() => router.push("/health/report")}
          className="rounded-[8px] bg-accent px-3.5 py-2 text-xs font-semibold text-[#8C2F51]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Open →
        </button>
      </div>

      {/* ——— Journal sheet ——— */}
      {showJournal && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowJournal(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tonight&apos;s page
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{prompt}</p>
            <textarea
              value={journalDraft}
              onChange={(e) => setJournalDraft(e.target.value)}
              rows={6}
              placeholder="Write it down…"
              className="mt-3 w-full resize-none rounded-[12px] border border-border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none"
            />
            <div className="mt-3 flex gap-2.5">
              <button
                onClick={() => setShowJournal(false)}
                className="flex-1 rounded-[12px] border border-[#D9D7DC] bg-card py-3 text-[13.5px] font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Cancel
              </button>
              <button
                onClick={saveJournal}
                disabled={journalSaving || !journalDraft.trim()}
                className="flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {journalSaving ? "Saving…" : "Save page"}
              </button>
            </div>
          </div>
        </SheetPortal>
      )}

      <MacroTargetsSheet
        open={showTargets}
        onClose={() => setShowTargets(false)}
        onSaved={load}
      />
    </div>
  );
}
