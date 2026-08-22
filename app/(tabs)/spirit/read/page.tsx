"use client";

import { useState } from "react";
import { SpiritReader } from "@/components/spirit/reader";
import { PhoneOverlayHost } from "@/components/spirit/phone-overlay";

// The phone Reader — a thin wrapper since 2026-08-22; the component lives in
// components/spirit/reader.tsx so the iPad desk can host it as a pane. The
// iPad's overlay ink reads back here, read-only, with an INK ON toggle (5d).
export default function SpiritReaderPage() {
  const [chapterKey, setChapterKey] = useState<number | null>(null);
  return (
    <PhoneOverlayHost chapterKey={chapterKey}>
      <SpiritReader onChapterChange={(ck) => setChapterKey(ck)} />
    </PhoneOverlayHost>
  );
}
