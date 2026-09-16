import { describe, expect, it } from "vitest";

import { closeRing, computeImageOverlayCorners, toMultiPolygon } from "./footprint-geometry";

describe("R3: keyboard-traced vertex list closes into a valid ring", () => {
  it("returns null for fewer than 3 points", () => {
    expect(closeRing([])).toBeNull();
    expect(
      closeRing([
        [0, 0],
        [1, 0],
      ]),
    ).toBeNull();
  });

  it("closes a triangle by repeating the first point", () => {
    const ring = closeRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(ring).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
  });
});

describe("F5 R2: a traced Polygon is wrapped as a MultiPolygon before saveGeometry", () => {
  it("wraps the polygon's rings in one extra array level", () => {
    const polygon = closeRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    if (!polygon) throw new Error("fixture ring unexpectedly failed to close");
    expect(toMultiPolygon(polygon)).toEqual({
      type: "MultiPolygon",
      coordinates: [polygon.coordinates],
    });
  });
});

describe("R1: reference-image overlay corners from two ground-control points", () => {
  it("returns null when the control points coincide", () => {
    expect(
      computeImageOverlayCorners({
        controlA: [-122, 47.6],
        controlB: [-122, 47.6],
        naturalWidth: 100,
        naturalHeight: 50,
      }),
    ).toBeNull();
  });

  it("fits an unrotated image (B due east of A) with the expected aspect ratio", () => {
    const [lngA, latA] = [-122, 47.6];
    const [lngB, latB] = [-121.99, 47.6]; // due east, no rotation
    const corners = computeImageOverlayCorners({
      controlA: [lngA, latA],
      controlB: [lngB, latB],
      naturalWidth: 200,
      naturalHeight: 100,
    });
    expect(corners).not.toBeNull();
    if (!corners) return;
    const [tl, tr, br, bl] = corners;
    // Top-left is exactly control A, top-right is exactly control B.
    expect(tl).toEqual([lngA, latA]);
    expect(tr[0]).toBeCloseTo(lngB, 10);
    expect(tr[1]).toBeCloseTo(latB, 10);
    // The fit is a similarity transform in a cos(lat)-scaled local frame (an equirectangular
    // local-tangent-plane approximation, not a true equal-distance projection) — the image is
    // twice as wide as tall, so the ground-distance height is half the ground-distance width,
    // where ground-distance width in this local frame is (lngB - lngA) * cos(latA).
    const cosLat = Math.cos((latA * Math.PI) / 180);
    const groundWidth = Math.abs(lngB - lngA) * cosLat;
    const heightDeg = Math.abs((tl[1] ?? 0) - (bl[1] ?? 0));
    expect(heightDeg).toBeCloseTo(groundWidth / 2, 6);
    // Bottom-right sits directly below top-right (no rotation).
    expect(br[0]).toBeCloseTo(tr[0] ?? 0, 6);
  });
});
