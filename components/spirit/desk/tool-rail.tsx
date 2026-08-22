"use client";

// The notebook's tool rail (03) — on the seam edge for the free hand:
// pen · highlighter · pencil · marker · eraser · lasso │ T · ref-card ·
// photo · mic │ undo · redo │ SIZE · OPAC sliders · the color dot.
// Hold a tool → brush library; tap the dot → palette.

import { useRef } from "react";
import { useDesk, type PenTool } from "./desk-state";
import {
  EraserIcon,
  GPenIcon,
  HighlighterIcon,
  LassoIcon,
  MarkerIcon,
  MicIcon,
  PenIcon,
  PencilIcon,
  PhotoIcon,
  RedoIcon,
  RefCardIcon,
  TextToolIcon,
  UndoIcon,
} from "./desk-icons";

const Rule = () => <div style={{ width: 26, height: 1, background: "#E4E2E6", margin: "2px 0" }} />;
const Slider = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <>
    <span style={{ fontSize: 7.5, letterSpacing: "0.1em", color: "#C9C7CD" }}>{label}</span>
    <div
      style={{ width: 8, height: 56, borderRadius: 99, background: "#EDEBEE", position: "relative", cursor: "pointer", touchAction: "none" }}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent | React.PointerEvent) => {
          const r = el.getBoundingClientRect();
          const f = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
          onChange(f);
        };
        move(e);
        const mv = (ev: PointerEvent) => move(ev);
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: `${(1 - value) * 40}px`,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#FFFFFF",
          border: "1px solid #D9D7DC",
          boxShadow: "0 1px 4px rgba(35,34,39,0.15)",
        }}
      />
    </div>
  </>
);

export function ToolRail({
  side,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onText,
  onRefCard,
  onPhoto,
  onMic,
  micActive,
  compact,
}: {
  side: "left" | "right";
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onText?: () => void;
  onRefCard?: () => void;
  onPhoto?: () => void;
  onMic?: () => void;
  micActive?: boolean;
  compact?: boolean;
}) {
  const { pen, setPen, popover, setPopover } = useDesk();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tool = (t: PenTool) => {
    const on = pen.tool === t;
    return {
      onPointerDown: () => {
        holdTimer.current = setTimeout(() => {
          if (t === "fountain" || t === "gpen" || t === "pencil" || t === "marker") {
            setPen({ tool: t, brush: t });
            setPopover("brush");
          }
        }, 480);
      },
      onPointerUp: () => {
        if (holdTimer.current) clearTimeout(holdTimer.current);
      },
      onPointerLeave: () => {
        if (holdTimer.current) clearTimeout(holdTimer.current);
      },
      onClick: () => {
        if (t === "fountain" || t === "gpen" || t === "pencil" || t === "marker") setPen({ tool: t, brush: t });
        else setPen({ tool: t });
      },
      style: {
        width: compact ? 34 : 38,
        height: compact ? 34 : 38,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: on ? "#F6E3EB" : "transparent",
        boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none",
        border: 0,
        padding: 0,
      } as React.CSSProperties,
      color: on ? "#8C2F51" : "#66646C",
    };
  };
  const penBtn = tool(pen.brush === "gpen" ? "gpen" : pen.brush === "pencil" ? "pencil" : pen.brush === "marker" ? "marker" : "fountain");
  const penIcon =
    pen.brush === "gpen" ? <GPenIcon size={17} color={penBtn.color} /> : pen.brush === "pencil" ? <PencilIcon size={17} color={penBtn.color} /> : pen.brush === "marker" ? <MarkerIcon size={17} color={penBtn.color} /> : <PenIcon size={17} color={penBtn.color} />;
  const hl = tool("highlighter");
  const pencil = tool("pencil");
  const marker = tool("marker");
  const eraser = tool("eraser");
  const lasso = tool("lasso");
  const iconSize = compact ? 16 : 17;


  return (
    <div
      style={{
        width: compact ? 52 : 56,
        flex: "none",
        borderLeft: side === "right" ? "1px solid #EDEBEE" : "none",
        borderRight: side === "left" ? "1px solid #EDEBEE" : "none",
        background: "#FCFBFC",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0 10px",
        gap: 4,
        position: "relative",
        zIndex: 4,
      }}
    >
      <button type="button" aria-label="Pen" {...penBtn}>{penIcon}</button>
      <button type="button" aria-label="Highlighter — the six categories" {...hl}><HighlighterIcon size={iconSize} color={hl.color} /></button>
      <button type="button" aria-label="Pencil" {...pencil}><PencilIcon size={iconSize} color={pencil.color} /></button>
      <button type="button" aria-label="Marker" {...marker}><MarkerIcon size={iconSize} color={marker.color} /></button>
      <button type="button" aria-label="Eraser" {...eraser}><EraserIcon size={iconSize} color={eraser.color} /></button>
      <button type="button" aria-label="Lasso" {...lasso}><LassoIcon size={iconSize} color={lasso.color} /></button>
      <Rule />
      <button type="button" aria-label="Typed block" onClick={onText} style={{ ...penBtn.style, background: pen.tool === "text" ? "#F6E3EB" : "transparent", boxShadow: pen.tool === "text" ? "inset 0 0 0 1.5px #A63D63" : "none" }}><TextToolIcon size={15} color={pen.tool === "text" ? "#8C2F51" : "#66646C"} /></button>
      <button type="button" aria-label="Reference card" onClick={onRefCard} style={{ ...penBtn.style, background: "transparent", boxShadow: "none" }}><RefCardIcon size={iconSize} color="#66646C" /></button>
      <button type="button" aria-label="Photo" onClick={onPhoto} style={{ ...penBtn.style, background: "transparent", boxShadow: "none" }}><PhotoIcon size={iconSize} color="#66646C" /></button>
      <button type="button" aria-label="Dictate" onClick={onMic} style={{ ...penBtn.style, background: micActive ? "#F6E3EB" : "transparent", boxShadow: micActive ? "inset 0 0 0 1.5px #A63D63" : "none" }}><MicIcon size={16} color={micActive ? "#8C2F51" : "#66646C"} /></button>
      <Rule />
      <button type="button" aria-label="Undo" onClick={onUndo} style={{ ...penBtn.style, height: 32, background: "transparent", boxShadow: "none", opacity: canUndo ? 1 : 0.4 }}><UndoIcon /></button>
      <button type="button" aria-label="Redo" onClick={onRedo} style={{ ...penBtn.style, height: 32, background: "transparent", boxShadow: "none", opacity: canRedo ? 1 : 0.4 }}><RedoIcon /></button>
      <span style={{ flex: 1 }} />
      <Slider label="SIZE" value={(pen.widthMul - 0.5) / 1.7} onChange={(f) => setPen({ widthMul: Math.round((0.5 + f * 1.7) * 100) / 100 })} />
      <Slider label="OPAC" value={(pen.opacity - 0.15) / 0.85} onChange={(f) => setPen({ opacity: Math.round((0.15 + f * 0.85) * 100) / 100 })} />
      <button
        type="button"
        aria-label="Palette"
        onClick={() => setPopover(popover === "palette" ? null : "palette")}
        style={{ width: 24, height: 24, borderRadius: "50%", background: pen.color, boxShadow: "inset 0 0 0 2px #FFFFFF, 0 0 0 1.5px #D9D7DC", marginTop: 8, cursor: "pointer", border: 0, padding: 0 }}
      />
    </div>
  );
}
