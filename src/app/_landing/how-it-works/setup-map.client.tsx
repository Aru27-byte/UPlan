"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";

import { basemapStyle } from "@/ui/basemap-style.client";

import {
  FOOTPRINT,
  SETUP_BOUNDS,
  SETUP_LAYERS,
  STUDY_AREA,
  type SetupLayerId,
} from "./setup-demo.data";

type Props = {
  basemapUrl: string;
  visible: Record<SetupLayerId, boolean>;
};

const STUDY_COLOR = "#f6f3ec";
const FOOTPRINT_COLOR = "#eec975";
const INK = "#120f08";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The app's map convention: approximate boundaries are hatched as well as colored (never color
// alone). One diagonal per tile repeats into unbroken 45° stripes.
function hatchPatternImage(color: string): ImageData {
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.fillStyle = hexToRgba(color, 0.34);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = hexToRgba(color, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function featureCollection(geometry: Geometry): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry }],
  };
}

function layerIds(id: SetupLayerId): string[] {
  return [`${id}-fill`, `${id}-outline`, `${id}-line`];
}

function setVisibility(map: maplibregl.Map, id: SetupLayerId, on: boolean): void {
  for (const layerId of layerIds(id)) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
  }
}

export function SetupMap({ basemapUrl, visible }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;

    // The page mounts a desktop and a phone copy of every demo. Only the copy with real pixels
    // initializes MapLibre; a ResizeObserver boots the other if a resize reveals it.
    const boot = () => {
      if (map || container.clientWidth === 0 || container.clientHeight === 0) return;
      map = new maplibregl.Map({
        container,
        style: basemapStyle(basemapUrl),
        bounds: SETUP_BOUNDS,
        cooperativeGestures: true,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        if (!map) return;
        for (const layer of SETUP_LAYERS) {
          map.addSource(layer.id, { type: "geojson", data: featureCollection(layer.geometry) });
          if (layer.kind === "line") {
            map.addLayer({
              id: `${layer.id}-line`,
              type: "line",
              source: layer.id,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": layer.color, "line-width": 10, "line-opacity": 0.85 },
            });
          } else {
            if (layer.approximate) {
              const patternId = `setup-hatch-${layer.id}`;
              map.addImage(patternId, hatchPatternImage(layer.color));
              map.addLayer({
                id: `${layer.id}-fill`,
                type: "fill",
                source: layer.id,
                paint: { "fill-pattern": patternId, "fill-opacity": 0.95 },
              });
            } else {
              map.addLayer({
                id: `${layer.id}-fill`,
                type: "fill",
                source: layer.id,
                paint: { "fill-color": layer.color, "fill-opacity": 0.34 },
              });
            }
            map.addLayer({
              id: `${layer.id}-outline`,
              type: "line",
              source: layer.id,
              paint: { "line-color": layer.color, "line-width": 1.5, "line-opacity": 0.95 },
            });
          }
          setVisibility(map, layer.id, visibleRef.current[layer.id]);
        }

        // The footprint above the evidence, the study area above both: neither edge is hidden.
        map.addSource("demo-footprint", { type: "geojson", data: featureCollection(FOOTPRINT) });
        map.addLayer({
          id: "demo-footprint-fill",
          type: "fill",
          source: "demo-footprint",
          paint: { "fill-color": FOOTPRINT_COLOR, "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "demo-footprint-casing",
          type: "line",
          source: "demo-footprint",
          paint: { "line-color": INK, "line-width": 4, "line-opacity": 0.55 },
        });
        map.addLayer({
          id: "demo-footprint-line",
          type: "line",
          source: "demo-footprint",
          paint: { "line-color": FOOTPRINT_COLOR, "line-width": 2.5 },
        });

        map.addSource("demo-study-area", { type: "geojson", data: featureCollection(STUDY_AREA) });
        map.addLayer({
          id: "demo-study-casing",
          type: "line",
          source: "demo-study-area",
          paint: { "line-color": INK, "line-width": 4, "line-opacity": 0.65 },
        });
        map.addLayer({
          id: "demo-study-line",
          type: "line",
          source: "demo-study-area",
          paint: { "line-color": STUDY_COLOR, "line-width": 2, "line-dasharray": [2, 1.4] },
        });

        setReady(true);
      });
    };

    const observer = new ResizeObserver(boot);
    observer.observe(container);
    boot();

    return () => {
      observer.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [basemapUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const layer of SETUP_LAYERS) setVisibility(map, layer.id, visible[layer.id]);
  }, [visible, ready]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        role="region"
        aria-label="Illustrative map workspace: an OpenStreetMap basemap with the study area, the proposal footprint, and the evidence layers the switches control."
        className="h-full w-full"
      />
    </div>
  );
}
