"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
// v6 has no default export — every class (Map, Popup, …) is a named export.
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Switch } from "react-aria-components";

import { basemapStyle } from "./basemap-style.client";
import type { LngLatBounds } from "./geo-bounds";
import { darken, layerColor, paintFor, type MapStatus } from "./map-styles";
import { StatusLabel } from "./status-label";

// TechDesign/map-workspace.md — R1/R4/R5/R6: evidence tiles, study area/footprint, the basemap,
// and everything the map shows also available as text, all in one workspace. This file imports no
// runtime code from @/modules or @/platform (only plain props) — everything it renders was already
// fetched and formatted by the Server Component that renders the page (file-structure-and-
// imports.md; provenance.md's boundary note).
export type EvidenceLayer = {
  datasetVersionId: string;
  label: string;
  mapStatus: MapStatus;
  provenance: {
    sourceLine: string;
    retrievedLine: string;
    confidenceLine: string | null;
    citations: string[];
  };
};

export type MapWorkspaceProps = {
  basemapUrl: string; // one static URL to the .pmtiles extract Caddy serves from the VM's disk (D10)
  layers: EvidenceLayer[];
  studyAreaGeoJson: GeoJSON.Geometry | null;
  footprintGeoJson: GeoJSON.Geometry | null;
  /**
   * Where to point the camera on first load — the study area, footprint, or (when a decision has
   * neither drawn yet) the jurisdiction boundary. Without this, MapLibre defaults to `[0, 0]` at
   * zoom 0, off the coast of Africa: every layer above still renders, just nowhere near the
   * visible viewport, which looks exactly like a blank map.
   */
  initialBounds: LngLatBounds;
  /** When set, only this evidence layer starts visible (the Evidence page's "Show on map"). */
  focusLayerId?: string | null;
};

const STUDY_AREA_ID = "study-area";
const FOOTPRINT_ID = "footprint";
const STUDY_AREA_COLOR = "#16202a"; // --color-text (globals.css) — the drawn boundary, not a data layer
const FOOTPRINT_COLOR = "#dc2626";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A small diagonal hatch tile, tinted to the layer's own color — the dataviz skill's "texture is
 * the accessibility channel" rule, applied per-layer instead of one fixed hatch color for every
 * approximate boundary. A single corner-to-corner diagonal per square tile already tiles into
 * continuous unbroken 45° stripes when MapLibre repeats it across a fill: each tile's diagonal
 * neighbor (one tile right, one up) picks up exactly where this one ends, at (size, 0).
 */
