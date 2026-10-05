"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";
import { type BodyTheme, DISPLAY, KICKER } from "@/components/body/theme";
import { dayLabel } from "@/lib/body-view";
import { haptic } from "@/lib/haptics";
import type { ExtractedReport, ReviewGroup } from "@/lib/scale-report";

// "Add report" — give Pitaya the RENPHO report and it reads everything off it.
//
// Not in the Body design: added on his ask (2026-10-05), after the direct
// RENPHO pull turned out to sign his phone out. It wears the design's sheet,
// type and colours, and keeps the app's rule: the app reads and proposes, he
// checks the numbers against the page and confirms, and only then is anything
// saved. A PDF carries its text and is read exactly; a picture is read by
// eye, so the card says which it was and shows every number.

interface Proposal {
  day: string | null;
  time: string | null;
  measuredAt: string;
  count: number;
  groups: ReviewGroup[];
  warnings: string[];
  fromImage: boolean;
  match:
    | { kind: "join"; weightKg: number | null; source: string | null; adds: number; corrects: number }
    | { kind: "new" };
}

type Step = "pick" | "reading" | "review" | "saved";

const MAX_BYTES = 3_800_000;
const MAX_IMAGES = 4;

/** Shrink an oversized picture just enough to send. Never below ~2400px on
 *  the long side: at half that, a 5 was read as a 9. */
async function fitImage(file: File, budget: number): Promise<File> {
  if (file.size <= budget) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

export function ReportSheet({
  open,
  theme,
  onClose,
  onSaved,
}: {
  open: boolean;
  theme: BodyTheme;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Keyed remount per opening, so a new upload never shows the last one's card.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }

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
          aria-label="Add report"
          aria-hidden={!open}
          className="body-noscroll"
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 520,
            maxHeight: "88dvh", overflowY: "auto", background: "var(--b-card)", borderRadius: "28px 28px 0 0",
            padding: "12px 22px calc(40px + env(safe-area-inset-bottom))",
            transform: `translateY(${open ? "0%" : "110%"})`,
            transition: "transform .42s cubic-bezier(.32,.86,.3,1)", zIndex: 81,
            boxShadow: "0 -12px 40px rgba(0,0,0,.18)",
          }}
        >
          <ReportFlow key={opening} onClose={onClose} onSaved={onSaved} />
        </div>
      </div>
    </SheetPortal>
  );
}

