"use client";

// The proposal cards: Sunday's closing card (6b) and the page-close
// transcribe card (8c) — same shape, smaller. Keep / edit / discard per
// reference, nothing saves until Confirm.

import { useState } from "react";
import { DISPLAY } from "./ui";
import { CheckIcon } from "./desk-icons";

export interface ProposalRef {
  raw: string;
  label: string;
  refStart: number;
  refEnd: number;
  context: string;
  suggestedAction: "connection" | "question" | "none";
  reason: string;
  proposal: string;
  alreadyCard?: boolean;
}

export interface Proposal {
  pageId: string;
  text: string;
  refs: ProposalRef[];
  summary: { bigIdea: string | null; points: string[]; quotes: string[]; questions: string[] };
  series?: { id: string; title: string; weekIndex: number | null; weekTitle: string | null; current: boolean } | null;
}

export function ClosingCard({
  proposal,
  variant,
  pageLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  proposal: Proposal;
  variant: "sermon" | "page";
  pageLabel: string;
  onConfirm: (payload: { text: string; refs: { refStart: number; refEnd: number; label: string; action: "connection" | "question" | "card" | "none"; context: string }[]; questions: string[] }) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  // 1 keep · 0 discard · 2 undecided (keeps as the suggested action)
  const [keep, setKeep] = useState<number[]>(proposal.refs.map(() => 2));
  const [expanded, setExpanded] = useState(false);
  const [actions, setActions] = useState<("connection" | "question" | "card")[]>(
    proposal.refs.map((r) => (r.suggestedAction === "connection" ? "connection" : r.suggestedAction === "question" ? "question" : "card")),
  );
  const kept = keep.filter((k) => k !== 0).length;
  const verb = (a: string) => (a === "connection" ? "keep as Connection" : a === "question" ? "keep as Question" : "keep");
  const confirm = () => {
    onConfirm({
      text: proposal.text,
      refs: proposal.refs.map((r, i) => ({ refStart: r.refStart, refEnd: r.refEnd, label: r.label, action: keep[i] === 0 ? "none" : actions[i], context: r.context })),
      questions: variant === "sermon" ? proposal.summary.questions.slice(0, 3) : [],
    });
  };
  const small = variant === "page";
  return (
    <div className="desk-page-in" style={{ background: "#FFFFFF", borderRadius: small ? 16 : 18, boxShadow: small ? "0 12px 40px rgba(0,0,0,0.25)" : "0 16px 48px rgba(0,0,0,0.28)", padding: small ? "15px 17px" : 18, width: small ? 430 : 420, maxWidth: "94vw", maxHeight: "86vh", overflowY: "auto", animation: "fadeUp .25s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: small ? 30 : 34, height: small ? 30 : 34, borderRadius: "50%", background: "#F6E3EB", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <CheckIcon size={small ? 13 : 15} />
        </div>
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: small ? 14 : 16, fontWeight: 700, color: "#232227" }}>{variant === "sermon" ? "Closing Sunday's page" : "Here is what I read"}</div>
          <div style={{ fontSize: small ? 10 : 10.5, color: "#96949B", marginTop: 1 }}>{variant === "sermon" ? "here is what I read — nothing saves until you confirm" : `${pageLabel} — keep, edit or discard`}</div>
        </div>
      </div>
      <div style={{ background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 11, padding: "10px 12px", marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: "0.13em", fontWeight: 700, color: "#96949B" }}>TRANSCRIBED · HIDDEN TEXT LAYER</span>
          <button type="button" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>{expanded ? "collapse" : "expand"}</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#66646C", lineHeight: 1.55, marginTop: 5, whiteSpace: "pre-wrap", maxHeight: expanded ? 320 : 64, overflow: "hidden" }}>
          {proposal.text ? `"${proposal.text.replace(/\n+/g, " · ")}"` : "— nothing legible on the page yet —"}
        </div>
      </div>
      <div style={{ fontSize: 9, letterSpacing: "0.13em", fontWeight: 700, color: "#96949B", marginTop: 12 }}>REFERENCES FOUND · {proposal.refs.length}</div>
      {proposal.refs.length === 0 && <div style={{ fontSize: 11, color: "#A9A7AE", marginTop: 6 }}>none this time</div>}
      {proposal.refs.map((r, i) => {
        const k = keep[i];
        return (
          <div key={`${r.refStart}-${i}`} style={{ border: "1px solid #EDEBEE", borderRadius: 11, padding: "10px 12px", marginTop: 7, background: k === 1 ? "#FAFDFB" : k === 0 ? "#FAF9FA" : "#FFFFFF", transition: "background .25s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, color: "#8C2F51" }}>{r.label}</span>
              <span style={{ fontSize: 10.5, color: "#66646C", minWidth: 0, flex: 1 }}>{r.context ? `written beside "${r.context}"` : r.reason}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#96949B" }}>→ {r.alreadyCard && actions[i] === "card" ? "already on the page as a card — nothing new" : r.proposal}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setKeep((s) => s.map((v, j) => (j === i ? (v === 1 ? 2 : 1) : v)))} style={{ fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "3.5px 11px", cursor: "pointer", border: 0, background: k === 1 ? "#EAF3ED" : "#A63D63", color: k === 1 ? "#3E7A54" : "#FFFFFF" }}>
                {k === 1 ? "✓ " : ""}{verb(actions[i])}
              </button>
              <button
                type="button"
                onClick={() => setActions((a) => a.map((v, j) => (j === i ? (v === "connection" ? "question" : v === "question" ? "card" : "connection") : v)))}
                style={{ fontSize: 10, fontWeight: 600, color: "#66646C", border: "1px solid #E4E2E6", borderRadius: 99, padding: "3.5px 11px", cursor: "pointer", background: "#FFFFFF" }}
                title="cycle: Connection → Question → card"
              >
                edit
              </button>
              <button type="button" onClick={() => setKeep((s) => s.map((v, j) => (j === i ? (v === 0 ? 2 : 0) : v)))} style={{ fontSize: 10, fontWeight: 600, borderRadius: 99, padding: "3.5px 11px", cursor: "pointer", border: `1px solid ${k === 0 ? "#B4533F" : "#E4E2E6"}`, color: k === 0 ? "#B4533F" : "#96949B", background: k === 0 ? "#B4533F14" : "#FFFFFF" }}>
                discard
              </button>
            </div>
          </div>
        );
      })}
      {variant === "sermon" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 10, padding: "8px 11px" }}>
            <div style={{ fontSize: 8.5, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>OUTLINE KEPT</div>
            <div style={{ fontSize: 10.5, color: "#454349", marginTop: 3 }}>
              {proposal.summary.bigIdea ? "Big idea" : "no big idea read"}
              {proposal.summary.points.length ? ` + ${proposal.summary.points.length} point${proposal.summary.points.length === 1 ? "" : "s"}` : ""}
              {proposal.summary.quotes.length ? ` · ${proposal.summary.quotes.length} quote${proposal.summary.quotes.length === 1 ? "" : "s"}` : ""}
            </div>
          </div>
          <div style={{ flex: 1, background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 10, padding: "8px 11px" }}>
            <div style={{ fontSize: 8.5, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>SERIES WEEK</div>
            <div style={{ fontSize: 10.5, color: "#454349", marginTop: 3 }}>
              {proposal.series ? `wk ${proposal.series.weekIndex ?? "?"} marked preached · ${proposal.summary.questions.length} question${proposal.summary.questions.length === 1 ? "" : "s"} carried` : "no series running"}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 9, marginTop: small ? 10 : 14, alignItems: "center" }}>
        {small && <span style={{ fontSize: 9.5, color: "#A9A7AE", flex: 1 }}>&quot;show text&quot; stays off — handwriting remains handwriting</span>}
        <button type="button" disabled={busy} onClick={confirm} style={{ flex: small ? "none" : 1.6, background: "#A63D63", color: "#FFFFFF", borderRadius: small ? 9 : 11, padding: small ? "7px 14px" : "12px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: small ? 11 : 13, fontWeight: 600, cursor: "pointer", border: 0, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Keeping…" : small ? `Keep ${kept} · close` : `Confirm — keep ${kept} of ${proposal.refs.length}`}
        </button>
        {!small && (
          <button type="button" onClick={onCancel} style={{ flex: 1, border: "1px solid #D9D7DC", borderRadius: 11, padding: "12px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#66646C", cursor: "pointer", background: "#FFFFFF" }}>
            Not yet
          </button>
        )}
        {small && (
          <button type="button" onClick={onCancel} style={{ fontSize: 10.5, fontWeight: 600, color: "#66646C", background: "none", border: 0, cursor: "pointer" }}>not yet</button>
        )}
      </div>
      {!small && <div style={{ fontSize: 9.5, color: "#A9A7AE", marginTop: 9, textAlign: "center" }}>the AI&apos;s only new behavior — a proposal he accepts, never an autosave of its interpretation</div>}
    </div>
  );
}
