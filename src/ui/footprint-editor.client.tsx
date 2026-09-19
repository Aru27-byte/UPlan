"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  ValidateNotSelfIntersecting,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { MultiPolygon, Polygon, Position } from "geojson";
// GeometryKind is a type-only import — allowed even from a *.client.tsx file
// (eslint.config.js's client-file override: `allowTypeImports: true`); this component never
// imports @/modules runtime code (file-structure-and-imports.md).
import type { GeometryKind } from "@/modules/decisions";

import { basemapStyle } from "./basemap-style.client";
import { buttonClassName } from "./button-styles";
import { closeRing, toMultiPolygon } from "./footprint-geometry";
import type { LngLatBounds } from "./geo-bounds";
import { ReferenceOverlay } from "./reference-overlay.client";

// TechDesign/proposal-footprint.md — the tracing UI for both geometry kinds F5's saveGeometry
// accepts (a study area and a footprint share the same tracing workflow; only F8's design doc
// happens to be written out in full, but R2–R7 talk about saveGeometry generically, not
// footprint-specifically, so one editor serves both rather than duplicating it — best-practices.md,
// "Rewrite existing components over adding new ones").
export type GeometryEditorProps = {
  kind: GeometryKind;
  basemapUrl: string;
  /** The other geometry to show read-only for context (the study area, while tracing a footprint). */
  referenceGeoJson: MultiPolygon | null;
  referenceLabel: string | null;
  /** The latest saved revision of `kind`, if any — the starting shape for further editing. */
  initialGeoJson: MultiPolygon | null;
  currentRevision: number; // 0 when nothing has been saved yet
  onSave: (geojson: MultiPolygon, sourceNote: string, expectedRevision: number) => Promise<void>;
  /**
   * Where to point the camera on first load. Without this, MapLibre defaults to `[0, 0]` at zoom
   * 0 — nowhere near any real jurisdiction — and tracing a shape there would be invisible.
   */
  initialBounds: LngLatBounds;
};

const POLYGON_MODE = "polygon";
const SELECT_MODE = "select";

function toFeature(polygon: Polygon): GeoJSONStoreFeatures {
  return { type: "Feature", geometry: polygon, properties: { mode: POLYGON_MODE } };
}

function firstPolygon(multi: MultiPolygon): Polygon {
  return { type: "Polygon", coordinates: multi.coordinates[0] ?? [] };
}