function ReportFlow({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [problem, setProblem] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedReport | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tz = () => encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;
    const pdfs = chosen.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const images = chosen.filter((f) => f.type.startsWith("image/"));
    if (pdfs.length + images.length !== chosen.length || pdfs.length > 1 || (pdfs.length === 1 && images.length > 0)) {
      return setProblem("Choose the report PDF, or pictures of the report — not both.");
    }
    if (images.length > MAX_IMAGES) return setProblem(`Up to ${MAX_IMAGES} pictures of one report.`);

    setProblem(null);
    setStep("reading");
    try {
      const files = pdfs.length ? pdfs : await Promise.all(images.map((f) => fitImage(f, MAX_BYTES / images.length)));
      if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) {
        throw new Error("That is too large to send. A screenshot of the report works too.");
      }
      const form = new FormData();
      for (const file of files) form.append("file", file);
      const res = await fetch(`/api/health/body/report?tz=${tz()}`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn’t read that report.");
      setExtracted(json.extracted);
      setProposal(json.proposal);
      setStep("review");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn’t read that report.");
      setStep("pick");
    }
  };

  const save = async () => {
    if (!extracted || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/health/body/report?tz=${tz()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn’t save the report.");
      haptic("success");
      setStep("saved");
      onSaved();
      window.setTimeout(onClose, 1300);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn’t save the report.");
    } finally {
      setSaving(false);
    }
  };

  const button = {
    ...DISPLAY, fontSize: 14, fontWeight: 600, borderRadius: 12, padding: 14, cursor: "pointer",
  } as const;
  const ghost = { ...button, flex: 1, color: "var(--b-sub)", background: "var(--b-card2)", border: "1px solid var(--b-rule2)" } as const;
  const solid = { ...button, color: "#FFFFFF", background: "var(--b-rasp)", border: "none" } as const;

  // "09:58" → "9:58 AM", the way the weigh-in card writes a time.
  const clock = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  const when = proposal?.day
    ? `${dayLabel(proposal.day).toUpperCase()}${proposal.time ? ` · ${clock(proposal.time)}` : ""}`
    : "NO DATE ON THE REPORT";
  const nothingNew = proposal?.match.kind === "join" && proposal.match.adds === 0 && proposal.match.corrects === 0;
  const matchLine = !proposal
    ? ""
    : proposal.match.kind === "new"
      ? "No weigh-in is stored for that moment, so this becomes a new one."
      : nothingNew
        ? `Your ${proposal.match.weightKg?.toFixed(2)} kg weigh-in already holds every one of these numbers.`
        : `Joins your ${proposal.match.weightKg?.toFixed(2)} kg weigh-in: ${proposal.match.adds} new` +
          (proposal.match.corrects ? `, ${proposal.match.corrects} corrected` : "") +
          ".";

  return (
    <>
      <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--b-rule2)", margin: "0 auto" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <div style={{ ...DISPLAY, fontSize: 20, fontWeight: 700, color: "var(--b-ink)" }}>
          {step === "review" ? "Check the numbers" : step === "saved" ? "Saved" : "Add report"}
        </div>
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

      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        multiple
        onChange={read}
        style={{ display: "none" }}
        aria-label="Report file"
      />

      {step === "pick" && (
        <div style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--b-sub)" }}>
            In the Renpho app, open the weigh-in and share its report. Pitaya reads every number on it
            {" "}— composition, the five segments, impedance — and shows them to you before saving anything.
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--b-faint)", marginTop: 8 }}>
            The PDF is read exactly. A screenshot works when the numbers are sharp.
          </div>
          {problem && (
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--b-ink)", background: "var(--b-card2)", borderRadius: 12, padding: "10px 12px", marginTop: 12 }}>
              {problem}
            </div>
          )}
          <button onClick={() => input.current?.click()} style={{ ...solid, width: "100%", marginTop: 16 }}>
            Choose the report
          </button>
        </div>
      )}

      {step === "reading" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "34px 0 22px" }}>
          <span
            style={{
              width: 34, height: 34, borderRadius: 99, border: "3px solid var(--b-edge)", borderTopColor: "var(--b-rasp)",
              animation: "body-spin .8s linear infinite",
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--b-ink)", marginTop: 18 }}>Reading your report…</div>
          <div style={{ fontSize: 12.5, color: "var(--b-faint)", marginTop: 4 }}>About ten seconds.</div>
        </div>
      )}

      {step === "review" && proposal && (
        <>
          <div style={{ background: "var(--b-wash)", borderRadius: 18, padding: 16, marginTop: 14, animation: "body-pop .4s cubic-bezier(.22,.9,.3,1) both" }}>
            <div style={{ ...KICKER, fontWeight: 700, color: "var(--b-deep)" }}>RENPHO REPORT · {when}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--b-ink)", marginTop: 6 }}>{matchLine}</div>
          </div>

          {(proposal.warnings.length > 0 || proposal.fromImage) && (
            <div style={{ background: "var(--b-card2)", borderRadius: 12, padding: "10px 12px", marginTop: 10 }}>
              {proposal.warnings.map((w) => (
                <div key={w} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--b-ink)", padding: "2px 0" }}>{w}</div>
              ))}
              {proposal.fromImage && (
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--b-faint)", padding: "2px 0" }}>
                  Read from a picture — compare the numbers with the report. The PDF reads exactly.
                </div>
              )}
            </div>
          )}

          {proposal.groups.map((group) => (
            <div key={group.title} style={{ marginTop: 16 }}>
              <div style={{ ...KICKER, fontSize: 10 }}>{group.title}</div>
              {group.lines.map((line) => (
                <div
                  key={line.label}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--b-rule)" }}
                >
                  <div style={{ fontSize: 13, color: "var(--b-sub)", flex: "none" }}>{line.label}</div>
                  <div style={{ ...DISPLAY, fontSize: 14, fontWeight: 700, color: "var(--b-ink)", textAlign: "right" }}>{line.value}</div>
                </div>
              ))}
            </div>
          ))}

          {problem && <div style={{ fontSize: 12.5, color: "var(--b-ink)", marginTop: 12 }}>{problem}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={onClose} style={ghost}>
              Not right
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || nothingNew}
              style={{ ...solid, flex: 2, opacity: saving ? 0.7 : 1, background: nothingNew ? "var(--b-ghost)" : "var(--b-rasp)", cursor: nothingNew ? "default" : "pointer" }}
            >
              {nothingNew ? "Nothing new to save" : `Save ${proposal.count} readings`}
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
            Report saved
          </div>
          <div style={{ fontSize: 12.5, color: "var(--b-sub)", marginTop: 4, animation: "body-rise .4s ease both .6s" }}>
            {proposal ? `${proposal.count} readings · composition updated` : "Composition updated"}
          </div>
        </div>
      )}
    </>
  );
}
