"use client";

// V3 §9 — the himnario. Search reads every line of every stanza, accents
// forgiven, and shows the matched line under the title. "Add a hymn" leads
// with the camera (Photograph the pliego), then Paste, then Type. The confirm
// step is the honest moment: one card per hymn found, flagged with what the
// camera knows it missed; duplicates offer Replace / Append / Skip; nothing
// joins the library until "Add to the himnario". The photo is kept forever.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HymnReader } from "@/components/spirit/hymn-reader";
import { searchHymns, guessLang, fold } from "@/lib/hymn-search";
import { DISPLAY, cardShadow, Kicker } from "@/components/spirit/desk/ui";
import { ArmTwice } from "@/components/spirit/desk/patterns";
import { toast } from "sonner";

interface Row { id: string; title: string; firstLine: string; body: string; hasPhoto: boolean; updatedAt: string }

interface ProposalCard {
  key: string;
  title: string;
  body: string;
  partial: boolean;
  /** duplicate handling when a library hymn already wears this title */
  dupeOf: Row | null;
  dupeAction: "replace" | "append" | "skip";
}

async function compressImage(file: File, maxWidth = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function HymnsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [openFull, setOpenFull] = useState<{ body: string; photoData: string | null } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<null | "paste" | "type">(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [reading, setReading] = useState(false);
  const [proposal, setProposal] = useState<{ cards: ProposalCard[]; confident: boolean; photo: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/spirit/hymns?withBody=1");
      if (!r.ok) return;
      setRows(((await r.json()).hymns ?? []) as Row[]);
      setLoaded(true);
    } catch { /* offline — the cached list still renders via SW */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const hits = useMemo(() => {
    const found = searchHymns(rows, q);
    const map = new Map(found.map((h) => [h.id, h]));
    return rows.filter((r) => map.has(r.id)).map((r) => ({ row: r, hit: map.get(r.id)! }));
  }, [rows, q]);

  const openHymn = async (r: Row) => {
    setOpen(r);
    setOpenFull(null);
    const res = await fetch(`/api/spirit/hymns/${r.id}`);
    if (res.ok) {
      const d = (await res.json()).hymn;
      setOpenFull({ body: d.body, photoData: d.photoData ?? null });
    }
  };

  const onPhoto = async (file: File) => {
    setAddOpen(false);
    setReading(true);
    try {
      const img = await compressImage(file);
      const r = await fetch("/api/spirit/hymns/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [img] }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const hymns = (d.proposal?.hymns ?? []) as { title: string; body: string; partial: boolean }[];
      if (!hymns.length) { toast("Couldn't find a hymn on that sheet — try a straighter shot."); return; }
      const cards: ProposalCard[] = hymns.map((h, i) => {
        const dupe = h.title ? rows.find((x) => fold(x.title) === fold(h.title)) ?? null : null;
        return { key: `p${i}`, title: h.title, body: h.body, partial: h.partial, dupeOf: dupe, dupeAction: dupe ? "replace" : "skip" };
      });
      setProposal({ cards, confident: d.proposal?.confident !== false, photo: img });
    } catch {
      toast.error("Couldn't read the sheet.");
    } finally {
      setReading(false);
    }
  };

  const confirmProposal = async () => {
    if (!proposal) return;
    let added = 0;
    for (const c of proposal.cards) {
      const title = c.title.trim() || "Untitled hymn";
      const body = c.body.trim();
      if (!body) continue;
      if (c.dupeOf) {
        if (c.dupeAction === "skip") continue;
        if (c.dupeAction === "replace") {
          // old text goes, the photo stays (and gains this sheet)
          await fetch(`/api/spirit/hymns/${c.dupeOf.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, photoData: proposal.photo }) });
          added++;
          continue;
        }
        // append: a second version under the same roof
        await fetch(`/api/spirit/hymns/${c.dupeOf.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: `${c.dupeOf.body}\n\n${body}` }) });
        added++;
        continue;
      }
      const r = await fetch("/api/spirit/hymns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, photoData: proposal.photo }) });
      if (r.ok) added++;
    }
    setProposal(null);
    await load();
    toast.success(`${added} hymn${added === 1 ? "" : "s"} in the himnario.`);
  };

  const saveTyped = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) { toast("A title and the words — both."); return; }
    const r = await fetch("/api/spirit/hymns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draftTitle.trim(), body: draftBody }) });
    if (!r.ok) { toast.error("Couldn't save it."); return; }
    setAddMode(null);
    setDraftTitle("");
    setDraftBody("");
    await load();
    toast.success("In the himnario.");
  };

  const card: React.CSSProperties = { background: "#FFFFFF", borderRadius: 14, boxShadow: cardShadow, padding: "13px 15px" };

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: "var(--font-body)", overflow: "auto" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "calc(28px + env(safe-area-inset-top, 0px)) 22px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/home" style={{ width: 32, height: 32, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "#8C2F51" }}>‹</Link>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", fontWeight: 700, color: "#96949B" }}>SPIRIT · HIMNARIO</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: "#232227" }}>Hymns</div>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="desk-pulse" onClick={() => setAddOpen(true)} style={{ height: 40, padding: "0 18px", borderRadius: 12, fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>
            Add a hymn
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="a line you remember — accents don't matter"
          style={{ width: "100%", boxSizing: "border-box", marginTop: 16, height: 44, borderRadius: 12, border: "1px solid #E4E2E6", background: "#FFFFFF", padding: "0 15px", fontSize: 13.5, fontFamily: "var(--font-body)", color: "#232227", outline: "none" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 16 }}>
          {hits.map(({ row, hit }) => (
            <button key={row.id} type="button" onClick={() => void openHymn(row)} className="desk-lift" style={{ ...card, textAlign: "left", border: 0, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 700, color: "#232227", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                <span style={{ flex: 1 }} />
                <span style={{ flex: "none", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#66646C", background: "#F2F1F2", borderRadius: 99, padding: "2px 7px" }}>{guessLang(row.body).toUpperCase()}</span>
                {row.hasPhoto && <span style={{ flex: "none", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "2px 7px" }}>PLIEGO</span>}
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 12.5, fontStyle: "italic", color: "#66646C", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {hit.line && !hit.titleHit ? hit.line : row.firstLine}
              </div>
              {hit.line && !hit.titleHit && <div style={{ fontSize: 9, color: "#A9A7AE", marginTop: 2 }}>matched line</div>}
            </button>
          ))}
          {loaded && !rows.length && (
            <div style={{ ...card, gridColumn: "1 / -1", textAlign: "center", color: "#96949B", fontSize: 12.5, padding: "34px 20px" }}>
              The himnario is empty — photograph a pliego, paste, or type the first one.
              You can also just tell Claude a hymn; it lands here.
            </div>
          )}
          {loaded && rows.length > 0 && !hits.length && (
            <div style={{ ...card, gridColumn: "1 / -1", textAlign: "center", color: "#96949B", fontSize: 12.5 }}>No line matches “{q}”.</div>
          )}
        </div>
      </div>

      {/* the open hymn — the reader */}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(20,15,18,0.4)", display: "flex", justifyContent: "center", overflowY: "auto", padding: "34px 16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 96vw)", height: "fit-content", background: "#FFFDF9", borderRadius: 18, boxShadow: "0 24px 80px rgba(20,15,18,0.35)", padding: "20px 26px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Kicker>HYMN · READ-ONLY</Kicker>
              <span style={{ flex: 1 }} />
              <ArmTwice
                onConfirm={async () => { await fetch(`/api/spirit/hymns/${open.id}`, { method: "DELETE" }); setOpen(null); await load(); toast("Hymn moved to the trash."); }}
                title="Delete this hymn"
                armedTitle="tap again"
                style={{ height: 26, padding: "0 10px", borderRadius: 99, fontSize: 9.5, fontWeight: 700, color: "#B4533F", background: "#FFFFFF", border: "1px solid #EDEBEE" }}
                armedChildren={<>DELETE?</>}
              >
                DELETE
              </ArmTwice>
              <button type="button" onClick={() => setOpen(null)} style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid #E4E2E6", background: "#FFFFFF", color: "#96949B", cursor: "pointer" }}>✕</button>
            </div>
            <HymnReader title={open.title} body={openFull?.body ?? open.body} photoData={openFull?.photoData} />
          </div>
        </div>
      )}

      {/* add chooser */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(20,15,18,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 340, background: "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 70px rgba(20,15,18,0.3)", padding: 16 }}>
            <Kicker>ADD A HYMN</Kicker>
            <button type="button" onClick={() => fileRef.current?.click()} style={{ display: "block", width: "100%", marginTop: 10, height: 46, borderRadius: 12, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>
              Photograph the pliego
            </button>
            <button type="button" onClick={() => { setAddOpen(false); setAddMode("paste"); }} style={{ display: "block", width: "100%", marginTop: 7, height: 42, borderRadius: 12, fontSize: 12.5, fontWeight: 600, color: "#232227", background: "#FAF9FA", border: "1px solid #EDEBEE", cursor: "pointer" }}>
              Paste the text <span style={{ fontSize: 10, color: "#96949B" }}>· line breaks kept</span>
            </button>
            <button type="button" onClick={() => { setAddOpen(false); setAddMode("type"); }} style={{ display: "block", width: "100%", marginTop: 7, height: 42, borderRadius: 12, fontSize: 12.5, fontWeight: 600, color: "#232227", background: "#FAF9FA", border: "1px solid #EDEBEE", cursor: "pointer" }}>
              Type it <span style={{ fontSize: 10, color: "#96949B" }}>· Coro: marks the chorus</span>
            </button>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }} />

      {/* paste / type editor */}
      {addMode && (
        <div onClick={() => setAddMode(null)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(20,15,18,0.4)", display: "flex", justifyContent: "center", overflowY: "auto", padding: "30px 16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 96vw)", height: "fit-content", background: "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 70px rgba(20,15,18,0.3)", padding: 18 }}>
            <Kicker>{addMode === "paste" ? "PASTE THE TEXT" : "TYPE THE HYMN"}</Kicker>
            <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title — as printed" style={{ width: "100%", boxSizing: "border-box", marginTop: 10, height: 40, borderRadius: 10, border: "1px solid #E4E2E6", padding: "0 12px", fontSize: 13, fontFamily: DISPLAY, fontWeight: 600, color: "#232227", outline: "none" }} />
            <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder={"First stanza line by line…\n\nCoro:\nthe chorus\n\nSecond stanza…"} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 240, borderRadius: 10, border: "1px solid #E4E2E6", padding: 12, fontSize: 13, fontFamily: "var(--font-serif)", lineHeight: 1.6, color: "#232227", outline: "none", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => setAddMode(null)} style={{ fontSize: 11, color: "#96949B", background: "none", border: 0, cursor: "pointer" }}>not now</button>
              <button type="button" onClick={() => void saveTyped()} style={{ height: 38, padding: "0 16px", borderRadius: 10, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>Add to the himnario</button>
            </div>
          </div>
        </div>
      )}

      {/* reading state */}
      {reading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(20,15,18,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "16px 22px", fontSize: 13, fontWeight: 600, color: "#232227", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            Reading the pliego…
          </div>
        </div>
      )}

      {/* the confirm step — the honest moment */}
      {proposal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 97, background: "rgba(20,15,18,0.5)", display: "flex", justifyContent: "center", overflowY: "auto", padding: "28px 16px" }}>
          <div style={{ width: "min(640px, 96vw)", height: "fit-content", background: "#F2F1F2", borderRadius: 18, boxShadow: "0 24px 80px rgba(20,15,18,0.4)", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Kicker>THE CAMERA FOUND {proposal.cards.length} HYMN{proposal.cards.length === 1 ? "" : "S"}</Kicker>
              <span style={{ flex: 1 }} />
              {!proposal.confident && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8C6B1F", background: "#F5E9CF", borderRadius: 99, padding: "3px 9px" }}>READ IT CLOSELY — THE CAMERA WASN'T SURE</span>}
            </div>
            {proposal.cards.map((c, i) => (
              <div key={c.key} style={{ marginTop: 12, background: "#FFFFFF", borderRadius: 14, boxShadow: cardShadow, padding: "13px 15px" }}>
                <input
                  value={c.title}
                  placeholder="Title — as printed (or name it yourself)"
                  onChange={(e) => setProposal((p) => p ? { ...p, cards: p.cards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) } : p)}
                  style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: 9, border: "1px solid #E4E2E6", padding: "0 10px", fontSize: 13, fontFamily: DISPLAY, fontWeight: 700, color: "#232227", outline: "none" }}
                />
                {c.partial && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8C6B1F", background: "#F5E9CF", borderRadius: 99, padding: "3px 9px" }}>PART OF THIS HYMN RUNS OFF THE PAGE EDGE</span>
                    <button type="button" onClick={() => fileRef.current?.click()} style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", border: 0, borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>↻ Rescan the rest</button>
                    <span style={{ fontSize: 9.5, color: "#A9A7AE" }}>or type the tail below</span>
                  </div>
                )}
                {c.dupeOf && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                    <span style={{ fontSize: 9.5, color: "#66646C" }}>already in the himnario —</span>
                    {(["replace", "append", "skip"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setProposal((p) => p ? { ...p, cards: p.cards.map((x, j) => (j === i ? { ...x, dupeAction: a } : x)) } : p)} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", borderRadius: 99, padding: "4px 11px", border: 0, cursor: "pointer", background: c.dupeAction === a ? "#232227" : "#F2F1F2", color: c.dupeAction === a ? "#FFFFFF" : "#66646C" }}>
                        {a === "replace" ? "Replace" : a === "append" ? "Append" : "Skip"}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={c.body}
                  onChange={(e) => setProposal((p) => p ? { ...p, cards: p.cards.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) } : p)}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 150, borderRadius: 10, border: "1px solid #EDEBEE", padding: 11, fontSize: 12.5, fontFamily: "var(--font-serif)", lineHeight: 1.6, color: "#232227", outline: "none", resize: "vertical", background: "#FFFDF9" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 9.5, color: "#A9A7AE" }}>tap any line to fix it · the photo is kept as the source of truth</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setProposal(null)} style={{ fontSize: 11, color: "#96949B", background: "none", border: 0, cursor: "pointer" }}>not now</button>
              <button type="button" onClick={() => void confirmProposal()} style={{ height: 40, padding: "0 18px", borderRadius: 11, fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>
                Add to the himnario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
