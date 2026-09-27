import { asc, eq, sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import { requireStaff, type Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { NotFoundError } from "@/platform/errors";

import { ProfileDocumentSchema } from "./schema";
import { jurisdiction, profileVersion } from "./tables";

export type NewJurisdiction = {
  name: string;
  stateCode: string;
  timeZone: string;
  analysisSrid: number;
  boundary: Geometry;
};

// Every column except `boundary`. A plain `.select()`/`.returning()` of a geometry column throws —
// PostGIS returns its own wire format (EWKB), not GeoJSON, and `fromDriver` only parses JSON (see
// platform/geometry-column.ts). The one read that needs the boundary back as GeoJSON is
// `getJurisdictionBoundary` below, with `ST_AsGeoJSON`, the same pattern decisions/geometry.ts uses.
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

// The city and its profile are not anyone's project (accounts-roles.md R3): every signed-in person
// may read them, so the reads below take no actor. `src/app/(app)/layout.tsx` requires sign-in for
// every page that calls them, and job bodies call them as system authority.
export async function getJurisdiction(jurisdictionId: string) {
  const [row] = await db
    .select(jurisdictionColumnsWithoutBoundary)
    .from(jurisdiction)
    .where(eq(jurisdiction.id, jurisdictionId));
  if (!row) throw new NotFoundError("jurisdiction");
  return row;
}

/** Every jurisdiction, by name. The one-city rule (exactly one exists in this release) is applied by the caller — src/app/_lib/city.ts. */
export async function listJurisdictions() {
  return db.select(jurisdictionColumnsWithoutBoundary).from(jurisdiction).orderBy(asc(jurisdiction.name));
}

/**
 * For the map workspace and geometry editors, so the camera has somewhere sensible to point when
 * a decision has no study area or footprint drawn yet — the one read that needs `ST_AsGeoJSON`.
 */
export async function getJurisdictionBoundary(jurisdictionId: string): Promise<Geometry> {
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

export type ProfileOverview = {
  jurisdictionId: string;
  cityName: string;
  stateCode: string;
  versionNumber: number | null; // null: no profile has been approved yet
  changedAt: Date | null;
  resourceTypeCount: number;
  ruleCount: number;
};

/**
 * For the dashboard's city profile panel (project-dashboard.md R6): the city, the current profile
 * version, when it last changed, and how much it holds. Counts only. With no approved profile the
 * version and date are null and the counts are zero, which is what is true — the page says so.
 */
export async function getProfileOverview(jurisdictionId: string): Promise<ProfileOverview> {
  const city = await getJurisdiction(jurisdictionId);
  const base = { jurisdictionId, cityName: city.name, stateCode: city.stateCode };
  if (!city.currentProfileVersionId) {
    return { ...base, versionNumber: null, changedAt: null, resourceTypeCount: 0, ruleCount: 0 };
  }
  const [version] = await db
    .select()
    .from(profileVersion)
    .where(eq(profileVersion.id, city.currentProfileVersionId));
  if (!version) throw new NotFoundError("profile version");
  // Re-validate rather than `as`-cast: untyped jsonb (conventions.md).
  const document = ProfileDocumentSchema.parse(version.document);
  return {
    ...base,
    versionNumber: version.versionNumber,
    changedAt: version.createdAt,
    resourceTypeCount: document.resourceTypes.length,
    ruleCount: document.bufferRules.length + document.studyTriggers.length + document.treeRules.length,
  };
}
