"use client";

// Anything said, typed or photographed OUTSIDE the chat screen lands in the
// chat thread. Two paths, one shape:
//
//   already on /chat  → a "pitaya:chat-send" window event
//   on another tab    → stash here, navigate, and the chat screen takes it
//
// The stash is a module variable first and sessionStorage second. It used to
// be sessionStorage alone. Storage is quota'd (~5 MB, and engines differ on
// whether that counts bytes or UTF-16 units) while six photos are up to
// ~2.6 M characters of base64 — too close to the edge to trust, and the old
// caller cleared the capture sheet BEFORE writing, so a quota throw would
// have lost the photos with nothing sent. (Hardening from reading the code;
// not a failure anyone reported.) Client navigation never unloads this
// module, so memory is both safe and free; sessionStorage stays only as the
// survive-a-reload copy for plain text, and for callers that still write the
// key directly (components/activity-detail.tsx).

export interface ChatHandOff {
  text?: string;
  source?: string;
  photos?: { images: string[]; thumbs: string[] };
}

export const HANDOFF_EVENT = "pitaya:chat-send";
const STORAGE_KEY = "pitaya:pending-chat";

let pending: ChatHandOff | null = null;

export function stashChatHandOff(detail: ChatHandOff) {
  pending = detail;
  if (detail.photos) return; // never push frames through storage
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // the in-memory copy is the one that matters
  }
}

/** Returns the waiting hand-off, if any, and clears it. */
export function takeChatHandOff(): ChatHandOff | null {
  const fromMemory = pending;
  pending = null;
  let fromStorage: ChatHandOff | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      sessionStorage.removeItem(STORAGE_KEY);
      fromStorage = JSON.parse(raw) as ChatHandOff;
    }
  } catch {
    // malformed or unavailable — ignore
  }
  return fromMemory ?? fromStorage;
}
