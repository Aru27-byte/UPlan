import { eq, sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import { requireMembership, requireStaff, type Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { NotFoundError } from "@/platform/errors";

import { jurisdiction } from "./tables";

export type NewJurisdiction = {
  name: string;
  stateCode: string;
  timeZone: string;
  analysisSrid: number;
  boundary: Geometry;
};

// Every column except `boundary`. Nothing in this codebase currently reads a jurisdiction's
// boundary back as GeoJSON, and a plain `.select()`/`.returning()` of a geometry column throws —
// PostGIS returns its own wire format (EWKB), not GeoJSON, and `fromDriver` only parses JSON (see
// platform/geometry-column.ts). The day something needs the boundary back, that one read gets its
// own query with `ST_AsGeoJSON(boundary)::json`, the same pattern decisions/geometry.ts uses.
export const jurisdictionColumnsWithoutBoundary = {
  id: jurisdiction.id,
  name: jurisdiction.name,
  stateCode: jurisdiction.stateCode,
  timeZone: jurisdiction.timeZone,
  analysisSrid: jurisdiction.analysisSrid,
  currentProfileVersionId: jurisdiction.currentProfileVersionId,
  createdAt: jurisdiction.createdAt,
};

export async function createJurisdiction(actor: Actor, input: NewJurisdiction) {
  requireStaff(actor); // only UPlan staff create a jurisdiction (jurisdiction-profile.md)
  const [row] = await db.insert(jurisdiction).values(input).returning(jurisdictionColumnsWithoutBoundary);
  if (!row) throw new Error("insert into jurisdiction unexpectedly returned no row");
  return row;
}

export async function getJurisdiction(actor: Actor, jurisdictionId: string) {
  const row = await getJurisdictionForAnalysis(jurisdictionId);
  requireMembership(actor, jurisdictionId); // any role
  return row;
}

/**
 * For the map workspace and geometry editors, so the camera has somewhere sensible to point when
 * a decision has no study area or footprint drawn yet — the one read this file's own comment on
 * `jurisdictionColumnsWithoutBoundary` said would need `ST_AsGeoJSON`, same as decisions/geometry.ts.
 */
export async function getJurisdictionBoundary(actor: Actor, jurisdictionId: string): Promise<Geometry> {
  requireMembership(actor, jurisdictionId); // any role
  const [row] = await db
    .execute<{ boundary_geojson: string }>(
      sql`select ST_AsGeoJSON(boundary) as boundary_geojson from jurisdiction where id = ${jurisdictionId}`,
    )
    .then((r) => r.rows);
  if (!row) throw new NotFoundError("jurisdiction");
  return JSON.parse(row.boundary_geojson) as Geometry;
}

/** Internal (system-authority) read for the daily maintenance sweep (apply_effective_dates, flag_retention). */
export async function listJurisdictionIds(): Promise<string[]> {
  const rows = await db.select({ id: jurisdiction.id }).from(jurisdiction);
  return rows.map((r) => r.id);
}

/** Internal (system-authority) read for job bodies such as run_analysis — no actor to check membership for. */
export async function getJurisdictionForAnalysis(jurisdictionId: string) {
  // `db` is deliberately schema-less (see platform/db.ts) so platform never imports module
  // tables — the query builder is used everywhere instead of Drizzle's relational `db.query` API.
  const [row] = await db
    .select(jurisdictionColumnsWithoutBoundary)
    .from(jurisdiction)
    .where(eq(jurisdiction.id, jurisdictionId));
  if (!row) throw new NotFoundError("jurisdiction");
  return row;
}
