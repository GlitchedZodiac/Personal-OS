"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/pitaya-icons";
import { haptic } from "@/lib/haptics";
import { MAX_SHOTS, type Shot } from "@/lib/photo-capture";

// The thumbnail tray — every photo in the message about to be sent, each
// with its own ✕, followed by "Add another" (straight back into the camera)
// and "Library". Shared by the dock's capture sheet and the chat composer so
// the two can never drift apart.
//
// UNDESIGNED (PORT GATE, surfaced): the design has no multi-photo tray. The
// add tiles borrow the design's own dashed "+" tile verbatim (1.5px dashed
// #D9D7DC, 12px radius, raspberry on press) and the camera glyph is the
// design's; the library glyph is a plain stroke shape in the icon set's
// style, as it already was in the capture sheet.

export function LibraryGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 16l4.5-4.5 4 4 3-3L21 17" />
      <circle cx="9" cy="9.5" r="1.3" />
    </svg>
  );
}

interface PhotoTrayProps {
  shots: Shot[];
  max?: number;
  /** a photo is still being read off the camera roll */
  busy?: boolean;
  /** edge of one tile, css px */
  size?: number;
  /** one scrolling row (composer) or a wrapping grid (sheet) */
  layout?: "row" | "wrap";
  onRemove: (id: string) => void;
  onAddCamera: () => void;
  onAddLibrary: () => void;
}

const LEAVE_MS = 180;

export function PhotoTray({
  shots,
  max = MAX_SHOTS,
  busy = false,
  size = 70,
  layout = "wrap",
  onRemove,
  onAddCamera,
  onAddLibrary,
}: PhotoTrayProps) {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const count = shots.length;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // A new frame lands at the END of the row — bring it into view, or the
  // sixth photo appears to do nothing on a narrow phone.
  useEffect(() => {
    const row = rowRef.current;
    if (layout === "row" && row) row.scrollTo({ left: row.scrollWidth, behavior: "smooth" });
  }, [count, busy, layout]);

  const remove = (id: string) => {
    haptic("light");
    setLeaving((prev) => new Set(prev).add(id));
    timers.current.push(
      setTimeout(() => {
        onRemove(id);
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, LEAVE_MS)
    );
  };

  const full = count >= max;
  const box = { width: size, height: size };

  return (
    <div
      ref={rowRef}
      className={
        layout === "row"
          ? "-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 pt-2"
          : "flex flex-wrap gap-2 pt-2"
      }
    >
      {shots.map((shot, i) => {
        const out = leaving.has(shot.id);
        return (
          <div
            key={shot.id}
            className={`relative shrink-0 ${out ? "shot-out" : "shot-in"}`}
            style={{ ...box, ["--shot-size" as string]: `${size}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.thumb}
              alt={`Photo ${i + 1} of ${count}`}
              width={size}
              height={size}
              className="h-full w-full rounded-[12px] border border-[#E9CFDC] object-cover"
            />
            <button
              type="button"
              onClick={() => remove(shot.id)}
              aria-label={`Remove photo ${i + 1}`}
              className="tap-scale absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#232227] text-[11px] leading-none text-white shadow-[0_1px_4px_rgba(35,34,39,0.3)]"
            >
              ✕
            </button>
          </div>
        );
      })}

      {busy && (
        <div
          className="shot-in flex shrink-0 items-center justify-center rounded-[12px] border border-[#E9CFDC] bg-accent"
          style={box}
          aria-label="Reading photo"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#8C2F51] border-t-transparent" />
        </div>
      )}

      {!full && count > 0 && (
        <>
          <button
            type="button"
            onClick={onAddCamera}
            disabled={busy}
            className="tap-scale flex shrink-0 flex-col items-center justify-center gap-1 rounded-[12px] border-[1.5px] border-dashed border-[#D9D7DC] text-[#66646C] transition-colors active:border-primary active:text-[#8C2F51] disabled:opacity-50"
            style={box}
          >
            <CameraIcon size={19} />
            <span className="px-1 text-center text-[9.5px] font-semibold leading-[1.15]">
              Add another
            </span>
          </button>
          <button
            type="button"
            onClick={onAddLibrary}
            disabled={busy}
            className="tap-scale flex shrink-0 flex-col items-center justify-center gap-1 rounded-[12px] border-[1.5px] border-dashed border-[#D9D7DC] text-[#66646C] transition-colors active:border-primary active:text-[#8C2F51] disabled:opacity-50"
            style={box}
          >
            <LibraryGlyph size={19} />
            <span className="px-1 text-center text-[9.5px] font-semibold leading-[1.15]">
              Library
            </span>
          </button>
        </>
      )}

      {full && (
        <div
          className="flex shrink-0 items-center px-1 text-[10.5px] font-semibold leading-tight text-muted-foreground"
          style={{ height: size }}
        >
          {max} of {max}
          <br />
          that&apos;s a full send
        </div>
      )}
    </div>
  );
}
