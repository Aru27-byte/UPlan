import type { MultiPolygon } from "geojson";

import type { Actor } from "@/modules/accounts";
import { ValidationError } from "@/platform/errors";

import { MultiPolygonSchema, saveGeometry, type GeometryKind } from "./geometry";

// TechDesign/research-phases.md (F21 R11): a planner may upload a boundary instead of drawing one.
// The file is checked, never repaired: it must be GeoJSON in WGS 84 holding exactly one Polygon or
// MultiPolygon. A geometry that isn't valid is rejected by saveGeometry with PostGIS's reason.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// The names GeoJSON's legacy `crs` member uses for WGS 84 (RFC 7946 dropped `crs` and fixed WGS 84).
const WGS84_NAMES = new Set([
  "urn:ogc:def:crs:OGC:1.3:CRS84",
  "urn:ogc:def:crs:OGC::CRS84",
  "urn:ogc:def:crs:EPSG::4326",
  "EPSG:4326",
]);

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function crsName(document: Json): string | null {
  const crs = document["crs"];
  if (crs === undefined) return null;
  if (isObject(crs) && isObject(crs["properties"]) && typeof crs["properties"]["name"] === "string") {
    return crs["properties"]["name"];
  }
  return "an unrecognized coordinate system";
}

function forEachPosition(coordinates: unknown, visit: (lon: number, lat: number) => void): void {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visit(coordinates[0], coordinates[1]);
    return;
  }
  for (const part of coordinates) forEachPosition(part, visit);
}

/** Parses an uploaded boundary file. Throws a ValidationError that says what to fix; never repairs. */
export function parseBoundaryUpload(text: string): MultiPolygon {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) throw new ValidationError("That file isn't valid JSON. Upload a GeoJSON file.");
    throw err;
  }
  if (!isObject(document) || typeof document["type"] !== "string") {
    throw new ValidationError("That file isn't GeoJSON. It needs a top-level \"type\".");
  }

  const crs = crsName(document);
  if (crs !== null && !WGS84_NAMES.has(crs)) {
    throw new ValidationError(`That file uses ${crs}. UPlan accepts WGS 84 (EPSG:4326) longitude and latitude only.`);
  }

  // Unwrap a Feature, or a FeatureCollection holding exactly one feature, to its geometry.
  let geometry: unknown = document;
  if (document["type"] === "FeatureCollection") {
    const features = document["features"];
    if (!Array.isArray(features) || features.length !== 1) {
      throw new ValidationError("The file must hold exactly one boundary. It holds a different number of features.");
    }
    geometry = features[0];
  }
  if (isObject(geometry) && geometry["type"] === "Feature") geometry = geometry["geometry"];
  if (!isObject(geometry) || typeof geometry["type"] !== "string") {
    throw new ValidationError("That file has no geometry.");
  }

  const type = geometry["type"];
  if (type !== "Polygon" && type !== "MultiPolygon") {
    throw new ValidationError(`The file holds a ${type}. A boundary must be a Polygon or a MultiPolygon.`);
  }

  // A projected file with a "GeoJSON" name is the common mistake: its coordinates are in feet or
  // meters, far outside the range of longitude and latitude.
  let outOfRange = false;
  forEachPosition(geometry["coordinates"], (lon, lat) => {
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) outOfRange = true;
  });
  if (outOfRange) {
    throw new ValidationError(
      "These coordinates aren't longitude and latitude in WGS 84. If the file uses a projected coordinate system, convert it to WGS 84 first.",
    );
  }

  // A Polygon becomes a one-part MultiPolygon, which changes no coordinate.
  const multi = type === "Polygon" ? { type: "MultiPolygon", coordinates: [geometry["coordinates"]] } : geometry;
  const parsed = MultiPolygonSchema.safeParse({ type: "MultiPolygon", coordinates: multi["coordinates"] });
  if (!parsed.success) {
    throw new ValidationError(`The boundary isn't a valid polygon: ${parsed.error.issues[0]?.message ?? "unrecognized shape"}`);
  }
  return parsed.data;
}

const NAME_LIMIT = 120;

/** The file name as it is recorded in the revision's source note: printable characters only, and bounded. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7e]/g, "").trim().slice(0, NAME_LIMIT);
  return cleaned.length > 0 ? cleaned : "unnamed file";
}

export async function saveGeometryFromUpload(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
  file: { name: string; text: string },
  expectedRevision: number,
) {
  if (!/\.(geojson|json)$/i.test(file.name)) throw new ValidationError("Upload a .geojson or .json file.");
  if (file.text.length > MAX_UPLOAD_BYTES) throw new ValidationError("That file is larger than 2 MB.");
  const geom = parseBoundaryUpload(file.text);
  return saveGeometry(actor, decisionId, kind, geom, `Uploaded file: ${safeFileName(file.name)}`, expectedRevision);
}
