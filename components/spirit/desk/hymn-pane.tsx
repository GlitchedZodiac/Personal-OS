"use client";

// V3 §9 — the Sunday desk's hymn pane: a pane class like Bible/Notebook.
// Header: PANE · HYMN ⇄ · ‹ › walk tonight's set in order · title ⌄ opens the
// picker (search + TONIGHT'S SET, the Bible navigator's manners) · READ-ONLY
// badge. aA lives in the footer. No ink over hymns — it's for singing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaneHeader, Popover, Kicker, Chip, DISPLAY } from "./ui";
import { HymnReader } from "@/components/spirit/hymn-reader";
import { searchHymns } from "@/lib/hymn-search";
import { haptic } from "@/lib/haptics";

interface Row { id: string; title: string; firstLine: string; body: string; hasPhoto: boolean }

const SET_KEY = "spirit-hymn-set"; // tonight's set — per device, like a paper insert

export function HymnPane({ onKicker, hymnId, onHymnChange }: {
  onKicker?: () => void;
  /** the tab remembers which hymn this pane was on */
  hymnId?: string | null;
  onHymnChange?: (id: string | null) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [current, setCurrent] = useState<{ id: string; title: string; body: string; photoData: string | null } | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState("");
  const [setIds, setSetIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(SET_KEY) ?? "[]"); } catch { return []; }
  });
  const [size, setSize] = useState<number>(() => {
    if (typeof window === "undefined") return 19;
    const n = Number(localStorage.getItem("spirit-hymn-size"));
    return n >= 14 && n <= 26 ? n : 19;
  });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/spirit/hymns?withBody=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows((d?.hymns ?? []) as Row[]))
      .catch(() => {});
  }, []);

  const openHymn = useCallback(async (id: string) => {
    if (loadedFor.current === id) return;
    loadedFor.current = id;
    try {
      const r = await fetch(`/api/spirit/hymns/${id}`);
      if (!r.ok) return;
      const d = (await r.json()).hymn;
      setCurrent({ id: d.id, title: d.title, body: d.body, photoData: d.photoData ?? null });
      onHymnChange?.(d.id);
    } catch { /* offline without cache — the picker still lists */ }
  }, [onHymnChange]);

  // the tab's remembered hymn, or the first of tonight's set, or the first hymn
  useEffect(() => {
    if (current) return;
    const want = hymnId ?? setIds[0] ?? rows[0]?.id;
    if (!want) return;
    // a timer, not a direct call — the state lands from the callback, never the effect body
    const t = setTimeout(() => void openHymn(want), 0);
    return () => clearTimeout(t);
  }, [hymnId, setIds, rows, current, openHymn]);

  const toggleSet = (id: string) => {
    setSetIds((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      try { localStorage.setItem(SET_KEY, JSON.stringify(next)); } catch { /* per-device */ }
      return next;
    });
    haptic("selection");
  };
  const setRows_ = useMemo(() => setIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => Boolean(r)), [setIds, rows]);
  const setPos = current ? setIds.indexOf(current.id) : -1;
  const stepSet = (dir: -1 | 1) => {
    if (!setIds.length) return;
    const next = setPos < 0 ? (dir === 1 ? 0 : setIds.length - 1) : (setPos + dir + setIds.length) % setIds.length;
    void openHymn(setIds[next]);
    haptic("selection");
  };

  const hits = useMemo(() => {
    const found = searchHymns(rows, q);
    const map = new Map(found.map((h) => [h.id, h]));
    return rows.filter((r) => map.has(r.id));
  }, [rows, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#FFFDF9" }}>
      <PaneHeader
        kicker="PANE · HYMN"
        onKicker={onKicker}
        title={current?.title ?? (rows.length ? "Pick a hymn" : "The himnario is empty")}
        onTitle={() => { haptic("selection"); setPickOpen((v) => !v); }}
        titleGlyph={"⌄"}
        titleHint="Search, or tonight's set"
        pre={
          <button type="button" onClick={() => stepSet(-1)} disabled={!setIds.length} title="Previous in tonight's set" style={{ width: 22, height: 22, flex: "none", borderRadius: 99, border: "1px solid #E4E2E6", background: "#FFFFFF", color: setIds.length ? "#454349" : "#D9D7DC", fontSize: 12, cursor: setIds.length ? "pointer" : "default", padding: 0 }}>‹</button>
        }
        right={<Chip tone="outline" style={{ letterSpacing: "0.08em" }}>READ-ONLY</Chip>}
      >
        <button type="button" onClick={() => stepSet(1)} disabled={!setIds.length} title="Next in tonight's set" style={{ width: 22, height: 22, flex: "none", borderRadius: 99, border: "1px solid #E4E2E6", background: "#FFFFFF", color: setIds.length ? "#454349" : "#D9D7DC", fontSize: 12, cursor: setIds.length ? "pointer" : "default", padding: 0 }}>›</button>
        {setPos >= 0 && <span style={{ fontSize: 9.5, color: "#A9A7AE", whiteSpace: "nowrap" }}>{setPos + 1} of {setIds.length} tonight</span>}
        {pickOpen && (
          <Popover width={300} onClose={() => setPickOpen(false)} style={{ left: -40, top: 26 }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="a line you remember…"
              style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: 9, border: "1px solid #E4E2E6", padding: "0 11px", fontSize: 12, fontFamily: "var(--font-body)", color: "#232227", outline: "none" }}
            />
            {setRows_.length > 0 && !q && (
              <>
                <Kicker style={{ display: "block", marginTop: 9 }}>TONIGHT&apos;S SET</Kicker>
                {setRows_.map((r, i) => (
                  <button key={r.id} type="button" onClick={() => { setPickOpen(false); void openHymn(r.id); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 5, padding: "7px 9px", borderRadius: 9, cursor: "pointer", background: current?.id === r.id ? "#F6E3EB" : "transparent", boxShadow: "inset 0 0 0 1px #F2F1F2", border: 0, textAlign: "left" }}>
                    <span style={{ flex: "none", fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, color: "#A63D63" }}>{i + 1}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "#232227", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  </button>
                ))}
              </>
            )}
            <Kicker style={{ display: "block", marginTop: 9 }}>{q ? "MATCHES" : "THE HIMNARIO"}</Kicker>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {hits.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
                  <button type="button" onClick={() => { setPickOpen(false); void openHymn(r.id); }} style={{ flex: 1, minWidth: 0, display: "block", padding: "7px 9px", borderRadius: 9, cursor: "pointer", background: current?.id === r.id ? "#F6E3EB" : "transparent", border: 0, textAlign: "left" }}>
                    <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#232227", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                    <span style={{ display: "block", fontSize: 9.5, color: "#A9A7AE", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.firstLine}</span>
                  </button>
                  <button type="button" title={setIds.includes(r.id) ? "Out of tonight's set" : "Into tonight's set"} onClick={() => toggleSet(r.id)} style={{ flex: "none", width: 26, height: 26, borderRadius: 99, border: 0, cursor: "pointer", fontSize: 11, background: setIds.includes(r.id) ? "#F6E3EB" : "transparent", color: setIds.includes(r.id) ? "#8C2F51" : "#C9C7CD" }}>
                    {setIds.includes(r.id) ? "♪" : "+"}
                  </button>
                </div>
              ))}
              {!hits.length && <div style={{ fontSize: 10.5, color: "#A9A7AE", padding: "8px 2px" }}>nothing matches — the library page can add it</div>}
            </div>
          </Popover>
        )}
      </PaneHeader>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 22px" }}>
        {current ? (
          <HymnReader title={current.title} body={current.body} photoData={current.photoData} baseSize={size} />
        ) : (
          <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: "#96949B" }}>
            {rows.length ? "Pick a hymn from the title menu ⌄" : "Nothing here yet — add hymns on the library page, or just tell Claude one."}
          </div>
        )}
      </div>

      {/* §9 — aA in the FOOTER */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 6px", borderTop: "1px solid #F2F1F2", background: "#FFFDF9" }}>
        <span style={{ fontSize: 8.5, color: "#A9A7AE" }}>lines never fold — long ones shrink</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "#96949B", fontFamily: "var(--font-serif)" }}>aA</span>
        {[16, 19, 22].map((n) => (
          <button key={n} type="button" onClick={() => { setSize(n); try { localStorage.setItem("spirit-hymn-size", String(n)); } catch { /* per-device */ } }} style={{ width: 26, height: 22, borderRadius: 99, border: 0, cursor: "pointer", fontSize: 8 + (n - 16) / 2, fontFamily: "var(--font-serif)", background: size === n ? "#A63D63" : "#F2F1F2", color: size === n ? "#FFFFFF" : "#66646C" }}>A</button>
        ))}
      </div>
    </div>
  );
}
