"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";
import { type BodyTheme, DISPLAY, KICKER, MicGlyph, chipStyle } from "@/components/body/theme";
import {
  type DayPoint,
  type ParsedTape,
  TAPE_SITES,
  type TapeSite,
  dayLabel,
  keypadPress,
  parseTapeUtterance,
  signed,
  validTape,
} from "@/lib/body-view";
import { haptic } from "@/lib/haptics";
import { deactivateMicrophoneStream, getOrCreateMicrophoneStream } from "@/lib/microphone";

// Tape entry (spec §7). Two ways in: the Tape button opens listening — say
// "waist 86.5", or the whole round — and a row tap opens the keypad for that
// site. Either way the app proposes and he confirms: nothing is saved until
// Save. A sentence naming several sites yields one card per site and one Save.

type Step = "mic" | "parsed" | "pad" | "saved";
const siteLabel = (key: TapeSite) => TAPE_SITES.find((s) => s.key === key)!.label;
const GOOD_DOWN = new Set<TapeSite>(["waist", "hips", "neck"]);
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

/**
 * Records while `active`, stops itself after he has spoken and then gone
 * quiet (or when `finish` is called, or at the cap), and hands back the
 * transcript. Reuses the app's shared microphone stream and transcription
 * route, so permission and vocabulary behave as they do in the dock.
 */
function useTapeListener(
  active: boolean,
  /** Bumped to start a fresh take — "Again", or after a sentence with no site in it. */
  take: number,
  onText: (text: string) => void,
  onFail: (why: string) => void
) {
  const [busy, setBusy] = useState(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let recorder: MediaRecorder | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    let cap = 0;

    (async () => {
      try {
        const stream = await getOrCreateMicrophoneStream();
        if (cancelled) return deactivateMicrophoneStream();
        const mime =
          ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"].find((t) =>
            MediaRecorder.isTypeSupported(t)
          ) ?? "";
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = async () => {
          cancelAnimationFrame(frame);
          clearTimeout(cap);
          context?.close().catch(() => {});
          deactivateMicrophoneStream();
          if (cancelled) return;
          const type = mime || recorder?.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          setBusy(true);
          try {
            const form = new FormData();
            form.append("audio", blob, `tape.${type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm"}`);
            const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Transcription failed");
            if (!cancelled) onText(String(json.text ?? ""));
          } catch (error) {
            if (!cancelled) onFail(error instanceof Error ? error.message : "Could not hear that");
          } finally {
            if (!cancelled) setBusy(false);
          }
        };
        recorder.start();
        stopRef.current = () => {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        };

        // Stop on his own pause: once speech has been heard, 1.4 s of quiet
        // ends the take. Timers, not rAF alone — rAF stalls in a hidden tab.
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let spoke = false;
        let quietSince = 0;
        const listen = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const s of samples) sum += ((s - 128) / 128) ** 2;
          const level = Math.sqrt(sum / samples.length);
          const now = performance.now();
          if (level > 0.045) {
            spoke = true;
            quietSince = 0;
          } else if (spoke) {
            quietSince ||= now;
            if (now - quietSince > 1400) return stopRef.current();
          }
          frame = requestAnimationFrame(listen);
        };
        frame = requestAnimationFrame(listen);
        cap = window.setTimeout(() => stopRef.current(), 15_000);
      } catch {
        if (!cancelled) onFail("Microphone unavailable — type it instead.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(cap);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      else deactivateMicrophoneStream();
    };
    // onText/onFail are stable callbacks from the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, take]);

  return { busy, finish: () => stopRef.current() };
}

export interface TapeSheetRequest {
  /** A fresh id per opening, so each opening starts from a clean flow. */
  id: number;
  mode: "voice" | "pad";
  site?: TapeSite;
}

interface TapeSheetProps {
  /** null = closed. */
  request: TapeSheetRequest | null;
  theme: BodyTheme;
  today: string;
  tape: Record<TapeSite, DayPoint[]>;
  /** Persist the readings; resolves false when the save failed. */
  onSave: (readings: ParsedTape[]) => Promise<boolean>;
  onClose: () => void;
}

export function TapeSheet(props: TapeSheetProps) {
  const { request, theme, onClose } = props;
  const open = request !== null;
  // Keep the last request mounted while the sheet slides away.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);

  return (
    <SheetPortal>
      <div className="body-theme" data-theme={theme}>
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, background: "var(--b-scrim)", opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none", transition: "opacity .35s", zIndex: 80,
          }}
        />
        <div
          role="dialog"
          aria-label="Tape"
          aria-hidden={!open}
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 520,
            maxHeight: "92dvh", overflowY: "auto", background: "var(--b-card)", borderRadius: "28px 28px 0 0",
            padding: "12px 22px calc(40px + env(safe-area-inset-bottom))",
            transform: `translateY(${open ? "0%" : "110%"})`,
            transition: "transform .42s cubic-bezier(.32,.86,.3,1)", zIndex: 81,
            boxShadow: "0 -12px 40px rgba(0,0,0,.18)",
          }}
        >
          {shown && <TapeFlow key={shown.id} {...props} request={shown} open={open} />}
        </div>
      </div>
    </SheetPortal>
  );
}

