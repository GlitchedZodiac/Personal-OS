"use client";

import { useMemo } from "react";
import { decodePolyline } from "@/lib/strava";

interface RouteMapProps {
  polyline: string;
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
}

export function RouteMap({
  polyline,
  width = 300,
  height = 150,
  strokeColor = "#FC4C02", // Strava orange
  strokeWidth = 2.5,
  className = "",
}: RouteMapProps) {
  const pathData = useMemo(() => {
    if (!polyline) return null;

    try {
      const points = decodePolyline(polyline);
      if (points.length < 2) return null;

      // Find bounds
      let minLat = Infinity, maxLat = -Infinity;
      let minLng = Infinity, maxLng = -Infinity;

      for (const [lat, lng] of points) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }

      // Add padding
      const padding = 12;
      const drawWidth = width - padding * 2;
      const drawHeight = height - padding * 2;

      const latRange = maxLat - minLat || 0.001;
      const lngRange = maxLng - minLng || 0.001;

      // Maintain aspect ratio using Mercator-ish scaling
      const midLat = (minLat + maxLat) / 2;
      const lngScale = Math.cos((midLat * Math.PI) / 180);
      const adjustedLngRange = lngRange * lngScale;

      const scaleX = drawWidth / adjustedLngRange;
      const scaleY = drawHeight / latRange;
      const scale = Math.min(scaleX, scaleY);

      // Map points to SVG coordinates
      const svgPoints = points.map(([lat, lng]) => {
        const x = padding + ((lng - minLng) * lngScale * scale + (drawWidth - adjustedLngRange * scale) / 2);
        const y = padding + (drawHeight - ((lat - minLat) * scale + (drawHeight - latRange * scale) / 2));
        return [x, y] as [number, number];
      });

      // Build SVG path
      const d = svgPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
        .join(" ");

      // Start and end points
      const start = svgPoints[0];
      const end = svgPoints[svgPoints.length - 1];

      return { d, start, end };
    } catch {
      return null;
    }
  }, [polyline, width, height]);

  if (!pathData) return null;

  return (
    <div className={`rounded-lg overflow-hidden bg-black/20 ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
      >
        {/* Route path */}
        <path
          d={pathData.d}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />

        {/* Glow effect */}
        <path
          d={pathData.d}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.15}
        />

        {/* Start point (green) */}
        <circle
          cx={pathData.start[0]}
          cy={pathData.start[1]}
          r={4}
          fill="#22c55e"
          stroke="#000"
          strokeWidth={1}
        />

        {/* End point (red) */}
        <circle
          cx={pathData.end[0]}
          cy={pathData.end[1]}
          r={4}
          fill="#ef4444"
          stroke="#000"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
