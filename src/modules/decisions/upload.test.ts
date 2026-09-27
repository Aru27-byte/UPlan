import { describe, expect, it } from "vitest";

import { ValidationError } from "@/platform/errors";

import { parseBoundaryUpload } from "./upload";

// TechDesign/research-phases.md (F21 R11): an uploaded boundary is checked, never repaired.

const ring = [[-122.03, 47.6], [-122.02, 47.6], [-122.02, 47.61], [-122.03, 47.61], [-122.03, 47.6]];
const polygon = { type: "Polygon", coordinates: [ring] };
const multi = { type: "MultiPolygon", coordinates: [[ring]] };

const text = (value: unknown) => JSON.stringify(value);

describe("R11: what an upload may be", () => {
  it("R11: accepts a Polygon, wrapping it as a one-part MultiPolygon without changing a coordinate", () => {
    expect(parseBoundaryUpload(text(polygon))).toEqual({ type: "MultiPolygon", coordinates: [[ring]] });
  });

  it("R11: accepts a MultiPolygon, a Feature, and a one-feature FeatureCollection", () => {
    expect(parseBoundaryUpload(text(multi)).coordinates).toHaveLength(1);
    expect(parseBoundaryUpload(text({ type: "Feature", properties: {}, geometry: polygon })).type).toBe("MultiPolygon");
    expect(parseBoundaryUpload(text({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: multi }] })).type).toBe("MultiPolygon");
  });

  it("R11: accepts a legacy crs member that names WGS 84", () => {
    const withCrs = { ...polygon, crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } };
    expect(parseBoundaryUpload(text(withCrs)).type).toBe("MultiPolygon");
  });
});

describe("R11: what is rejected, with a message that says what to fix", () => {
  const reject = (input: string, message: RegExp) => {
    expect(() => parseBoundaryUpload(input)).toThrow(ValidationError);
    expect(() => parseBoundaryUpload(input)).toThrow(message);
  };

  it("R11: not JSON, and JSON that isn't GeoJSON", () => {
    reject("this is not json", /isn't valid JSON/);
    reject(text([1, 2, 3]), /isn't GeoJSON/);
    reject(text({ no: "type" }), /isn't GeoJSON/);
  });

  it("R11: a collection with zero or two features", () => {
    reject(text({ type: "FeatureCollection", features: [] }), /exactly one boundary/);
    reject(
      text({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon }, { type: "Feature", geometry: polygon }] }),
      /exactly one boundary/,
    );
  });

  it("R11: a Point, a LineString, and a Feature with no geometry", () => {
    reject(text({ type: "Point", coordinates: [-122, 47] }), /holds a Point/);
    reject(text({ type: "LineString", coordinates: [[-122, 47], [-122.1, 47.1]] }), /holds a LineString/);
    reject(text({ type: "Feature", properties: {}, geometry: null }), /no geometry/);
  });

  it("R11: coordinates that aren't longitude and latitude — the common projected-file mistake", () => {
    const projected = { type: "Polygon", coordinates: [[[1350000, 220000], [1351000, 220000], [1351000, 221000], [1350000, 221000], [1350000, 220000]]] };
    reject(text(projected), /aren't longitude and latitude in WGS 84/);
    reject(text({ type: "Polygon", coordinates: [[[-122, 91], [-121, 91], [-121, 92], [-122, 92], [-122, 91]]] }), /aren't longitude and latitude/);
  });

  it("R11: a crs other than WGS 84", () => {
    const state = { ...polygon, crs: { type: "name", properties: { name: "EPSG:2926" } } };
    reject(text(state), /uses EPSG:2926/);
  });

  it("R11: an unclosed ring, and a ring with too few points, are reported and never closed for the planner", () => {
    reject(text({ type: "Polygon", coordinates: [[[-122.03, 47.6], [-122.02, 47.6], [-122.02, 47.61], [-122.03, 47.61]]] }), /must end where it starts/);
    reject(text({ type: "Polygon", coordinates: [[[-122.03, 47.6], [-122.02, 47.6], [-122.03, 47.6]]] }), /at least four points/);
  });

  it("R11: 3D coordinates are refused rather than trimmed", () => {
    reject(text({ type: "Polygon", coordinates: [[[-122.03, 47.6, 10], [-122.02, 47.6, 10], [-122.02, 47.61, 10], [-122.03, 47.6, 10]]] }), /\[longitude, latitude\] pair/);
  });
});
