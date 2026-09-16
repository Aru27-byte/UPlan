import {
  pgTable,
  uuid,
  bigint,
  text,
  timestamp,
  jsonb,
  integer,
  check,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { geometryColumn } from "@/platform/geometry-column";

// TechDesign/data-model.md ("Evidence"), TechDesign/evidence-layers.md.
export const dataset = pgTable("dataset", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  license: text("license").notNull(),
  sourceUrl: text("source_url").notNull(),
  coverage: geometryColumn("MultiPolygon", 4326)("coverage").notNull(),
  currentVersionId: uuid("current_version_id"), // FK added after dataset_version exists
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  knownLimitation: text("known_limitation"), // R10 of evidence-layers.md: what this dataset can't show, e.g. trunk diameters
  // R3 of evidence-layers.md: confidence is decided once, when the dataset is set up — never
  // computed from the features ingested — and copied onto each new ready version at ingest time.
  confidenceDefault: text("confidence_default").notNull(),
  confidenceRationaleDefault: text("confidence_rationale_default").notNull(),
  // R2 of evidence-layers.md: either the source's attribute the publisher's own date comes from,
  // or (when the publisher gives no date) the fixed note every version of this dataset shows.
  publisherDateAttribute: text("publisher_date_attribute"),
  sourceAsOfNoteDefault: text("source_as_of_note_default"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const datasetVersion = pgTable(
  "dataset_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => dataset.id),
    status: text("status").notNull(),
    rawObjectKey: text("raw_object_key").notNull(),
    rawSha256: text("raw_sha256").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    sourceAsOf: text("source_as_of"), // date, nullable
    sourceAsOfNote: text("source_as_of_note"),
    confidence: text("confidence"),
    confidenceRationale: text("confidence_rationale"),
    processingSteps: jsonb("processing_steps").notNull().$type<{ step: string; [k: string]: unknown }[]>(),
    featureCount: integer("feature_count"),
    errorDetail: text("error_detail"),
  },
  (t) => [
    unique("dataset_version_one_per_file").on(t.datasetId, t.rawSha256), // partial (status <> 'failed') added in a hand migration
    check("dataset_version_status_check", sql`${t.status} in ('ingesting', 'ready', 'failed')`),
    check(
      "dataset_version_date_or_note",
      sql`${t.sourceAsOf} is not null or ${t.sourceAsOfNote} is not null`,
    ),
    check(
      "dataset_version_confidence_check",
      sql`${t.confidence} is null or ${t.confidence} in ('high', 'moderate', 'low')`,
    ),
    check(
      "dataset_version_ready_shape",
      sql`${t.status} <> 'ready' or (${t.confidence} is not null and ${t.confidenceRationale} is not null and ${t.featureCount} is not null)`,
    ),
    check("dataset_version_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
  ],
);

export const evidenceFeature = pgTable(
  "evidence_feature",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersion.id),
    sourceFeatureId: text("source_feature_id").notNull(),
    geom: geometryColumn("Geometry", 4326)("geom").notNull(), // ST_IsValid checked at insert time in ingest.ts
    attributes: jsonb("attributes").notNull().$type<Record<string, unknown>>(),
  },
  (t) => [unique("evidence_feature_one_per_source_id").on(t.datasetVersionId, t.sourceFeatureId)],
);

export const jurisdictionDataset = pgTable(
  "jurisdiction_dataset",
  {
    jurisdictionId: uuid("jurisdiction_id").notNull(), // FK added via follow-up ALTER TABLE (profiles owns jurisdiction)
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => dataset.id),
    resourceTypeKey: text("resource_type_key").notNull(),
    attributeMap: jsonb("attribute_map").notNull().$type<Record<string, string>>(),
  },
  (t) => [primaryKey({ columns: [t.jurisdictionId, t.datasetId] })],
);
