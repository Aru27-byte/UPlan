import { eq, sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import { requireStaff, type Actor } from "@/modules/accounts";
import type { EvidenceProvenance } from "@/modules/provenance";
import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { dataset, datasetVersion, jurisdictionDataset } from "./tables";

// R1 of evidence-layers.md: a dataset is only ingested from a free public source, checked once,
// at registration — not re-validated on every feature.
const FREE_PUBLIC_LICENSES = new Set(["Public domain", "CC0", "CC-BY", "CC-BY-4.0", "ODbL"]);

export type NewDataset = {
  key: string;
  title: string;
  publisher: string;
  license: string;
  sourceUrl: string;
  coverage: Geometry;
  knownLimitation: string | null;
  confidenceDefault: "high" | "moderate" | "low";
  confidenceRationaleDefault: string;
};

export type Dataset = {
  id: string;
  key: string;
  title: string;
  publisher: string;
  license: string;
  sourceUrl: string;
  coverage: Geometry;
  currentVersionId: string | null;
  lastCheckedAt: Date | null;
  knownLimitation: string | null;
  confidenceDefault: string;
  confidenceRationaleDefault: string;
  publisherDateAttribute: string | null;
  sourceAsOfNoteDefault: string | null;
};

// Every column except `coverage`, plus `coverage` re-expressed through `ST_AsGeoJSON` so a plain
// select gets real GeoJSON back instead of PostGIS's own wire format — see the note in
// platform/geometry-column.ts on why a bare `.select()` of a geometry column can't do this itself.
const datasetColumnsWithCoverageAsGeoJson = {
  id: dataset.id,
  key: dataset.key,
  title: dataset.title,
  publisher: dataset.publisher,
  license: dataset.license,
  sourceUrl: dataset.sourceUrl,
  coverageGeoJson: sql<string>`ST_AsGeoJSON(${dataset.coverage})`,
  currentVersionId: dataset.currentVersionId,
  lastCheckedAt: dataset.lastCheckedAt,
  knownLimitation: dataset.knownLimitation,
  confidenceDefault: dataset.confidenceDefault,
  publisherDateAttribute: dataset.publisherDateAttribute,
  sourceAsOfNoteDefault: dataset.sourceAsOfNoteDefault,
  confidenceRationaleDefault: dataset.confidenceRationaleDefault,
};

function toDataset(row: { coverageGeoJson: string } & Omit<Dataset, "coverage">): Dataset {
  const { coverageGeoJson, ...rest } = row;
  return { ...rest, coverage: JSON.parse(coverageGeoJson) as Geometry };
}

export async function createDataset(actor: Actor, input: NewDataset): Promise<Dataset> {
  requireStaff(actor);
  if (!FREE_PUBLIC_LICENSES.has(input.license)) {
    throw new ValidationError(`"${input.license}" is not a recognized free public license`);
  }
  const [insertedId] = await db.insert(dataset).values(input).returning({ id: dataset.id });
  if (!insertedId) throw new Error("insert into dataset unexpectedly returned no row");
  const created = await getDataset(insertedId.id);
  if (!created) throw new Error("dataset disappeared immediately after insert");
  return created;
}

export async function getDataset(datasetId: string): Promise<Dataset | null> {
  const [row] = await db
    .select(datasetColumnsWithCoverageAsGeoJson)
    .from(dataset)
    .where(eq(dataset.id, datasetId));
  return row ? toDataset(row) : null;
}

export async function mapToJurisdiction(
  actor: Actor,
  jurisdictionId: string,
  datasetId: string,
  resourceTypeKey: string,
  attributeMap: Record<string, string>,
): Promise<void> {
  requireStaff(actor);
  await db
    .insert(jurisdictionDataset)
    .values({ jurisdictionId, datasetId, resourceTypeKey, attributeMap })
    .onConflictDoUpdate({
      target: [jurisdictionDataset.jurisdictionId, jurisdictionDataset.datasetId],
      set: { resourceTypeKey, attributeMap },
    });
}

export type JurisdictionDatasetMapping = {
  resourceTypeKey: string;
  attributeMap: Record<string, string>;
  dataset: Dataset;
};

export async function getJurisdictionDatasetMappings(
  jurisdictionId: string,
  tx: DbOrTx = db,
): Promise<JurisdictionDatasetMapping[]> {
  const rows = await tx
    .select({ mapping: jurisdictionDataset, dataset: datasetColumnsWithCoverageAsGeoJson })
    .from(jurisdictionDataset)
    .innerJoin(dataset, eq(dataset.id, jurisdictionDataset.datasetId))
    .where(eq(jurisdictionDataset.jurisdictionId, jurisdictionId));
  return rows.map((r) => ({
    resourceTypeKey: r.mapping.resourceTypeKey,
    attributeMap: r.mapping.attributeMap,
    dataset: toDataset(r.dataset),
  }));
}

/** The raw fields `provenance.formatEvidenceProvenance` needs for one dataset version — used by `reports` (R2 of provenance.md). */
export async function getDatasetVersionProvenance(datasetVersionId: string): Promise<EvidenceProvenance> {
  const [row] = await db
    .select({
      version: datasetVersion,
      publisher: dataset.publisher,
      license: dataset.license,
      sourceUrl: dataset.sourceUrl,
    })
    .from(datasetVersion)
    .innerJoin(dataset, eq(dataset.id, datasetVersion.datasetId))
    .where(eq(datasetVersion.id, datasetVersionId));
  if (!row) throw new NotFoundError("dataset version");
  if (!row.version.confidence || !row.version.confidenceRationale) {
    throw new Error(`dataset version ${datasetVersionId} is not ready — has no confidence recorded`);
  }
  return {
    publisher: row.publisher,
    license: row.license,
    sourceUrl: row.sourceUrl,
    sourceAsOn: row.version.sourceAsOf,
    sourceAsOfNote: row.version.sourceAsOfNote,
    retrievedAt: row.version.retrievedAt.toISOString(),
    confidence: row.version.confidence as EvidenceProvenance["confidence"],
    confidenceRationale: row.version.confidenceRationale,
  };
}

/** Called by profiles' approval transaction before it moves the current pointer (R9 of jurisdiction-profile.md). */
export async function getMappedResourceTypeKeys(tx: DbOrTx, jurisdictionId: string): Promise<string[]> {
  const rows = await tx
    .select({ resourceTypeKey: jurisdictionDataset.resourceTypeKey })
    .from(jurisdictionDataset)
    .where(eq(jurisdictionDataset.jurisdictionId, jurisdictionId));
  return [...new Set(rows.map((r) => r.resourceTypeKey))];
}
