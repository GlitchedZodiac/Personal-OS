"use client";

import { PitayaLogo } from "@/components/pitaya-icons";

// Placeholder (Michael, 2026-08-11): Journal takes Train's tab slot — a
// proper journal beyond Tonight's Page. Train remains reachable from
// Today's TRAIN card.

export default function JournalPage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-8 pb-32 pt-12 text-center">
      <PitayaLogo size={64} />
      <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
        JOURNAL
      </p>
      <h1
        className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        This space is being prepared
      </h1>
      <p className="mt-2.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        The full journal — pages, photos, and the story of the days — will live
        here. Tonight&apos;s Page keeps working on Today meanwhile.
      </p>
    </div>
  );
}
