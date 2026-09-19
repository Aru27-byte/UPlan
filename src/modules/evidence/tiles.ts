import { sql } from "drizzle-orm";

import { db } from "@/platform/db";

// TechDesign/evidence-layers.md, R9: a tile URL names its dataset version, so it's immutable and
// cacheable forever — served by a route handler at /api/tiles/[datasetVersionId]/[z]/[x]/[y].
//
// ST_TileEnvelope returns its box in EPSG:3857 (Web Mercator, meters); evidence_feature.geom is
// stored in EPSG:4326 (WGS84, degrees) — see platform/geometry-column.ts. A bare `geom &&
// ST_TileEnvelope(...)` compares a degree-scale bounding box against a meter-scale one, which
// never overlaps at any real-world zoom/x/y: every tile came back empty, for every dataset, at
// every zoom, until this was caught by actually requesting a tile end-to-end rather than only
// checking that evidence_feature rows existed. Fixed by transforming the tile envelope to 4326 for
// the row filter (keeps evidence_feature's own GIST index on `geom` usable — transforming `geom`
// itself in the WHERE clause instead would transform it per row, on every request) and transforming
// `geom` to 3857 only in the SELECT, where ST_AsMVTGeom actually needs it in tile-pixel space.
export async function mvtTile(datasetVersionId: string, z: number, x: number, y: number): Promise<Buffer> {
  const result = await db.execute<{ mvt: Buffer }>(sql`
    select ST_AsMVT(tile, 'layer', 4096, 'geom') as mvt from (
      select ST_AsMVTGeom(ST_Transform(geom, 3857), ST_TileEnvelope(${z}, ${x}, ${y}), 4096, 64, true) as geom, attributes
      from evidence_feature
      where dataset_version_id = ${datasetVersionId}
        and geom && ST_Transform(ST_TileEnvelope(${z}, ${x}, ${y}), 4326)
    ) as tile
  `);
  // ST_AsMVT returns NULL over zero input rows — an honest empty tile (no features here), not a
  // failure being papered over (best-practices.md: "a true empty state shown as exactly that").
  return result.rows[0]?.mvt ?? Buffer.alloc(0);
}
