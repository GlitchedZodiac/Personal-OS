"use client";

import { useEffect, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";

// The citation sheet — every quotation in a teaching taps through to its
// REAL stored source (design: "Source reader"). Retrieval, never recall.

export function SpiritSourceSheet({
  sourceKey,
  onClose,
}: {
  sourceKey: string | null;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<{ title: string; meta: string; body: string } | null>(null);

  useEffect(() => {
    if (!sourceKey) {
      setDoc(null);
      return;
    }
    fetch(`/api/spirit/source?key=${encodeURIComponent(sourceKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [sourceKey]);

  if (!sourceKey) return null;

  return (
    <SheetPortal>
      <div className="fixed inset-0 z-[88] bg-[rgba(27,21,24,0.45)]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[89] rounded-t-[28px] bg-white px-6 pb-9 pt-6 sheet-up">
        <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-[#E4E2E6]" />
        <p className="text-[10px] font-bold tracking-[0.16em] text-[#8C2F51]">
          FROM YOUR LIBRARY · THE REAL SOURCE
        </p>
        <p
          className="mt-1.5 text-[19px] font-bold text-[#232227]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {doc?.title ?? "…"}
        </p>
        <p className="mt-[3px] text-[11px] text-muted-foreground">{doc?.meta ?? ""}</p>
        <div className="mt-3.5 rounded-[14px] bg-[#FAF9FA] p-4 text-[13.5px] italic leading-[1.8] text-[#454349]">
          {doc?.body ?? ""}
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <a
            href="/spirit/library"
            className="rounded-full border border-[#E4E2E6] bg-[#FAF9FA] px-3 py-[5px] text-[11px] font-semibold text-[#8C2F51] hover:bg-accent"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Open the library ›
          </a>
          <button
            onClick={onClose}
            className="rounded-[10px] border border-[#E4E2E6] px-5 py-2 text-[12.5px] font-semibold text-[#66646C] hover:bg-[#FAF9FA]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Close
          </button>
        </div>
      </div>
    </SheetPortal>
  );
}
