"use client";

import { useEffect, useRef } from "react";
// v6 has no default export — every class (Map, Popup, …) is a named export.
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { paintFor, type MapStatus } from "./map-styles";

// TechDesign/map-workspace.md — R1/R5/R6: evidence tiles, study area/footprint, and the basemap,
// all in one workspace. This file imports no runtime code from @/modules or @/platform (only plain
// props) — everything it renders was already fetched and formatted by the Server Component that
// renders the page (file-structure-and-imports.md; provenance.md's boundary note).
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
  basemapUrl: string; // the pmtiles extract Caddy serves from the VM's disk (D10)
  layers: EvidenceLayer[];
  studyAreaGeoJson: GeoJSON.Geometry | null;
  footprintGeoJson: GeoJSON.Geometry | null;
};

export function MapWorkspace({ basemapUrl, layers, studyAreaGeoJson, footprintGeoJson }: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: { basemap: { type: "raster", tiles: [basemapUrl], tileSize: 256 } },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      for (const layer of layers) {
        const paint = paintFor(layer.mapStatus);
        map.addSource(layer.datasetVersionId, {
          type: "vector",
          tiles: [`/api/tiles/${layer.datasetVersionId}/{z}/{x}/{y}`],
        });
        map.addLayer({
          id: layer.datasetVersionId,
          type: "fill",
          source: layer.datasetVersionId,
          "source-layer": "layer",
          paint: {
            "fill-opacity": paint.fillOpacity,
            "fill-color": paint.fillColor,
            ...(paint.fillPattern ? { "fill-pattern": paint.fillPattern } : {}),
          },
        });
        map.on("click", layer.datasetVersionId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<p>${layer.provenance.sourceLine}</p><p>${layer.provenance.retrievedLine}</p><p>${layer.provenance.confidenceLine ?? "Not applicable"}</p>`,
            )
            .addTo(map);
        });
      }
      if (studyAreaGeoJson) {
        map.addSource("study-area", { type: "geojson", data: studyAreaGeoJson });
        map.addLayer({
          id: "study-area",
          type: "line",
          source: "study-area",
          paint: { "line-color": "#000000", "line-width": 2 },
        });
      }
      if (footprintGeoJson) {
        map.addSource("footprint", { type: "geojson", data: footprintGeoJson });
        map.addLayer({
          id: "footprint",
          type: "line",
          source: "footprint",
          paint: { "line-color": "#dc2626", "line-width": 2 },
        });
      }
    });

    return () => map.remove();
  }, [basemapUrl, layers, studyAreaGeoJson, footprintGeoJson]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "600px" }}
      role="img"
      aria-label="Map workspace showing the study area, footprint, and evidence layers"
    />
  );
}
