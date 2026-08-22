"use client";

// In-app confirm / prompt for the desk. window.confirm and window.prompt are
// silently answered "no" inside the companion's WKWebView (no UI delegate
// handler) and look foreign everywhere else. One host, mounted once in the
// desk layout; callers await askConfirm / askPrompt from anywhere.

import { useCallback, useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { DISPLAY } from "./ui";

export interface ConfirmOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
export interface PromptOpts {
  title: string;
  body?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
}
type Req =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

let listener: ((r: Req) => void) | null = null;

export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (listener) listener({ kind: "confirm", opts, resolve });
    else resolve(typeof window !== "undefined" ? window.confirm(`${opts.title}${opts.body ? `\n\n${opts.body}` : ""}`) : false);
  });
}
export function askPrompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    if (listener) listener({ kind: "prompt", opts, resolve });
    else resolve(typeof window !== "undefined" ? window.prompt(opts.title, opts.value ?? "") : null);
  });
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState("");
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    listener = (r) => {
      setValue(r.kind === "prompt" ? (r.opts.value ?? "") : "");
      setClosing(false);
      setReq(r);
      if (r.kind === "confirm" && r.opts.danger) haptic("warning");
      else haptic("selection");
    };
    return () => {
      listener = null;
    };
  }, []);
  const finish = useCallback(
    (result: boolean | string | null) => {
      if (!req) return;
      setClosing(true);
      setTimeout(() => {
        if (req.kind === "confirm") req.resolve(Boolean(result));
        else req.resolve(typeof result === "string" ? result : null);
        setReq(null);
        setClosing(false);
      }, 140);
    },
    [req],
  );
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(req.kind === "confirm" ? false : null);
      if (e.key === "Enter" && req.kind === "prompt") finish(value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, value, finish]);
  if (!req) return null;
  const danger = req.kind === "confirm" && req.opts.danger;
  return (
    <div role="dialog" aria-modal="true" onPointerDown={(e) => { if (e.target === e.currentTarget) finish(req.kind === "confirm" ? false : null); }} style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(35,34,39,0.28)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: `${closing ? "deskFadeOut" : "deskFadeIn"} .16s ease both` }}>
      <div style={{ width: 360, maxWidth: "calc(100vw - 40px)", background: "#FFFFFF", borderRadius: 20, boxShadow: "0 28px 80px rgba(20,15,18,0.35)", padding: "20px 20px 16px", animation: `${closing ? "deskPopOut" : "deskPopIn"} .22s cubic-bezier(.2,.9,.3,1.15) both` }}>
        {danger && <div style={{ fontSize: 9.5, letterSpacing: "0.16em", fontWeight: 700, color: "#B4533F", marginBottom: 6 }}>THIS CANNOT BE UNDONE</div>}
        <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: "#232227", letterSpacing: "-0.01em" }}>{req.opts.title}</div>
        {req.opts.body && <div style={{ fontSize: 12.5, color: "#66646C", lineHeight: 1.55, marginTop: 6 }}>{req.opts.body}</div>}
        {req.kind === "prompt" && (
          <input
            autoFocus
            value={value}
            placeholder={req.opts.placeholder}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 12, fontSize: 14, padding: "10px 12px", border: "1px solid #E4E2E6", borderRadius: 11, outline: "none", fontFamily: "var(--font-body)" }}
          />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={() => finish(req.kind === "confirm" ? false : null)} style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#454349", background: "#FFFFFF", border: "1px solid #E4E2E6", borderRadius: 99, padding: "9px 16px", cursor: "pointer" }}>
            {(req.kind === "confirm" && req.opts.cancelLabel) || "Cancel"}
          </button>
          <button type="button" autoFocus={req.kind === "confirm"} onClick={() => finish(req.kind === "confirm" ? true : value)} style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#FFFFFF", background: danger ? "#B4533F" : "#A63D63", border: 0, borderRadius: 99, padding: "9px 18px", cursor: "pointer" }}>
            {req.opts.confirmLabel ?? (req.kind === "confirm" ? (danger ? "Delete" : "OK") : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
