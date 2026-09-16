"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";

import { buttonClassName } from "./button-styles";
import { computeImageOverlayCorners } from "./footprint-geometry";

// TechDesign/proposal-footprint.md (R1) — a planner's own site-plan image, used only as an
// on-screen tracing aid: rendered client-side as a MapLibre ImageSource, positioned by two ground-
// control points with a similarity fit computed in the browser (footprint-geometry.ts). It is
// never uploaded, stored, or parsed — this component holds no server import at all
// (file-structure-and-imports.md: *.client.tsx never imports @/modules or @/platform).
const SOURCE_ID = "footprint-reference-image";
const LAYER_ID = "footprint-reference-image-layer";

export function ReferenceOverlay({ map }: { map: MapLibreMap | null }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [placing, setPlacing] = useState<"A" | "B" | null>(null);
  const [controlA, setControlA] = useState<[number, number] | null>(null);
  const [controlB, setControlB] = useState<[number, number] | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function reset() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setImageUrl(null);
    setNaturalSize(null);
    setPlacing(null);
    setControlA(null);
    setControlB(null);
    if (map?.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map?.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }

  function handleFile(file: File) {
    reset();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const img = new Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    setImageUrl(url);
  }

  // Places whichever control point is currently armed at the clicked ground location — the map
  // click listener is only attached while `placing` is set, so an ordinary map click (panning,
  // inspecting evidence) is never mistaken for placing a control point.
  useEffect(() => {
    if (!map || !placing) return;
    const onClick = (e: MapMouseEvent) => {
      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (placing === "A") setControlA(point);
      else setControlB(point);
      setPlacing(null);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, placing]);

  useEffect(() => {
    if (!map || !imageUrl || !naturalSize || !controlA || !controlB) return;
    const corners = computeImageOverlayCorners({
      controlA,
      controlB,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
    });
    if (!corners) return;

    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    map.addSource(SOURCE_ID, {
      type: "image",
      url: imageUrl,
      coordinates: [corners[0], corners[1], corners[2], corners[3]],
    });
    map.addLayer({ id: LAYER_ID, type: "raster", source: SOURCE_ID, paint: { "raster-opacity": 0.6 } });

    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, imageUrl, naturalSize, controlA, controlB]);

  // Intentionally an empty dependency array: this only needs to run reset() once, on unmount.
  useEffect(() => () => reset(), []);

  return (
    <div className="card-sticker bg-cream flex flex-col gap-2 p-3 text-sm">
      <p className="text-ink/70 text-xs">
        Optional: load an image of the site plan as a tracing aid. It stays in this browser tab only — never
        uploaded, stored, or read as data (R1).
      </p>
      {!imageUrl ? (
        <input
          type="file"
          accept="image/*"
          aria-label="Load a site-plan image as a tracing aid"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClassName("outline", "px-3 py-1.5 text-xs text-ink")}
            aria-pressed={placing === "A"}
            onClick={() => setPlacing(placing === "A" ? null : "A")}
          >
            {placing === "A"
              ? "Click the map for point A…"
              : controlA
                ? "Point A set — replace"
                : "Set point A (image's top-left)"}
          </button>
          <button
            type="button"
            className={buttonClassName("outline", "px-3 py-1.5 text-xs text-ink")}
            aria-pressed={placing === "B"}
            onClick={() => setPlacing(placing === "B" ? null : "B")}
          >
            {placing === "B"
              ? "Click the map for point B…"
              : controlB
                ? "Point B set — replace"
                : "Set point B (image's top-right)"}
          </button>
          <button
            type="button"
            className={buttonClassName("outline", "px-3 py-1.5 text-xs text-ink")}
            onClick={reset}
          >
            Remove reference image
          </button>
        </div>
      )}
    </div>
  );
}
