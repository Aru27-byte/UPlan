import { eq, sql } from "drizzle-orm";
import type { Geometry } from "geojson";
import { z } from "zod";

import { requireStaff, type Actor } from "@/modules/accounts";
import { EvidenceAttributesSchema, type EvidenceAttributes, type EvidenceProvenance } from "@/modules/provenance";
import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { dataset, datasetVersion, jurisdictionDataset } from "./tables";

// R1 of evidence-layers.md: a dataset is only ingested from a free public source, checked once,
// at registration — not re-validated on every feature.
const FREE_PUBLIC_LICENSES = new Set(["Public domain", "CC0", "CC-BY", "CC-BY-4.0", "ODbL"]);

// R12 of evidence-layers.md: authority and spatial precision are required, recorded when a dataset is
// set up and never inferred from its features. Omitting either fails here, and the columns are
// `not null` with no default.
export const NewDatasetSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1),
  sourceUrl: z.url(),
  authority: z.enum(["federal", "state", "regional", "county", "local"]),
  spatialPrecision: z.enum(["site", "parcel", "regional", "coarse"]),
  // R13: true only for the illustrative datasets `installSampleEvidence` creates.
  isSample: z.boolean().optional(),
  coverage: z.custom<Geometry>((v) => typeof v === "object" && v !== null && "type" in v, "coverage must be GeoJSON"),
  knownLimitation: z.string().min(1).nullable(),
  confidenceDefault: z.enum(["high", "moderate", "low"]),
  confidenceRationaleDefault: z.string().min(1),
});
export type NewDataset = z.infer<typeof NewDatasetSchema>;

export type Dataset = {
  id: string;
  key: string;
  title: string;
  publisher: string;
  license: string;
  sourceUrl: string;
  authority: string;
  spatialPrecision: string;
  isSample: boolean;
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
  authority: dataset.authority,
  spatialPrecision: dataset.spatialPrecision,
  isSample: dataset.isSample,
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
  const parsed = NewDatasetSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  if (!FREE_PUBLIC_LICENSES.has(parsed.data.license)) {
    throw new ValidationError(`"${parsed.data.license}" is not a recognized free public license`);
  }
  const [insertedId] = await db.insert(dataset).values(parsed.data).returning({ id: dataset.id });
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
    .where(eq(jurisdictionDataset.jurisdictionId, jurisdictionId))
    // A fixed order, so two runs over the same mappings read them the same way (F7 R8: byte-identical results).
    .orderBy(jurisdictionDataset.resourceTypeKey, dataset.key);
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
      isSample: dataset.isSample,
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
    isSample: row.isSample,
  };
}

/** evidence-review.md R1–R4: the plain attributes behind an evidence item's confidence label, for `provenance.formatEvidenceAttributes`. */
export async function getDatasetVersionAttributes(datasetVersionId: string): Promise<EvidenceAttributes> {
  const [row] = await db
    .select({
      authority: dataset.authority,
      spatialPrecision: dataset.spatialPrecision,
      sourceAsOf: datasetVersion.sourceAsOf,
      sourceAsOfNote: datasetVersion.sourceAsOfNote,
      retrievedAt: datasetVersion.retrievedAt,
    })
    .from(datasetVersion)
    .innerJoin(dataset, eq(dataset.id, datasetVersion.datasetId))
    .where(eq(datasetVersion.id, datasetVersionId));
  if (!row) throw new NotFoundError("dataset version");
  // Parsed, not cast: the columns are plain text, and the schema is where the allowed values live.
  return EvidenceAttributesSchema.parse({
    authority: row.authority,
    sourceAsOfOn: row.sourceAsOf,
    sourceAsOfNote: row.sourceAsOfNote,
    retrievedAt: row.retrievedAt.toISOString(),
    spatialPrecision: row.spatialPrecision,
    verification: "mapped-remote", // R4: the only value in release 1
    professionalReview: "none", // R4: the only value in release 1
  });
}

export type DatasetVersionQuality = {
  datasetKey: string;
  datasetTitle: string;
  isSample: boolean; // evidence-layers.md R13
  datasetVersionId: string;
  retrievedAt: Date;
  sourceAsOfOn: string | null;
  sourceAsOfNote: string | null;
  knownLimitation: string | null;
  featureCount: number | null;
  repairedGeometryCount: number; // F3 R6: recorded by ingestion; zero when the version was never repaired
};

/** evidence-review.md R6: the data-quality panel's facts for one dataset version. */
export async function getDatasetVersionQuality(datasetVersionId: string): Promise<DatasetVersionQuality> {
  const [row] = await db
    .select({
      version: datasetVersion,
      datasetKey: dataset.key,
      title: dataset.title,
      isSample: dataset.isSample,
      limitation: dataset.knownLimitation,
    })
    .from(datasetVersion)
    .innerJoin(dataset, eq(dataset.id, datasetVersion.datasetId))
    .where(eq(datasetVersion.id, datasetVersionId));
  if (!row) throw new NotFoundError("dataset version");
  const repairStep = row.version.processingSteps.find((s) => s.step === "repair");
  const repaired = repairStep?.repairedCount;
  return {
    datasetKey: row.datasetKey,
    datasetTitle: row.title,
    isSample: row.isSample,
    datasetVersionId,
    retrievedAt: row.version.retrievedAt,
    sourceAsOfOn: row.version.sourceAsOf,
    sourceAsOfNote: row.version.sourceAsOfNote,
    knownLimitation: row.limitation,
    featureCount: row.version.featureCount,
    // A version that recorded no repair step has had no repair: a stated zero, not a hidden default.
    repairedGeometryCount: typeof repaired === "number" ? repaired : 0,
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
