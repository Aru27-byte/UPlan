import { sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import { db } from "@/platform/db";

/**
 * R11 of evidence-layers.md: a dataset's spatial coverage is explicit, so "no data here" is told
 * apart from "nothing found". True when the dataset's recorded coverage reaches the study area. Shared
 * by the evidence base (a gap when it doesn't, F7 R4) and the screening register (no row, because the
 * gap is already stated once — F14 R7).
 */
export async function coverageReachesStudyArea(coverage: Geometry, studyAreaGeom: Geometry): Promise<boolean> {
  const [row] = await db
    .execute<{ intersects: boolean }>(
      sql`select ST_Intersects(
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(coverage)}), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(studyAreaGeom)}), 4326)
      ) as intersects`,
    )
    .then((r) => r.rows);
  if (!row) throw new Error("coverage check unexpectedly returned no row");
  return row.intersects;
}
