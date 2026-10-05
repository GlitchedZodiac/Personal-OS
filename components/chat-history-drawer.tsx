"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarIcon, JournalIcon, SearchIcon } from "@/components/pitaya-icons";
import { RangePicker } from "@/components/range-picker";
import { SheetPortal } from "@/components/sheet-portal";
import {
  buildSnippet,
  groupByRecency,
  rowStamp,
  type ConversationSummary,
} from "@/lib/chat-history";
import { haptic } from "@/lib/haptics";
import { usePresence } from "@/lib/use-presence";

// Chat history — the shelf behind the ☰ on the chat screen: every chat,
// grouped Today / This week / Last week / Last month / Older in the
// DEVICE's timezone, with search and a from–to range.
//
// UNDESIGNED (PORT GATE, surfaced): the design has no chat-history surface.
// This is assembled from the design's own parts rather than invented:
//   · the header is the History push-in's (micro-label, 26px title, a count
//     pill in the tint) — entering from the left instead of the right,
//     because it is a drawer over the chat, not a screen after it;
//   · the search field is the Spirit search field, verbatim (white, 12px
//     radius, hairline, the design's magnifier);
//   · the range pill and its calendar glyph are Food → History's, and the
//     picker is the shared RangePicker sheet;
//   · each shelf is the BY DAY card (white, 18px radius, micro-label head,
//     #F2F1F2 row rules).
// Rename uses the design's pencil (the Journal glyph).

interface ChatHistoryDrawerProps {
  open: boolean;
  /** the chat currently on screen, if any */
  activeId: string | null;
  /** bump to refetch — a chat was born or renamed outside the drawer */
  version: number;
  onClose: () => void;
  onOpenChat: (conversation: ConversationSummary) => void;
  onNewChat: () => void;
  onRenamed: (conversation: ConversationSummary) => void;
}

