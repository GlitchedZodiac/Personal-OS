"use client";

import { PitayaLogo } from "@/components/pitaya-icons";

// Placeholder (Michael, 2026-08-11): Spirit takes Body's tab slot — the
// morning routine's spiritual side (Bible reading, prayer, the emotional
// check-in) gets designed before it gets built. Body remains reachable
// from Today's weight card.

export default function SpiritPage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-8 pb-32 pt-12 text-center">
      <PitayaLogo size={64} />
      <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
        SPIRIT
      </p>
      <h1
        className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        This space is being prepared
      </h1>
      <p className="mt-2.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        Bible reading, prayer, and the morning&apos;s quiet start will live here —
        designed first, then built.
      </p>
    </div>
  );
}
