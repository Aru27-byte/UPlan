import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Geometry } from "geojson";

// Drizzle has no built-in PostGIS geometry type (TechDesign/alternatives-and-tradeoffs.md, D5:
// "Geometry columns need custom column types"). Every module that stores geometry (jurisdiction's
// boundary, dataset's coverage, evidence_feature.geom, decision_geometry.geom) uses this one
// helper for the column definition and for every WRITE.
//
// Writing (`db.insert(...).values({ geom: someGeoJSON })`) always goes through `toDriver`, which
// returns a raw SQL fragment — `ST_GeomFromGeoJSON` runs on the database side, so the value is
// never sent as an ad-hoc text encoding PostGIS's implicit cast would have to guess at.
//
// Reading is NOT symmetric, and can't be made so through Drizzle's customType hook alone: a plain
// `db.select().from(table)` returns PostGIS's own wire format (EWKB), not GeoJSON, and this
// module has no way to rewrite the SELECT list Drizzle generates. Any call site that needs the
// geometry back as GeoJSON must ask for it explicitly, with `ST_AsGeoJSON(column)::json` in a raw
// `sql` query — `fromDriver` below only parses a JSON string, for exactly that case. A call site
// that only needs other columns should list them explicitly and leave the geometry column out,
// rather than let a plain `.select()`/`.returning()` try (and fail) to parse EWKB as JSON.
export function geometryColumn(geometryType: string, srid: number) {
  return customType<{ data: Geometry; driverData: string }>({
    dataType() {
      return `geometry(${geometryType}, ${srid})`;
    },
    toDriver(value: Geometry) {
      return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}), ${srid})`;
    },
    fromDriver(value: string): Geometry {
      return JSON.parse(value) as Geometry;
    },
  });
}