const EXIT_MS = 220;

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ChatHistoryDrawer({
  open,
  activeId,
  version,
  onClose,
  onOpenChat,
  onNewChat,
  onRenamed,
}: ChatHistoryDrawerProps) {
  const { mounted, closing } = usePresence(open, EXIT_MS);

  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  // The shelf opens on everything. A search or a range left over from the
  // last visit would make it look as though chats had gone missing — so
  // they are put away once the drawer has finished closing.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => {
      setQuery("");
      setDebounced("");
      setRange({ from: null, to: null });
      setEditing(null);
      setPickerOpen(false);
      setDragX(0);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ tz: timeZone });
    if (debounced) params.set("q", debounced);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    fetch(`/api/ai/chat/conversations?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { conversations?: ConversationSummary[] }) => {
        setList(d.conversations ?? []);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [open, debounced, range, version, timeZone]);

  // `now` is read when the list arrives, so "Today" is today as of this
  // look at the shelf — not as of whenever the screen was first mounted.
  const groups = useMemo(
    () => (list ? groupByRecency(list, new Date(), timeZone) : []),
    [list, timeZone]
  );

  if (!mounted) return null;

  const filtered = Boolean(debounced || range.from);
  const rangeLabel =
    range.from && range.to
      ? range.from === range.to
        ? shortDay(range.from)
        : `${shortDay(range.from)} – ${shortDay(range.to)}`
      : "Any date";

  const commitRename = async (conversation: ConversationSummary) => {
    const title = editValue.trim();
    setEditing(null);
    if (title === conversation.title) return;
    try {
      const res = await fetch(`/api/ai/chat/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.conversation) throw new Error();
      const renamed = body.conversation as ConversationSummary;
      setList((prev) =>
        prev ? prev.map((c) => (c.id === renamed.id ? { ...c, ...renamed, snippet: c.snippet } : c)) : prev
      );
      onRenamed(renamed);
      haptic("light");
    } catch {
      toast.error("Couldn't rename that chat.");
    }
  };

  // Drag the drawer shut. Only a clearly horizontal, leftward drag takes
  // over — a vertical one is him scrolling the shelf.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (!d.active && dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.3) d.active = true;
    if (d.active) setDragX(Math.min(0, dx));
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.active && dragX < -72) {
      onClose(); // the exit animation starts from where his finger left it
    } else {
      setDragX(0);
    }
  };

  return (
    <SheetPortal>
      <div
        className={`fixed inset-0 z-[70] bg-[rgba(27,21,24,0.45)] ${closing ? "scrim-out" : "scrim-in"}`}
        onClick={onClose}
      />
      {/* A vv-frame, so the shelf stays above the keyboard while he searches. */}
      <div className="vv-frame pointer-events-none z-[71]">
        <aside
          role="dialog"
          aria-label="Chat history"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className={`pointer-events-auto absolute inset-y-0 left-0 flex w-[88%] max-w-[380px] flex-col bg-background shadow-[8px_0_40px_rgba(35,34,39,0.18)] ${
            closing ? "drawer-out" : "drawer-in"
          }`}
          style={{
            ["--drag-x" as string]: `${dragX}px`,
            transform: dragX ? `translate3d(${dragX}px,0,0)` : undefined,
            transition: drag.current?.active ? "none" : "transform .22s cubic-bezier(.3,.9,.3,1)",
          }}
        >
          {/* the drawer's own paper, continued under the keyboard's
              translucent accessory (same reason as the capture sheet) */}
          <div aria-hidden className="absolute inset-x-0 top-full h-[260px] bg-background" />
          <div className="shrink-0 px-[18px] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chat history"
                className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white"
              >
                <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
                  CHAT · HISTORY
                </div>
                <div
                  className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Chats
                </div>
              </div>
              {list && (
                <div className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold tabular-nums text-[#8C2F51]">
                  {list.length} {filtered ? "found" : list.length === 1 ? "chat" : "chats"}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                haptic("light");
                onNewChat();
              }}
              className="tap-scale mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-primary py-[11px] text-[13px] font-semibold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="text-[16px] leading-none">+</span> New chat
            </button>

            <label className="mt-3 flex items-center gap-[9px] rounded-[12px] border border-[#E4E2E6] bg-white px-3.5 py-[11px] transition-colors focus-within:border-[#DCA8BE]">
              <SearchIcon size={14} className="flex-none text-[#96949B]" />
              <input
                type="text"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything you've said and logged…"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-[#96949B]"
                style={{ fontSize: "12.5px" }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#E4E2E6] text-[10px] leading-none text-[#66646C]"
                >
                  ✕
                </button>
              )}
            </label>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={`tap-scale flex items-center gap-1.5 rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold text-[#8C2F51] transition-colors ${
                  range.from ? "border-[#E9CFDC] bg-accent" : "border-[#E4E2E6] bg-white"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                <CalendarIcon size={12} />
                {rangeLabel} ▾
              </button>
              {range.from && (
                <button
                  type="button"
                  onClick={() => setRange({ from: null, to: null })}
                  className="text-[11px] font-semibold text-muted-foreground underline-offset-2 active:underline"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
            {failed && (
              <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] text-muted-foreground">
                Couldn&apos;t load your chats. Close this and open it again.
              </div>
            )}

            {!failed && list === null && (
              <div className="space-y-3" aria-label="Loading chats">
                {[0, 1].map((i) => (
                  <div key={i} className="h-[112px] animate-pulse rounded-[18px] bg-white/70" />
                ))}
              </div>
            )}

            {!failed && list !== null && list.length === 0 && (
              <div className="fade-up rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] p-3.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
                {filtered ? (
                  <>
                    Nothing here
                    {debounced ? (
                      <>
                        {" "}
                        for <span className="font-semibold text-foreground">“{debounced}”</span>
                      </>
                    ) : null}
                    {range.from ? " in that range" : ""}.
                  </>
                ) : (
                  <>No chats yet — the first thing you say starts one.</>
                )}
              </div>
            )}

            <div className="stagger-children space-y-3">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-[18px] bg-white shadow-[0_2px_12px_rgba(35,34,39,0.06)]"
                >
                  <h2 className="px-4 pb-1.5 pt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                    {group.label.toUpperCase()}
                  </h2>
                  {group.items.map((conversation) => {
                    const active = conversation.id === activeId;
                    const snippet = debounced
                      ? buildSnippet(conversation.snippet ?? conversation.title, debounced)
                      : null;
                    const isEditing = editing === conversation.id;
                    return (
                      <div
                        key={conversation.id}
                        className={`flex items-stretch border-t border-[#F2F1F2] transition-colors ${
                          active ? "bg-[#FBF1F5]" : ""
                        }`}
                      >
                        {isEditing ? (
                          <form
                            className="min-w-0 flex-1 px-4 py-2.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename(conversation);
                            }}
                          >
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitRename(conversation)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditing(null);
                              }}
                              maxLength={80}
                              enterKeyHint="done"
                              aria-label="Chat title"
                              className="w-full rounded-[9px] border border-[#DCA8BE] bg-white px-2.5 py-[7px] font-semibold text-foreground outline-none"
                              style={{ fontSize: "13.5px" }}
                            />
                            <p className="mt-1 text-[10.5px] text-muted-foreground">
                              Return to save · leave it empty to let the app name it
                            </p>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              haptic("selection");
                              onOpenChat(conversation);
                            }}
                            aria-current={active ? "true" : undefined}
                            className="min-w-0 flex-1 px-4 py-3 text-left active:bg-[#FAF9FA]"
                          >
                            <div className="flex items-baseline justify-between gap-2.5">
                              <span className="flex min-w-0 items-center gap-1.5">
                                {active && (
                                  <span className="pitaya-diamond flex-none" aria-hidden />
                                )}
                                <span className="truncate text-[13px] font-semibold text-foreground">
                                  {conversation.title || "Untitled chat"}
                                </span>
                              </span>
                              <span className="flex-none text-[10.5px] tabular-nums text-muted-foreground">
                                {rowStamp(conversation.lastMessageAt, new Date(), timeZone)}
                              </span>
                            </div>
                            <div className="mt-[3px] truncate text-[11px] text-muted-foreground">
                              {snippet ? (
                                <>
                                  {snippet.before}
                                  <mark className="rounded-[3px] bg-accent px-[2px] font-semibold text-[#8C2F51]">
                                    {snippet.match}
                                  </mark>
                                  {snippet.after}
                                </>
                              ) : (
                                <>
                                  {conversation.messageCount}{" "}
                                  {conversation.messageCount === 1 ? "message" : "messages"}
                                </>
                              )}
                            </div>
                          </button>
                        )}
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditValue(conversation.title);
                              setEditing(conversation.id);
                            }}
                            aria-label={`Rename “${conversation.title}”`}
                            className="flex w-11 flex-none items-center justify-center text-[#B9B7BE] active:text-[#8C2F51]"
                          >
                            <JournalIcon size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>

            {list !== null && list.length > 0 && !filtered && (
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Every chat is kept. Shelves follow this device&apos;s clock.
              </p>
            )}
          </div>
        </aside>
      </div>

      <RangePicker
        open={pickerOpen}
        title="Chat history — range"
        from={range.from}
        to={range.to}
        onCancel={() => setPickerOpen(false)}
        onApply={(from, to) => {
          setRange({ from, to });
          setPickerOpen(false);
        }}
      />
    </SheetPortal>
  );
}