function hatchPatternImage(color: string): ImageData {
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.fillStyle = hexToRgba(color, 0.28);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = hexToRgba(darken(color, 0.55), 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function setGroupVisibility(map: MapLibreMap, id: string, visible: boolean): void {
  const visibility = visible ? "visible" : "none";
  for (const layerId of [id, `${id}-outline`, `${id}-casing`]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  }
}

export function MapWorkspace({
  basemapUrl,
  layers,
  studyAreaGeoJson,
  footprintGeoJson,
  initialBounds,
  focusLayerId = null,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const l of layers) initial[l.datasetVersionId] = focusLayerId === null || l.datasetVersionId === focusLayerId;
    if (studyAreaGeoJson) initial[STUDY_AREA_ID] = true;
    if (footprintGeoJson) initial[FOOTPRINT_ID] = true;
    return initial;
  });

  // Assigned once per layer list, by position — the same order the legend/table below renders in,
  // so a color always means the same layer in both places.
  const colorFor = useMemo(() => {
    const assigned = new Map<string, string>();
    layers.forEach((l, i) => assigned.set(l.datasetVersionId, layerColor(i)));
    return assigned;
  }, [layers]);

  const layersKey = layers.map((l) => l.datasetVersionId).join(",");
  const studyAreaKey = JSON.stringify(studyAreaGeoJson);
  const footprintKey = JSON.stringify(footprintGeoJson);

  useEffect(() => {
    if (!containerRef.current) return;
    // A rebuilt map has none of its layers yet: the visibility effect below must apply the toggles again once
    // it has loaded, so a layer switched off stays off.
    setLayersReady(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(basemapUrl),
    });
    mapRef.current = map;
    map.fitBounds(initialBounds, { padding: 40, animate: false });

    map.on("load", () => {
      for (const layer of layers) {
        const color = colorFor.get(layer.datasetVersionId) ?? layerColor(0);
        const paint = paintFor(layer.mapStatus, color);
        map.addSource(layer.datasetVersionId, {
          type: "vector",
          tiles: [`/api/tiles/${layer.datasetVersionId}/{z}/{x}/{y}`],
        });
        if (paint.patternColor) {
          const patternId = `hatch-${layer.datasetVersionId}`;
          map.addImage(patternId, hatchPatternImage(color));
          map.addLayer({
            id: layer.datasetVersionId,
            type: "fill",
            source: layer.datasetVersionId,
            "source-layer": "layer",
            paint: { "fill-pattern": patternId, "fill-opacity": paint.fillOpacity },
          });
        } else {
          map.addLayer({
            id: layer.datasetVersionId,
            type: "fill",
            source: layer.datasetVersionId,
            "source-layer": "layer",
            paint: { "fill-color": paint.fillColor, "fill-opacity": paint.fillOpacity },
          });
        }
        // An outline in the layer's own (undarkened) color, so a hatched or low-opacity fill still
        // reads as one clearly bounded shape against the basemap and any overlapping layer.
        map.addLayer({
          id: `${layer.datasetVersionId}-outline`,
          type: "line",
          source: layer.datasetVersionId,
          "source-layer": "layer",
          paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0.9 },
        });

        map.on("mouseenter", layer.datasetVersionId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer.datasetVersionId, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", layer.datasetVersionId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="uplan-popup" style="border-top-color: ${color}">
                <strong>${layer.label}</strong>
                <p>${layer.provenance.sourceLine}</p>
                <p>${layer.provenance.retrievedLine}</p>
                <p>${layer.provenance.confidenceLine ?? "Not applicable"}</p>
              </div>`,
            )
            .addTo(map);
        });
      }

      // A white "casing" beneath each drawn boundary is a standard cartographic technique for
      // keeping a line legible over both the basemap and any evidence fill beneath it.
      if (studyAreaGeoJson) {
        map.addSource(STUDY_AREA_ID, { type: "geojson", data: studyAreaGeoJson });
        map.addLayer({
          id: `${STUDY_AREA_ID}-casing`,
          type: "line",
          source: STUDY_AREA_ID,
          paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: STUDY_AREA_ID,
          type: "line",
          source: STUDY_AREA_ID,
          paint: { "line-color": STUDY_AREA_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      }
      if (footprintGeoJson) {
        map.addSource(FOOTPRINT_ID, { type: "geojson", data: footprintGeoJson });
        map.addLayer({
          id: `${FOOTPRINT_ID}-casing`,
          type: "line",
          source: FOOTPRINT_ID,
          paint: { "line-color": "#ffffff", "line-width": 5.5, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: FOOTPRINT_ID,
          type: "line",
          source: FOOTPRINT_ID,
          paint: { "line-color": FOOTPRINT_COLOR, "line-width": 3 },
        });
      }

      setLayersReady(true);
    });

    return () => map.remove();
    // Intentionally excludes initialBounds: it's the map's one-time initial camera position, not
    // something a later render should re-fit to (a planner may have panned/zoomed since).
    // The dependencies are stable keys, not the props themselves: the page re-renders on a refresh (every few
    // seconds while an analysis runs), and each render hands over fresh objects with the same content, which
    // must not tear the map down. It rebuilds only when a layer, or a boundary's content, actually changes.
  }, [basemapUrl, layersKey, studyAreaKey, footprintKey]);

  // Real-time layer toggling: flips visibility on the already-loaded map the instant a switch in
  // the table below changes, without touching the map's camera or re-fetching any tile.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    for (const [id, isVisible] of Object.entries(visible)) {
      setGroupVisibility(map, id, isVisible);
    }
  }, [visible, layersReady]);

  function toggle(id: string): void {
    setVisible((v) => ({ ...v, [id]: !v[id] }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={containerRef}
        style={{ width: "100%", height: "520px" }}
        className="overflow-hidden rounded-xl border border-line"
        role="region"
        aria-label="Map workspace showing the study area, footprint, and evidence layers. The same information is listed as text below the map."
      />
      <LayersPanel
        layers={layers}
        colorFor={colorFor}
        studyAreaGeoJson={studyAreaGeoJson}
        footprintGeoJson={footprintGeoJson}
        visible={visible}
        onToggle={toggle}
      />
    </div>
  );
}

function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        y1="6"
        x2="21"
        y2="6"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={dashed ? "3 2.5" : undefined}
      />
    </svg>
  );
}

function FillSwatch({ color, hatched }: { color: string; hatched: boolean }) {
  const patternId = useId();
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" className="shrink-0">
      {hatched ? (
        <>
          <defs>
            <pattern
              id={patternId}
              width="5"
              height="5"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="5" fill={color} fillOpacity="0.28" />
              <line x1="0" y1="0" x2="0" y2="5" stroke={darken(color, 0.55)} strokeWidth="1.75" />
            </pattern>
          </defs>
          <rect
            x="1"
            y="1"
            width="20"
            height="14"
            rx="2"
            fill={`url(#${patternId})`}
            stroke={color}
            strokeWidth="1.5"
          />
        </>
      ) : (
        <rect
          x="1"
          y="1"
          width="20"
          height="14"
          rx="2"
          fill={color}
          fillOpacity="0.4"
          stroke={color}
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

function LayerToggle({
  isSelected,
  onChange,
  label,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Switch
      isSelected={isSelected}
      onChange={onChange}
      className="group inline-flex cursor-pointer items-center"
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="h-5 w-9 shrink-0 rounded-full border-2 border-muted bg-surface transition-colors group-data-[selected]:border-brand group-data-[selected]:bg-brand group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-offset-1 group-data-[focus-visible]:ring-brand"
      >
        <span className="block h-3 w-3 translate-x-0.5 translate-y-0.5 rounded-full bg-muted transition-transform group-data-[selected]:translate-x-4 group-data-[selected]:bg-white" />
      </span>
    </Switch>
  );
}

const MAP_STATUS_LABEL: Record<MapStatus, string> = {
  regulatory: "Regulatory",
  approximate: "Approximate",
};

function LayersPanel({
  layers,
  colorFor,
  studyAreaGeoJson,
  footprintGeoJson,
  visible,
  onToggle,
}: {
  layers: EvidenceLayer[];
  colorFor: Map<string, string>;
  studyAreaGeoJson: GeoJSON.Geometry | null;
  footprintGeoJson: GeoJSON.Geometry | null;
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <section aria-label="Map layers">
      {studyAreaGeoJson || footprintGeoJson ? (
        <div className="mb-3 flex flex-wrap gap-4 border-b border-line pb-3">
          {/* A plain wrapper, not a <label>: LayerToggle already renders its own (via RAC's
              Switch), and a <label> can't nest inside another. */}
          {studyAreaGeoJson ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayerToggle
                isSelected={visible[STUDY_AREA_ID] ?? true}
                onChange={() => onToggle(STUDY_AREA_ID)}
                label="Show study area on map"
              />
              <LineSwatch color={STUDY_AREA_COLOR} dashed />
              Study area
            </div>
          ) : null}
          {footprintGeoJson ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayerToggle
                isSelected={visible[FOOTPRINT_ID] ?? true}
                onChange={() => onToggle(FOOTPRINT_ID)}
                label="Show footprint on map"
              />
              <LineSwatch color={FOOTPRINT_COLOR} />
              Footprint
            </div>
          ) : null}
        </div>
      ) : null}

      <h3 className="mb-2 text-sm font-semibold text-text">Evidence layers</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Layer
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Source
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Retrieved
              </th>
              <th scope="col" className="py-2 pl-3 font-semibold">
                Show on map
              </th>
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => {
              const color = colorFor.get(l.datasetVersionId) ?? layerColor(0);
              return (
                <tr
                  key={l.datasetVersionId}
                  id={`layer-${l.datasetVersionId}`}
                  className="border-b border-line"
                >
                  <th scope="row" className="py-2.5 pr-3 font-medium">
                    <span className="flex items-center gap-2">
                      <FillSwatch color={color} hatched={l.mapStatus === "approximate"} />
                      {l.label}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      {/* Status is a legal distinction shared across layers (R2), never colored by
                          the layer's own identity color — the swatch already carries that. */}
                      <span>
                        <StatusLabel tone={l.mapStatus === "approximate" ? "warn" : "neutral"}>
                          {MAP_STATUS_LABEL[l.mapStatus]}
                        </StatusLabel>
                      </span>
                      {l.provenance.confidenceLine ? (
                        <span className="text-xs text-muted">{l.provenance.confidenceLine}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-text">{l.provenance.sourceLine}</td>
                  <td className="px-3 py-2.5 text-text">{l.provenance.retrievedLine}</td>
                  <td className="py-2.5 pl-3">
                    <LayerToggle
                      isSelected={visible[l.datasetVersionId] ?? true}
                      onChange={() => onToggle(l.datasetVersionId)}
                      label={`Show ${l.label} on map`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
