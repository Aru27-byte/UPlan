"use client";

import { useEffect, useRef } from "react";
// v6 has no default export — every class (Map, Popup, …) is a named export.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { basemapStyle } from "./basemap-style.client";
import type { LngLatBounds } from "./geo-bounds";

// UIDesign/Landing.png — the study-area panel on the public landing page: the same committed
// Protomaps extract the decision map uses (basemap-style.client.ts), with no evidence layers,
// because the page is signed out and has no decision to draw from. It fills its nearest positioned
// ancestor, so the page can lay its search bar and caption over it. `cooperativeGestures` keeps the
// map from capturing page scroll (wheel or one-finger drag) on a marketing page.
export type LandingMapProps = {
  basemapUrl: string;
  bounds: LngLatBounds;
};

export function LandingMap({ basemapUrl, bounds }: LandingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(basemapUrl),
      bounds,
      cooperativeGestures: true,
    });
    return () => map.remove();
  }, [basemapUrl, bounds]);

  // MapLibre's stylesheet sets `position: relative` on the element it mounts into, which would
  // override an `absolute` class on that same element — so the absolute wrapper is a separate div.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" role="img" aria-label="Map of Sammamish, WA" />
    </div>
  );
}
