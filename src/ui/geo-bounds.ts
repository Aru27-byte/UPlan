import type { Geometry, Position } from "geojson";

// Pure helper for map-workspace.client.tsx and footprint-editor.client.tsx: neither MapLibre map
// was ever given a center/zoom, so it defaulted to [0, 0] at zoom 0 — nowhere near any real
// jurisdiction — and every layer rendered, just far outside the visible viewport. This computes a
// bounding box from whatever geometry a page has on hand, for `map.fitBounds(...)`.
// A plain mutable tuple, matching MapLibre's own `LngLatBoundsLike` shape for `map.fitBounds(...)`.
export type LngLatBounds = [[number, number], [number, number]]; // [[minLng, minLat], [maxLng, maxLat]]

function collectPositions(geom: Geometry, into: Position[]): void {
  switch (geom.type) {
    case "Point":
      into.push(geom.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      into.push(...geom.coordinates);
      return;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geom.coordinates) into.push(...ring);
      return;
    case "MultiPolygon":
      for (const polygon of geom.coordinates) for (const ring of polygon) into.push(...ring);
      return;
    case "GeometryCollection":
      for (const g of geom.geometries) collectPositions(g, into);
      return;
  }
}

export function boundsFromGeometry(geom: Geometry): LngLatBounds | null {
  const positions: Position[] = [];
  collectPositions(geom, positions);
  if (positions.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of positions) {
    if (lng === undefined || lat === undefined) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** The first geometry (in priority order) that actually has one, or null if none do. */
export function boundsFromFirst(geoms: (Geometry | null)[]): LngLatBounds | null {
  for (const g of geoms) {
    if (!g) continue;
    const bounds = boundsFromGeometry(g);
    if (bounds) return bounds;
  }
  return null;
}
