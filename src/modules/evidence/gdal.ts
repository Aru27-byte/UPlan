import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/platform/db";
import { env } from "@/platform/env";

const execFileAsync = promisify(execFile);

export type StagedSource = {
  stagingTable: string;
  extractPublisherDate(attribute: string): string | null;
  rows: { attributes: Record<string, unknown> }[];
};

// TechDesign/evidence-layers.md, D11 (alternatives-and-tradeoffs.md): the worker runs `ogr2ogr` to
// load public source data into a staging table; SQL (ST_MakeValid/ST_IsValid) then does every
// repair, never JavaScript geometry code. Requires GDAL on PATH — present in the `worker` image
// (Dockerfile), not necessarily on a developer's machine.
export async function loadWithOgr2ogr(rawObjectKey: string, rawBuffer: Buffer): Promise<StagedSource> {
  const dir = await mkdtemp(join(tmpdir(), "uplan-ingest-"));
  const inputPath = join(dir, rawObjectKey.split("/").pop() ?? "source.data");
  await writeFile(inputPath, rawBuffer);

  const stagingTable = `staging_${randomUUID().replace(/-/g, "")}`;
  try {
    await execFileAsync("ogr2ogr", [
      "-f",
      "PostgreSQL",
      `PG:${env.DATABASE_URL}`,
      inputPath,
      "-nln",
      stagingTable,
      "-nlt",
      "PROMOTE_TO_MULTI",
      "-lco",
      "GEOMETRY_NAME=geom",
      "-overwrite",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const rows = await db.execute<{ attributes: Record<string, unknown> }>(
    sql.raw(`select to_jsonb(t) - 'geom' as attributes from ${stagingTable} t`),
  );

  return {
    stagingTable,
    rows: rows.rows,
    extractPublisherDate(attribute: string): string | null {
      const value = rows.rows[0]?.attributes[attribute];
      return typeof value === "string" ? value : null;
    },
  };
}

export type RepairedFeature = { id: string; geom: GeoJSON.Geometry; attributes: Record<string, unknown> };

/** The one place source geometry is repaired — never a planner's drawn geometry (R6/R7 of evidence-layers.md). */
export async function repairAndValidate(
  staged: StagedSource,
): Promise<{ repairedCount: number; features: RepairedFeature[] }> {
  const rows = await db.execute<{
    id: string;
    geom: string;
    attributes: Record<string, unknown>;
    was_repaired: boolean;
  }>(
    sql.raw(`
      select
        coalesce((to_jsonb(t) ->> 'ogc_fid'), md5(ST_AsBinary(t.geom)::text)) as id,
        ST_AsGeoJSON(ST_MakeValid(t.geom)) as geom,
        to_jsonb(t) - 'geom' as attributes,
        not ST_IsValid(t.geom) as was_repaired
      from ${staged.stagingTable} t
      where t.geom is not null
    `),
  );

  await db.execute(sql.raw(`drop table if exists ${staged.stagingTable}`));

  const repairedCount = rows.rows.filter((r) => r.was_repaired).length;
  const features = rows.rows.map((r) => ({
    id: r.id,
    geom: JSON.parse(r.geom) as GeoJSON.Geometry,
    attributes: r.attributes,
  }));
  return { repairedCount, features };
}