function TapeFlow({
  request,
  open,
  today,
  tape,
  onSave,
  onClose,
}: Omit<TapeSheetProps, "request"> & { request: TapeSheetRequest; open: boolean }) {
  const [step, setStep] = useState<Step>(request.mode === "pad" ? "pad" : "mic");
  const [heard, setHeard] = useState("");
  const [parsed, setParsed] = useState<ParsedTape[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [padSite, setPadSite] = useState<TapeSite>(request.site ?? "waist");
  const [padVal, setPadVal] = useState("");
  /** Set while the keypad is correcting one card of a heard sentence. */
  const [editing, setEditing] = useState<TapeSite | null>(null);
  const [saved, setSaved] = useState<ParsedTape[]>([]);
  const [saving, setSaving] = useState(false);
  const [take, setTake] = useState(1);

  const onText = useCallback((text: string) => {
    const readings = parseTapeUtterance(text);
    if (readings.length === 0) {
      // Unknown → stay listening, with one line.
      setNudge(
        text.trim()
          ? `Heard “${text.trim().slice(0, 60)}” — say a site and a number.`
          : "Didn’t catch that — say a site and a number."
      );
      setTake((t) => t + 1);
      return;
    }
    setNudge(null);
    setHeard(text.trim());
    setParsed(readings);
    setStep("parsed");
  }, []);
  const onFail = useCallback((why: string) => {
    setNudge(why);
    setStep("pad");
  }, []);

  const listener = useTapeListener(open && step === "mic", take, onText, onFail);

  const lastOf = (site: TapeSite) => {
    const points = tape[site];
    return points.length ? points[points.length - 1] : null;
  };

  const commit = async (readings: ParsedTape[]) => {
    if (saving || readings.length === 0) return;
    setSaving(true);
    const ok = await onSave(readings);
    setSaving(false);
    if (!ok) return;
    haptic("success");
    setSaved(readings);
    setStep("saved");
    window.setTimeout(onClose, 1300);
  };

  const padNumber = parseFloat(padVal);
  const padOk = validTape(padNumber);
  const padLast = lastOf(padSite);

  const savePad = () => {
    if (!padOk) return;
    if (editing) {
      setParsed((list) => list.map((r) => (r.site === editing ? { site: padSite, value: padNumber } : r)));
      setEditing(null);
      setStep("parsed");
    } else {
      void commit([{ site: padSite, value: padNumber }]);
    }
  };

  const title = step === "pad" ? "Type a tape" : step === "saved" ? "Taped" : "New tape";
  const ghostButton = {
    ...DISPLAY, flex: 1, fontSize: 14, fontWeight: 600, color: "var(--b-sub)", background: "var(--b-card2)",
    border: "1px solid var(--b-rule2)", borderRadius: 12, padding: 14, cursor: "pointer",
  } as const;

  return (
    <>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--b-rule2)", margin: "0 auto" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ ...DISPLAY, fontSize: 20, fontWeight: 700, color: "var(--b-ink)" }}>{title}</div>
            <div
              role="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 99, background: "var(--b-card2)", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--b-sub)", cursor: "pointer",
              }}
            >
              ✕
            </div>
          </div>

          {step === "mic" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "26px 0 10px" }}>
              <div
                role="button"
                aria-label="Finish listening"
                onClick={() => listener.finish()}
                style={{ position: "relative", width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                {!listener.busy && (
                  <>
                    <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "var(--b-rasp)", opacity: 0.5, animation: "body-ring 1.6s ease-out infinite" }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "var(--b-rasp)", opacity: 0.5, animation: "body-ring 1.6s ease-out infinite .5s" }} />
                  </>
                )}
                <div style={{ position: "relative", width: 96, height: 96, borderRadius: 99, background: "var(--b-rasp)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MicGlyph size={34} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22, marginTop: 22 }}>
                {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((delay) => (
                  <span
                    key={delay}
                    style={{
                      width: 4, background: "var(--b-rasp)", borderRadius: 2, height: "100%", transformOrigin: "bottom",
                      animation: listener.busy ? undefined : `body-vu .7s ease-in-out infinite ${delay}s`,
                      transform: listener.busy ? "scaleY(0.25)" : undefined,
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--b-ink)", marginTop: 16 }}>
                {listener.busy ? "Reading that back…" : "Listening…"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--b-faint)", marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>
                {nudge ?? (
                  <>
                    Say it like <span style={{ color: "var(--b-deep)", fontWeight: 600 }}>“waist 86.5”</span> — one site or the whole round.
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setNudge(null);
                  setPadVal("");
                  setStep("pad");
                }}
                style={{
                  ...DISPLAY, marginTop: 22, fontSize: 13, fontWeight: 600, color: "var(--b-sub)", background: "var(--b-card2)",
                  border: "1px solid var(--b-rule2)", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
                }}
              >
                Type instead
              </button>
            </div>
          )}

          {step === "parsed" && (
            <>
              <div style={{ fontSize: 13, color: "var(--b-faint)", marginTop: 14 }}>
                Heard <span style={{ color: "var(--b-ink)", fontStyle: "italic" }}>“{heard}”</span>
              </div>
              {parsed.map((reading) => {
                const last = lastOf(reading.site);
                const delta = last ? reading.value - last.value : null;
                const good = delta != null && delta < 0 && GOOD_DOWN.has(reading.site);
                return (
                  <div
                    key={reading.site}
                    role="button"
                    aria-label={`Edit ${siteLabel(reading.site)}`}
                    onClick={() => {
                      setEditing(reading.site);
                      setPadSite(reading.site);
                      setPadVal(String(reading.value));
                      setStep("pad");
                    }}
                    style={{
                      background: "var(--b-wash)", borderRadius: 18, padding: 18, marginTop: 12, cursor: "pointer",
                      animation: "body-pop .4s cubic-bezier(.22,.9,.3,1) both",
                    }}
                  >
                    <div style={{ ...KICKER, fontWeight: 700, color: "var(--b-deep)" }}>
                      {siteLabel(reading.site).toUpperCase()} · {dayLabel(today).toUpperCase()}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
                      <span style={{ ...DISPLAY, fontSize: 44, fontWeight: 700, color: "var(--b-ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                        {reading.value.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--b-faint)" }}>cm</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12.5, color: "var(--b-sub)" }}>
                      {last ? (
                        <>
                          <span>
                            was <strong style={{ color: "var(--b-ink)", fontWeight: 600 }}>{last.value.toFixed(1)}</strong> · {dayLabel(last.day)}
                          </span>
                          <span style={{ color: good ? "var(--b-green)" : "var(--b-sub)", fontWeight: 600 }}>
                            {Math.abs(delta as number) < 0.05 ? "±0 cm" : `${signed(delta as number, Math.abs(delta as number).toFixed(1))} cm`}
                          </span>
                        </>
                      ) : (
                        <span>first tape for this site</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => {
                    setNudge(null);
                    setStep("mic");
                    setTake((t) => t + 1);
                  }}
                  style={ghostButton}
                >
                  Again
                </button>
                <button
                  onClick={() => {
                    const first = parsed[0];
                    setEditing(first.site);
                    setPadSite(first.site);
                    setPadVal(String(first.value));
                    setStep("pad");
                  }}
                  style={ghostButton}
                >
                  Edit
                </button>
                <button
                  onClick={() => void commit(parsed)}
                  disabled={saving}
                  style={{ ...ghostButton, flex: 2, color: "#FFFFFF", background: "var(--b-rasp)", border: "none", opacity: saving ? 0.7 : 1 }}
                >
                  Save
                </button>
              </div>
            </>
          )}

          {step === "pad" && (
            <>
              <div className="body-noscroll" style={{ display: "flex", gap: 6, marginTop: 14, overflowX: "auto" }}>
                {TAPE_SITES.map((site) => (
                  <div
                    key={site.key}
                    role="button"
                    onClick={() => {
                      setPadSite(site.key);
                      if (!editing) setPadVal("");
                    }}
                    style={chipStyle(padSite === site.key)}
                  >
                    {site.label}
                  </div>
                ))}
              </div>
              {nudge && <div style={{ fontSize: 12, color: "var(--b-faint)", marginTop: 10 }}>{nudge}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, padding: "0 4px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span
                    style={{
                      ...DISPLAY, fontSize: 48, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, minWidth: 60,
                      color: padVal ? "var(--b-ink)" : "var(--b-ghost)",
                    }}
                  >
                    {padVal || "–"}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--b-faint)" }}>cm</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--b-faint)", textAlign: "right", lineHeight: 1.5 }}>
                  {padLast ? (
                    <>
                      last <strong style={{ color: "var(--b-ink)", fontWeight: 600 }}>{padLast.value.toFixed(1)} cm</strong>
                      <br />
                      {dayLabel(padLast.day)}
                    </>
                  ) : (
                    "not taped yet"
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 16 }}>
                {KEYS.map((key) => (
                  <div
                    key={key}
                    role="button"
                    aria-label={key === "⌫" ? "Delete" : key === "." ? "Decimal point" : key}
                    className="body-key"
                    onClick={() => setPadVal((v) => keypadPress(v, key))}
                    style={{
                      ...DISPLAY, height: 50, borderRadius: 12, background: "var(--b-card2)", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600,
                      color: "var(--b-ink)", cursor: "pointer", userSelect: "none",
                    }}
                  >
                    {key}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  aria-label="Say it instead"
                  onClick={() => {
                    setEditing(null);
                    setNudge(null);
                    setStep("mic");
                    setTake((t) => t + 1);
                  }}
                  style={{
                    width: 54, background: "var(--b-wash)", border: "none", borderRadius: 12, padding: 14,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <MicGlyph size={18} color="var(--b-deep)" />
                </button>
                <button
                  onClick={savePad}
                  disabled={saving}
                  style={{
                    ...DISPLAY, flex: 1, fontSize: 14, fontWeight: 600, color: "#FFFFFF", border: "none", borderRadius: 12,
                    padding: 14, cursor: padOk ? "pointer" : "default", transition: "background .25s",
                    background: padOk ? "var(--b-rasp)" : "var(--b-ghost)",
                  }}
                >
                  {padOk ? `${editing ? "Use" : "Save"} ${siteLabel(padSite).toLowerCase()}` : "Enter a number"}
                </button>
              </div>
            </>
          )}

          {step === "saved" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 0 16px" }}>
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle
                  cx="42" cy="42" r="38" fill="none" stroke="var(--b-rasp)" strokeWidth="3" strokeDasharray="239"
                  strokeDashoffset="239" transform="rotate(-90 42 42)"
                  style={{ animation: "body-draw .6s cubic-bezier(.4,0,.2,1) forwards" }}
                />
                <path
                  d="M26 43l11 11 21-23" fill="none" stroke="var(--b-rasp)" strokeWidth="4" strokeLinecap="round"
                  strokeLinejoin="round" strokeDasharray="50" strokeDashoffset="50"
                  style={{ animation: "body-draw .4s cubic-bezier(.4,0,.2,1) .45s forwards" }}
                />
              </svg>
              <div style={{ ...DISPLAY, fontSize: 20, fontWeight: 700, color: "var(--b-ink)", marginTop: 18, animation: "body-rise .4s ease both .5s" }}>
                {saved.length === 1
                  ? `${siteLabel(saved[0].site)} · ${saved[0].value.toFixed(1)} cm`
                  : `${saved.length} sites taped`}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--b-sub)", marginTop: 4, animation: "body-rise .4s ease both .6s" }}>
                {saved.length === 1 ? "Row updated · trend extended" : "Rows updated · trends extended"}
              </div>
            </div>
          )}
    </>
  );
}
