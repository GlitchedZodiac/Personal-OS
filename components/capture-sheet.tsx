"use client";

import { CameraIcon, MicIcon } from "@/components/pitaya-icons";
import { LibraryGlyph, PhotoTray } from "@/components/photo-tray";
import { SheetPortal } from "@/components/sheet-portal";
import { MAX_SHOTS, type Shot } from "@/lib/photo-capture";
import { usePresence, useScrollLock } from "@/lib/use-presence";

// The dock's "Add photos" sheet: photos (camera or library, several) plus a
// typed or spoken note, handed to the chat as ONE message.
//
// BUG 1 (2026-10-04) lived here. The sheet used to be rendered INSIDE the
// dock's wrapper — the element that slides away when the page scrolls down.
// Tapping the note field raised the keyboard, iOS scrolled the page to
// reveal the field, the dock read that scroll as "he's reading, get out of
// the way", and took the sheet with it: faded to nothing, shifted 240 px,
// and no longer anchored to the screen at all (a transformed ancestor
// becomes the containing block for `position: fixed`). He was typing into a
// field that had left the screen.
//
// So the sheet now:
//   · portals to <body> — nothing the dock does can reach it;
//   · sits at the bottom of a .vv-frame — the rectangle above the keyboard,
//     wherever WebKit panned to — so it rides directly on top of the keys;
//   · scrolls inside itself when the visible strip is shorter than it is;
//   · locks the page behind it, so there is nothing left to scroll away.

interface CaptureSheetProps {
  open: boolean;
  shots: Shot[];
  note: string;
  /** photos are being read / compressed */
  reading: boolean;
  recording: boolean;
  transcribing: boolean;
  onNoteChange: (value: string) => void;
  onAddCamera: () => void;
  onAddLibrary: () => void;
  onRemove: (id: string) => void;
  onToggleDictation: () => void;
  /** tap outside — put the sheet away, keep what's in it */
  onDismiss: () => void;
  /** Cancel — discard the capture */
  onCancel: () => void;
  onSend: () => void;
}

const EXIT_MS = 240;

export function CaptureSheet({
  open,
  shots,
  note,
  reading,
  recording,
  transcribing,
  onNoteChange,
  onAddCamera,
  onAddLibrary,
  onRemove,
  onToggleDictation,
  onDismiss,
  onCancel,
  onSend,
}: CaptureSheetProps) {
  const { mounted, closing } = usePresence(open, EXIT_MS);
  useScrollLock(mounted);
  if (!mounted) return null;

  const count = shots.length;
  const atMax = count >= MAX_SHOTS;

  return (
    <SheetPortal>
      {/* The scrim covers the whole layout viewport, so no sliver of the
          page shows while WebKit pans; the sheet itself lives in the frame. */}
      <div
        className={`fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)] ${closing ? "scrim-out" : "scrim-in"}`}
        onClick={onDismiss}
      />
      <div className="vv-frame pointer-events-none z-[81] flex flex-col justify-end">
        {/* iOS 26 draws the page on past the visual viewport, underneath its
            translucent keyboard accessory. Without this, a strip of the
            screen behind showed between the sheet and the keys. */}
        <div
          aria-hidden
          className={`absolute inset-x-0 top-full h-[260px] bg-card ${closing ? "scrim-out" : "scrim-in"}`}
        />
        <div
          role="dialog"
          aria-label="Add photos"
          className={`pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-card px-6 pb-10 pt-6 [html[data-keyboard=open]_&]:pb-4 [html[data-keyboard=open]_&]:pt-4 ${
            closing ? "sheet-down" : "sheet-up"
          }`}
        >
          <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border [html[data-keyboard=open]_&]:mb-3" />
          <div className="flex items-baseline justify-between gap-3">
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Add photos
            </p>
            {count > 0 && (
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {count} of {MAX_SHOTS}
              </span>
            )}
          </div>
          {/* Room is tight above a keyboard — the explanation yields first. */}
          <p className="mt-1 text-xs text-muted-foreground [html[data-keyboard=open]_&]:hidden">
            A plate, a label, a receipt — several at once. Say or type what
            they are and the chat proposes each action.
          </p>

          {count > 0 || reading ? (
            <div className="mt-2">
              <PhotoTray
                shots={shots}
                busy={reading}
                onRemove={onRemove}
                onAddCamera={onAddCamera}
                onAddLibrary={onAddLibrary}
              />
            </div>
          ) : (
            <div className="mt-3.5 flex gap-2.5">
              <button
                type="button"
                onClick={onAddCamera}
                disabled={atMax || reading}
                className="tap-scale flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#D9D7DC] py-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <CameraIcon size={17} /> Take photo
              </button>
              <button
                type="button"
                onClick={onAddLibrary}
                disabled={atMax || reading}
                className="tap-scale flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#D9D7DC] py-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <LibraryGlyph /> Library
              </button>
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={2}
              enterKeyHint="done"
              placeholder={
                transcribing
                  ? "Transcribing…"
                  : "e.g. I had 2.5 servings of this — save it as a usual"
              }
              className="min-h-[52px] flex-1 resize-none rounded-[12px] border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#DCA8BE]"
            />
            <button
              type="button"
              onClick={onToggleDictation}
              disabled={transcribing}
              aria-label={recording ? "Stop dictating" : "Dictate a note"}
              aria-pressed={recording}
              className={`tap-scale flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition-colors ${
                recording ? "mic-halo" : ""
              }`}
              style={{ background: recording ? "#A63D63" : "#F6E3EB" }}
            >
              {transcribing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#8C2F51] border-t-transparent" />
              ) : (
                <MicIcon size={20} color={recording ? "#FFFFFF" : "#8C2F51"} />
              )}
            </button>
          </div>

          <div className="mt-4 flex gap-2.5 [html[data-keyboard=open]_&]:mt-3">
            <button
              type="button"
              onClick={onCancel}
              className="tap-scale flex-1 rounded-[12px] border border-[#D9D7DC] py-3 text-[13.5px] font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={count === 0 || reading}
              className="tap-scale flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {reading
                ? "Reading…"
                : count > 0
                  ? `Send ${count} photo${count === 1 ? "" : "s"}`
                  : "Send"}
            </button>
          </div>
        </div>
      </div>
    </SheetPortal>
  );
}
