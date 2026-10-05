"use client";

import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from "react";
import {
  SEGMENT_GROUPS,
  type SegmentKey,
  type Segments,
  describeMuscle,
  segmentOpacity,
} from "@/lib/body-view";

// Body map (spec §4 + the build prompt's BodyMap section).
//
// The figure is public/assets/body-front.svg, the design's own artwork. It is
// fetched and mounted as-is: nothing here redraws, simplifies or re-paths it.
// Colour is driven by id from CSS (globals.css, `.body-map`) — one hue, with
// each BIA segment's opacity set from its % of standard, because five
// segments is all the scale knows. The only attributes this component writes
// onto the artwork are aria-label and the selected marker.
//
// Round 1 limits, both from the handoff bundle's README: the art is the
// interim front figure with no shading layer, and there is no back view yet,
// so no Front/Back toggle is shown.

const ASSET = "/assets/body-front.svg";
let cached: Promise<string> | null = null;
const loadArtwork = () =>
  (cached ??= fetch(ASSET).then((res) => {
    if (!res.ok) throw new Error(`body map artwork: HTTP ${res.status}`);
    return res.text();
  }));

export function BodyMap({
  mode,
  segments,
  selected,
  onSelect,
}: {
  mode: "muscle" | "fat";
  /** null → the uncoloured silhouette (no segmental reading yet). */
  segments: Segments | null;
  selected: string | null;
  onSelect: (muscleId: string | null) => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadArtwork()
      .then((text) => {
        if (live) setSvg(text);
      })
      .catch((error) => console.error(error));
    return () => {
      live = false;
    };
  }, []);

  // Accessible names, once the artwork is in the document.
  useEffect(() => {
    if (!svg || !host.current) return;
    host.current.querySelectorAll<SVGElement>("#color [id]").forEach((el) => {
      const muscle = describeMuscle(el.id);
      if (muscle && el.tagName.toLowerCase() !== "g") el.setAttribute("aria-label", muscle.name);
    });
  }, [svg]);

  useEffect(() => {
    if (!host.current) return;
    host.current.querySelectorAll("#color [data-selected]").forEach((el) => el.removeAttribute("data-selected"));
    if (selected) host.current.querySelector(`#color [id="${selected}"]`)?.setAttribute("data-selected", "true");
  }, [selected, svg]);

  const vars: Record<string, string | number> = {};
  if (segments) {
    vars["--seg-col"] = mode === "muscle" ? "var(--b-rasp)" : "var(--b-slate)";
    for (const key of Object.keys(SEGMENT_GROUPS) as SegmentKey[]) {
      const reading = segments[key];
      vars[`--o-${SEGMENT_GROUPS[key].id}`] = segmentOpacity(
        mode,
        mode === "muscle" ? reading.musclePct : reading.fatPct
      );
    }
  }

  const tap = (e: MouseEvent<HTMLDivElement>) => {
    const shape = (e.target as Element).closest?.("#color path, #color rect");
    const id = shape?.id;
    onSelect(id && describeMuscle(id) ? (id === selected ? null : id) : null);
  };

  return (
    <div
      ref={host}
      className="body-map"
      role="img"
      aria-label={
        segments
          ? `Front of the body, shaded by ${mode === "muscle" ? "muscle" : "fat"} against the scale's standard for each arm, the trunk and each leg.`
          : "Front of the body, not yet shaded: no segmental reading."
      }
      onClick={tap}
      style={{ width: 150, height: 312, margin: "0 auto", ...(vars as CSSProperties) }}
      // The design's own SVG, mounted verbatim so its ids are reachable.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
