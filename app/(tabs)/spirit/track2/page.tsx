"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReaderPrefs } from "@/lib/spirit-theme";

// Track 2 — the whole Bible, quietly. Berean Standard Bible (public
// domain), one chapter at a time, in canon order. No layer, no marks,
// no debt: it never competes with the term and never counts against
// him — it only ever ADDS coverage to the Transcript.

type Block =
  | { kind: "heading"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "verse"; number: number; text: string; poem: boolean };

interface T2Data {
  position: number;
  total: number;
  done: boolean;
  next: { book: number; chapter: number; label: string } | null;
  blocks?: Block[];
  attribution?: string;
  textError?: string;
}

export default function SpiritTrack2Page() {
  const router = useRouter();
  const { prefs, tokens: T, fontSize, fontFamily } = useReaderPrefs();
  const [data, setData] = useState<T2Data | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/spirit/track2?text=1")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const markRead = async () => {
    if (busy || !data?.next) return;
    setBusy(true);
    try {
      const res = await fetch("/api/spirit/track2", { method: "POST" });
      if (res.ok) {
        window.scrollTo({ top: 0 });
        setData(null);
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const isDark = prefs.theme !== "light";
  const chipAccentBg = isDark ? "#3A2B33" : "#F6E3EB";
  const chipAccentFg = isDark ? "#DCA8BE" : "#8C2F51";

  return (
    <div
      className="push-in min-h-screen px-[22px] pb-52 pt-12 transition-colors duration-300 lg:px-8"
      style={{ background: T.bg }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/spirit")}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border"
          style={{ background: T.card, borderColor: T.rule }}
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none" style={{ color: T.ink }}>‹</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em]" style={{ color: T.faint }}>
            TRACK 2 · THE WHOLE BIBLE, QUIETLY
          </div>
          <div
            className="truncate text-[26px] font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)", color: T.ink }}
          >
            {data?.done ? "Every chapter." : data?.next?.label ?? "…"}
          </div>
        </div>
        {data && (
          <span
            className="flex-none rounded-full px-[11px] py-[5px] text-[11px] font-semibold tabular-nums"
            style={{ background: chipAccentBg, color: chipAccentFg }}
          >
            {data.position} of {data.total}
          </span>
        )}
      </div>

      {data && (
        <div className="mt-3 h-[5px] overflow-hidden rounded-full" style={{ background: T.rule }}>
          <div
            className="h-full rounded-full bg-[#C97D9C] transition-all duration-700"
            style={{ width: `${Math.max(0.5, (data.position / data.total) * 100)}%` }}
          />
        </div>
      )}

      {data?.textError && (
        <p className="mt-8 text-center text-[12.5px] leading-[1.6]" style={{ color: T.faint }}>
          {data.textError}
        </p>
      )}

      {data?.done && (
        <div className="mt-6 rounded-[20px] p-6 text-center" style={{ background: T.card, boxShadow: T.shadow }}>
          <p className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)", color: T.ink }}>
            All 1,189 chapters. Quietly.
          </p>
          <p className="mt-2 text-[12.5px]" style={{ color: T.sub }}>
            The track starts over whenever you like — coverage only ever deepens.
          </p>
        </div>
      )}

      {data?.blocks && (
        <div className="mt-3 rounded-[18px] px-4 py-4" style={{ background: T.card, boxShadow: T.shadow }}>
          {data.blocks.map((b, i) =>
            b.kind === "heading" ? (
              <p
                key={i}
                className="border-b px-1 pb-2.5 pt-3 text-[12px] italic leading-[1.6]"
                style={{ fontFamily: "var(--font-serif)", color: T.faint, borderColor: T.rule }}
              >
                {b.text}
              </p>
            ) : b.kind === "subtitle" ? (
              <p key={i} className="px-1 pb-1 pt-1.5 text-[12px] italic" style={{ fontFamily: "var(--font-serif)", color: T.faint }}>
                {b.text}
              </p>
            ) : (
              <p
                key={i}
                className="px-1 py-[3px] leading-[1.75]"
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  color: T.ink,
                  paddingLeft: b.poem ? "1.5em" : undefined,
                  textIndent: b.poem ? "-1.1em" : undefined,
                }}
              >
                <span
                  className="mr-1.5 align-super text-[10px] font-bold"
                  style={{ fontFamily: "var(--font-display)", color: "#C97D9C" }}
                >
                  {b.number}
                </span>
                {b.text}
              </p>
            ),
          )}
        </div>
      )}

      {data?.next && !data.textError && (
        <button
          onClick={markRead}
          disabled={busy || !data.blocks}
          className="tap-scale mt-3.5 w-full rounded-xl bg-[#C97D9C] py-[13px] text-[13.5px] font-semibold text-white transition-colors hover:bg-[#A63D63] disabled:opacity-60"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {busy ? "…" : `${data.next.label} read → next chapter`}
        </button>
      )}

      <p className="mt-3 text-center text-[10.5px] leading-[1.6]" style={{ color: T.faint }}>
        {data?.attribution ?? "Berean Standard Bible · public domain"}
        <br />
        runs beside the term · adds to your Transcript · never counts against you
      </p>
    </div>
  );
}
