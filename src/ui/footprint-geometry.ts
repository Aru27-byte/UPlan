import type { MultiPolygon, Polygon, Position } from "geojson";

// TechDesign/proposal-footprint.md — pure geometry helpers for footprint-editor.client.tsx (and,
// generically, any geometry-editor.client.tsx use of the same tracing UI). Kept out of the
// `.client.tsx` file so they're unit-testable with no DOM (testing-and-verification.md).

/**
 * Closes a hand-placed vertex list (the keyboard tracing mode's crosshair-and-Enter path — R3)
 * into a GeoJSON Polygon ring. Returns null when there aren't enough distinct points to close one.
 */
export function closeRing(points: Position[]): Polygon | null {
  if (points.length < 3) return null;
  const first = points[0];
  if (!first) return null;
  return { type: "Polygon", coordinates: [[...points, first]] };
}

/** F5's saveGeometry only accepts MultiPolygon; Terra Draw's polygon mode draws a plain Polygon. */
export function toMultiPolygon(polygon: Polygon): MultiPolygon {
  return { type: "MultiPolygon", coordinates: [polygon.coordinates] };
}

type LngLat = [number, number];
export type ImageOverlayCorners = readonly [LngLat, LngLat, LngLat, LngLat]; // TL, TR, BR, BL

/**
 * R1's "simple affine fit, computed in the browser": given two ground-control points a planner
 * places on the map (bound to the image's top-left and top-right pixel corners, by convention),
 * computes the other two corners with a similarity transform (rotate + uniform scale) so the whole
 * image can be shown as a MapLibre `ImageSource`. Longitude degrees are scaled by cos(latitude) so
 * the fit looks right on screen; this is a visual aid only, never a coordinate system evidence is
 * measured in (R1: "the image is never read as data").
 */
export function computeImageOverlayCorners(input: {
  controlA: LngLat; // ground location of the image's top-left pixel (0, 0)
  controlB: LngLat; // ground location of the image's top-right pixel (naturalWidth, 0)
  naturalWidth: number;
  naturalHeight: number;
}): ImageOverlayCorners | null {
  const { controlA, controlB, naturalWidth, naturalHeight } = input;
  const [lngA, latA] = controlA;
  const [lngB, latB] = controlB;
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;

  const cosLat = Math.cos((latA * Math.PI) / 180);
  const dx = (lngB - lngA) * cosLat;
  const dy = latB - latA;
  const geoDistAB = Math.hypot(dx, dy);
  if (geoDistAB === 0) return null; // the two control points coincide — nothing to fit
  const angle = Math.atan2(dy, dx);
  const scale = geoDistAB / naturalWidth; // degrees (in the cosLat-scaled frame) per source pixel

  const corner = (px: number, py: number): LngLat => {
    const localX = px * scale;
    const localY = -py * scale; // image y grows downward; latitude grows upward
    const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
    const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);
    return [lngA + rotatedX / cosLat, latA + rotatedY];
  };

  return [
    corner(0, 0),
    corner(naturalWidth, 0),
    corner(naturalWidth, naturalHeight),
    corner(0, naturalHeight),
  ];
}
