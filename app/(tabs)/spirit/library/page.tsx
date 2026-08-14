"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SpiritSourceSheet } from "@/components/spirit-source-sheet";

// The Library — every quotable source, on one shelf. This is the whole
// point of retrieval-never-recall: if it isn't here, no teaching may
// quote it. The shelf grows by curation (public domain only), never by
// generation. (No design slice yet — built in-system, flagged for
// design round 3.)

interface Source {
  key: string;
  title: string;
  meta: string;
  excerpt: string;
  cited: number;
}

export default function SpiritLibraryPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spirit/source")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSources(d?.sources ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="push-in stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/spirit")}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            THE ONLY QUOTABLE SOURCES
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Library
          </div>
        </div>
        {sources && (
          <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <p className="mt-3.5 text-[12px] leading-[1.65] text-[#66646C]">
        Every quotation in every teaching taps through to a text on this shelf —
        nothing is ever quoted from memory. Where the shelf is silent, the
        teachings speak in their own words and cite nothing.
      </p>

      {!sources && (
        <p className="mt-10 text-center text-[12.5px] text-muted-foreground">
          Pulling the shelf…
        </p>
      )}

      <div className="mt-4 grid gap-2.5">
        {sources?.map((s) => (
          <button
            key={s.key}
            onClick={() => setOpenKey(s.key)}
            className="tap-scale rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
          >
            <div className="flex items-center justify-between">
              <p
                className="text-[14.5px] font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.title}
              </p>
              {s.cited > 0 && (
                <span className="rounded-full bg-accent px-2 py-[2px] text-[9.5px] font-semibold text-[#8C2F51]">
                  cited ×{s.cited}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.meta}</p>
            <p className="mt-2 text-[12px] italic leading-[1.6] text-[#66646C]">
              “{s.excerpt}…”
            </p>
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
        The shelf grows by curation — public domain only, added deliberately.
        <br />
        Calvin, Henry complete, and the confessions are queued for the library block.
      </p>

      <SpiritSourceSheet sourceKey={openKey} onClose={() => setOpenKey(null)} />
    </div>
  );
}
