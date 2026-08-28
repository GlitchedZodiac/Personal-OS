"use client";

// Real basemap for recorded trails (2026-08-28): MapLibre over OpenFreeMap's
// keyless vector tiles, with a 3D terrain mode fed by the AWS Terrarium
// elevation tiles (also keyless). Free public services, no SLA — so this
// component must degrade: any error before the first render falls back to
// the caller-provided node (the old SVG line view). Loaded via next/dynamic
// (ssr:false) so the ~250 KB library never rides the list bundle.

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decodePolyline } from "@/lib/polyline";
import type { RouteBreak } from "@/lib/route-analytics";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

// MapLibre's entire tile pipeline (vector, geojson, raster decode) lives in a
// Web Worker the library spawns from its own chunk URL — which Turbopack
// serves as a 404 HTML page ("Failed to load module script… text/html"), so
// the map rendered nothing but its background. The worker + its shared chunk
// are self-hosted from /public instead (copied from
// node_modules/maplibre-gl/dist — re-copy on library upgrades).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

function mmss(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TrailMap({
  polyline,
  breaks,
  height = 340,
  fallback,
}: {
  polyline: string;
  breaks?: RouteBreak[] | null;
  height?: number;
  fallback: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  const loadedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"2d" | "3d">("2d");

  const points = useMemo(() => {
    try {
      return decodePolyline(polyline);
    } catch {
      return [];
    }
  }, [polyline]);

  useEffect(() => {
    if (!containerRef.current || points.length < 2 || failed) return;

    const coords = points.map(([lat, lng]) => [lng, lat] as [number, number]);
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    boundsRef.current = bounds;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        bounds,
        fitBoundsOptions: { padding: 48 },
        attributionControl: { compact: true },
        // The page scrolls; the map zooms on pinch/dblclick and drags freely.
        cooperativeGestures: false,
        // Keeps the drawn frame readable — headless captures (self-smoke
        // screenshots) and any future "share this trail" export read the
        // canvas back, which is blank without this.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__pitayaMap = map;
    }

    map.on("error", () => {
      // A tile hiccup after the style parsed is survivable; a failure before
      // it means the style itself is unreachable — show the SVG view instead.
      if (!loadedRef.current) setFailed(true);
    });

    // "style.load", NOT "load": the route/breaks are our own geojson and must
    // draw the moment the style parses — "load" waits for every basemap tile,
    // so a slow or blocked tile server would hold the trail line hostage.
    map.on("style.load", () => {
      loadedRef.current = true;

      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: [TERRAIN_TILES],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "Terrain: Mapzen/AWS Open Data",
      });
      map.addLayer({
        id: "hillshade",
        type: "hillshade",
        source: "terrain-dem",
        paint: { "hillshade-exaggeration": 0.35 },
      });

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1B1518", "line-width": 7, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#CE5C86", "line-width": 4 },
      });

      map.addSource("endpoints", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { kind: "start" },
              geometry: { type: "Point", coordinates: coords[0] },
            },
            {
              type: "Feature",
              properties: { kind: "end" },
              geometry: { type: "Point", coordinates: coords[coords.length - 1] },
            },
          ],
        },
      });
      map.addLayer({
        id: "endpoints",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "kind"],
            "start",
            "#8FBF9C",
            "#CE5C86",
          ],
          "circle-stroke-color": "#1B1518",
          "circle-stroke-width": 2,
        },
      });

      const breakList = (breaks ?? []).filter(
        (b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)
      );
      if (breakList.length > 0) {
        map.addSource("breaks", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: breakList.map((b) => ({
              type: "Feature" as const,
              properties: { seconds: b.seconds, atT: b.startT },
              geometry: {
                type: "Point" as const,
                coordinates: [b.lng, b.lat] as [number, number],
              },
            })),
          },
        });
        map.addLayer({
          id: "breaks",
          type: "circle",
          source: "breaks",
          paint: {
            // Longer stops read bigger: 30 s → 5 px, 10 min+ → 12 px.
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "seconds"],
              30,
              5,
              600,
              12,
            ],
            "circle-color": "#D9A23E",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#1B1518",
            "circle-stroke-width": 1.5,
          },
        });
        map.on("click", "breaks", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const secs = Number(f.properties?.seconds ?? 0);
          const at = Number(f.properties?.atT ?? 0);
          new maplibregl.Popup({ closeButton: false, offset: 10 })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font: 600 12px var(--font-display, system-ui); color: #232227;">stopped ${mmss(secs)}<br/><span style="color:#96949B; font-weight:500;">at ${mmss(at)} in</span></div>`
            )
            .addTo(map);
        });
        map.on("mouseenter", "breaks", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "breaks", () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      mapRef.current = null;
      loadedRef.current = false;
      map.remove();
    };
    // Rebuild only per route — breaks ride along in the same effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, failed]);

  const setView = (next: "2d" | "3d") => {
    setMode(next);
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (!map || !loadedRef.current || !bounds) return;
    // Re-fit on every toggle: pitching from the flat framing walks the
    // camera off the trail, so the route stays the subject in both modes.
    if (next === "3d") {
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.3 });
      // fitBounds frames for a flat camera and pitching walks off the trail,
      // so aim at the route's center and back the zoom off a touch instead.
      const flat = map.cameraForBounds(bounds, { padding: 48 });
      const aim = (duration: number) =>
        map.easeTo({
          center: bounds.getCenter(),
          zoom: (flat?.zoom ?? map.getZoom()) - 0.4,
          pitch: 62,
          bearing: 0,
          duration,
        });
      aim(900);
      // The DEM arrives async and re-references the camera to the hill's
      // elevation, which shoves the look-at point off the route — re-aim
      // once the terrain has actually loaded (skip if he toggled back).
      map.once("idle", () => {
        if (mapRef.current === map && map.getPitch() > 30) aim(400);
      });
    } else {
      map.fitBounds(bounds, { padding: 48, pitch: 0, bearing: 0, duration: 700 });
      map.setTerrain(null);
    }
  };

  if (points.length < 2 || failed) return <>{fallback}</>;

  return (
    <div className="relative overflow-hidden bg-[#251C21]" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute right-3 top-3 z-[3] flex overflow-hidden rounded-full border border-[rgba(27,21,24,0.25)] bg-[rgba(242,241,242,0.92)] text-[11px] font-bold">
        {(["2d", "3d"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setView(m)}
            className="px-3 py-1.5"
            style={{
              fontFamily: "var(--font-display)",
              background: mode === m ? "#232227" : "transparent",
              color: mode === m ? "#FFFFFF" : "#66646C",
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
