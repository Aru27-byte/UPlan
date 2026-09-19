import { describe, expect, it } from "vitest";

import { boundsFromFirst, boundsFromGeometry } from "./geo-bounds";

describe("boundsFromGeometry", () => {
  it("returns null for a geometry with no coordinates", () => {
    expect(boundsFromGeometry({ type: "GeometryCollection", geometries: [] })).toBeNull();
  });

  it("computes the bounding box of a MultiPolygon", () => {
    const geom: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-122.03, 47.59],
            [-121.99, 47.59],
            [-121.99, 47.62],
            [-122.03, 47.62],
            [-122.03, 47.59],
          ],
        ],
      ],
    };
    expect(boundsFromGeometry(geom)).toEqual([
      [-122.03, 47.59],
      [-121.99, 47.62],
    ]);
  });
});

describe("boundsFromFirst", () => {
  it("skips nulls and geometries with no coordinates, using the first real one", () => {
    const point: GeoJSON.Point = { type: "Point", coordinates: [-122, 47.6] };
    expect(boundsFromFirst([null, point])).toEqual([
      [-122, 47.6],
      [-122, 47.6],
    ]);
  });

  it("returns null when nothing has coordinates", () => {
    expect(boundsFromFirst([null, null])).toBeNull();
  });
});
