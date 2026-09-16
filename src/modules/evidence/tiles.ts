import { sql } from "drizzle-orm";

import { db } from "@/platform/db";

// TechDesign/evidence-layers.md, R9: a tile URL names its dataset version, so it's immutable and
// cacheable forever — served by a route handler at /api/tiles/[datasetVersionId]/[z]/[x]/[y].
export async function mvtTile(datasetVersionId: string, z: number, x: number, y: number): Promise<Buffer> {
  const result = await db.execute<{ mvt: Buffer }>(sql`
    select ST_AsMVT(tile, 'layer', 4096, 'geom') as mvt from (
      select ST_AsMVTGeom(geom, ST_TileEnvelope(${z}, ${x}, ${y}), 4096, 64, true) as geom, attributes
      from evidence_feature
      where dataset_version_id = ${datasetVersionId}
        and geom && ST_TileEnvelope(${z}, ${x}, ${y})
    ) as tile
  `);
  // ST_AsMVT returns NULL over zero input rows — an honest empty tile (no features here), not a
  // failure being papered over (best-practices.md: "a true empty state shown as exactly that").
  return result.rows[0]?.mvt ?? Buffer.alloc(0);
}