export function GeometryEditor({
  kind,
  basemapUrl,
  referenceGeoJson,
  referenceLabel,
  initialGeoJson,
  currentRevision,
  onSave,
  initialBounds,
}: GeometryEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const terraDrawRef = useRef<TerraDraw | null>(null);
  const [mapReady, setMapReady] = useState<MapLibreMap | null>(null);

  const [hasFeature, setHasFeature] = useState(!!initialGeoJson);
  const [validity, setValidity] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRevision, setSavedRevision] = useState(currentRevision);

  // R3's keyboard tracing path: a crosshair moved by arrow keys and committed with Enter, entirely
  // separate from Terra Draw's own pointer-drawing state until "Finish shape" commits it into
  // Terra Draw's store as an ordinary finished polygon feature (from then on it's editable in
  // select mode exactly like a pointer-drawn one — there is no second, parallel storage path).
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [crosshairPixel, setCrosshairPixel] = useState<{ x: number; y: number } | null>(null);
  const [keyboardPoints, setKeyboardPoints] = useState<Position[]>([]);
  const [keyboardMessage, setKeyboardMessage] = useState<string | null>(null);

  const revalidate = useCallback(() => {
    const td = terraDrawRef.current;
    if (!td) return;
    const features = td.getSnapshot().filter((f) => f.geometry.type === "Polygon");
    const feature = features[0];
    setHasFeature(!!feature);
    setValidity(feature ? ValidateNotSelfIntersecting(feature) : null);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(basemapUrl),
    });
    mapRef.current = map;
    map.fitBounds(initialBounds, { padding: 40, animate: false });

    map.on("load", () => {
      if (referenceGeoJson) {
        map.addSource("reference-geometry", { type: "geojson", data: referenceGeoJson });
        map.addLayer({
          id: "reference-geometry",
          type: "line",
          source: "reference-geometry",
          paint: { "line-color": "#000000", "line-width": 2, "line-dasharray": [2, 2] },
        });
      }

      const adapter = new TerraDrawMapLibreGLAdapter({ map });
      const terraDraw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawPolygonMode({ validation: ValidateNotSelfIntersecting }),
          new TerraDrawSelectMode({
            flags: {
              [POLYGON_MODE]: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
            },
          }),
        ],
      });
      terraDrawRef.current = terraDraw;
      terraDraw.start();

      if (initialGeoJson) {
        terraDraw.addFeatures([toFeature(firstPolygon(initialGeoJson))]);
        terraDraw.setMode(SELECT_MODE);
      } else {
        terraDraw.setMode(POLYGON_MODE);
      }
      revalidate();

      terraDraw.on("finish", () => {
        terraDraw.setMode(SELECT_MODE);
        revalidate();
      });
      terraDraw.on("change", revalidate);

      setMapReady(map);
    });

    return () => {
      terraDrawRef.current?.stop();
      terraDrawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Intentionally an empty dependency array: basemapUrl/referenceGeoJson/initialGeoJson are the
    // map's one-time initial state, per map-workspace.client.tsx's own established pattern of not
    // re-fetching or re-diffing them on every render.
  }, []);

  function startOver() {
    const td = terraDrawRef.current;
    if (!td) return;
    td.clear();
    setKeyboardPoints([]);
    setKeyboardMessage(null);
    td.setMode(POLYGON_MODE);
    revalidate();
  }

  // Keyboard crosshair (R3). The map container is a focusable region (tabIndex=0 below); Tab into
  // it reveals the crosshair over the map's current center, arrow keys move it, Enter places a
  // vertex, Backspace removes the last one, Escape clears the in-progress trace, and the visible
  // "Finish shape" button (not a shortcut alone, so it stays discoverable) closes the polygon.
  function onContainerFocus() {
    const map = mapRef.current;
    if (!map) return;
    setKeyboardFocused(true);
    if (!crosshairPixel) {
      const c = map.project(map.getCenter());
      setCrosshairPixel({ x: c.x, y: c.y });
    }
  }

  function onContainerBlur() {
    setKeyboardFocused(false);
  }

  function onContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const map = mapRef.current;
    if (!map || !crosshairPixel) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        setCrosshairPixel({ x: crosshairPixel.x, y: crosshairPixel.y - step });
        return;
      case "ArrowDown":
        e.preventDefault();
        setCrosshairPixel({ x: crosshairPixel.x, y: crosshairPixel.y + step });
        return;
      case "ArrowLeft":
        e.preventDefault();
        setCrosshairPixel({ x: crosshairPixel.x - step, y: crosshairPixel.y });
        return;
      case "ArrowRight":
        e.preventDefault();
        setCrosshairPixel({ x: crosshairPixel.x + step, y: crosshairPixel.y });
        return;
      case "Enter": {
        e.preventDefault();
        const { lng, lat } = map.unproject([crosshairPixel.x, crosshairPixel.y]);
        setKeyboardPoints((points) => [...points, [lng, lat]]);
        setKeyboardMessage(null);
        return;
      }
      case "Backspace":
        e.preventDefault();
        setKeyboardPoints((points) => points.slice(0, -1));
        return;
      case "Escape":
        e.preventDefault();
        setKeyboardPoints([]);
        setKeyboardMessage(null);
        return;
      default:
        return;
    }
  }

  function finishKeyboardShape() {
    const ring = closeRing(keyboardPoints);
    if (!ring) {
      setKeyboardMessage("Place at least 3 points before finishing the shape.");
      return;
    }
    const feature = toFeature(ring);
    const result = ValidateNotSelfIntersecting(feature);
    if (!result.valid) {
      setKeyboardMessage(result.reason ?? "This shape isn't valid.");
      return;
    }
    const td = terraDrawRef.current;
    if (!td) return;
    td.clear();
    td.addFeatures([feature]);
    td.setMode(SELECT_MODE);
    setKeyboardPoints([]);
    setKeyboardMessage(null);
    revalidate();
  }

  async function handleSave() {
    const td = terraDrawRef.current;
    if (!td) return;
    const feature = td.getSnapshot().find((f) => f.geometry.type === "Polygon");
    if (feature?.geometry.type !== "Polygon") return;
    const check = ValidateNotSelfIntersecting(feature);
    if (!check.valid) {
      setValidity(check);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const multiPolygon = toMultiPolygon(feature.geometry);
      const sourceNote =
        kind === "footprint"
          ? "Traced by the planner in the map workspace."
          : "Drawn by the planner in the map workspace.";
      await onSave(multiPolygon, sourceNote, savedRevision + 1);
      setSavedRevision((r) => r + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const label = kind === "footprint" ? "footprint" : "study area";
  const saveDisabled = saving || !hasFeature || validity?.valid === false;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label={`Map tracing workspace for the ${label}. Tab in, then use arrow keys to move the crosshair, Enter to place a vertex, Backspace to remove the last one, and the Finish shape button below to close the polygon.`}
          onFocus={onContainerFocus}
          onBlur={onContainerBlur}
          onKeyDown={onContainerKeyDown}
          style={{ width: "100%", height: "500px", outline: "none" }}
        />
        {keyboardFocused && crosshairPixel ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: crosshairPixel.x - 8,
              top: crosshairPixel.y - 8,
              width: 16,
              height: 16,
              pointerEvents: "none",
              border: "2px solid #dc2626",
              borderRadius: "50%",
            }}
          />
        ) : null}
      </div>

      {keyboardFocused ? (
        <div className="card-sticker bg-cream flex flex-wrap items-center gap-2 p-3 text-sm">
          <span>
            Keyboard tracing: arrow keys move the crosshair (Shift for 10px), Enter places a vertex
            {keyboardPoints.length > 0 ? ` (${keyboardPoints.length} placed)` : ""}, Backspace removes the
            last one, Escape clears.
          </span>
          <button
            type="button"
            className={buttonClassName("secondary", "px-3 py-1.5 text-xs text-ink")}
            onClick={finishKeyboardShape}
          >
            Finish shape
          </button>
          {keyboardMessage ? (
            <span className="text-xs font-medium text-red-700">{keyboardMessage}</span>
          ) : null}
        </div>
      ) : null}

      <ReferenceOverlay map={mapReady} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClassName("primary", "px-4 py-2 text-ink")}
          disabled={saveDisabled}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : `Save ${label} (revision ${savedRevision + 1})`}
        </button>
        <button
          type="button"
          className={buttonClassName("outline", "px-3 py-1.5 text-xs text-ink")}
          onClick={startOver}
        >
          Start over
        </button>
        {referenceLabel ? <span className="text-ink/60 text-xs">Dashed line: {referenceLabel}</span> : null}
      </div>
      {validity?.valid === false ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {validity.reason ?? "This shape isn't valid."}
        </p>
      ) : null}
      {saveError ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
