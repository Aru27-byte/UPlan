import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/data-model.md ("Decisions and analysis"), TechDesign/evidence-base.md.
//
// Foreign keys to other modules' tables (decision, profile_version, profile_change, dataset_version)
// are declared in the hand-written migration `0005_integrity_and_immutability.sql`, not here:
// a module's tables.ts never imports another module's tables (file-structure-and-imports.md).
export const analysisRun = pgTable(
  "analysis_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(),
    purpose: text("purpose").notNull(),
    profileVersionId: uuid("profile_version_id"),
    profileChangeId: uuid("profile_change_id"),
    rulesResolvedFor: jsonb("rules_resolved_for").notNull().$type<Record<string, string>>(),
    studyAreaRevision: integer("study_area_revision").notNull(),
    footprintRevision: integer("footprint_revision"),
    // The shape of `results` (study-scoping.md). Part of input_sha256, and a run at another version
    // than the code's RESULTS_VERSION is reported as out of date, never parsed as best it can.
    resultsVersion: integer("results_version").notNull(),
    inputSha256: text("input_sha256").notNull(),
    status: text("status").notNull(),
    results: jsonb("results").$type<unknown>(),
    errorDetail: text("error_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // One run per set of inputs, and a failed run does not count: it is final (a trigger forbids changing it),
    // so a retry of the same inputs inserts a new run beside it (evidence-base.md R8).
    uniqueIndex("analysis_run_one_per_input")
      .on(t.decisionId, t.purpose, t.inputSha256)
      .where(sql`${t.status} <> 'failed'`),
    check("analysis_run_purpose_check", sql`${t.purpose} in ('current', 'preview')`),
    check("analysis_run_results_version_positive", sql`${t.resultsVersion} > 0`),
    check(
      "analysis_run_current_shape",
      sql`(${t.purpose} = 'current') = (${t.profileVersionId} is not null and ${t.profileChangeId} is null)`,
    ),
    check(
      "analysis_run_preview_shape",
      sql`(${t.purpose} = 'preview') = (${t.profileChangeId} is not null and ${t.profileVersionId} is null)`,
    ),
    check("analysis_run_running_shape", sql`(${t.status} = 'running') = (${t.finishedAt} is null)`),
    check("analysis_run_succeeded_shape", sql`${t.status} <> 'succeeded' or ${t.results} is not null`),
    check("analysis_run_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
    check("analysis_run_status_check", sql`${t.status} in ('running', 'succeeded', 'failed')`),
  ],
);

export const analysisRunDataset = pgTable(
  "analysis_run_dataset",
  {
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => analysisRun.id),
    datasetVersionId: uuid("dataset_version_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.analysisRunId, t.datasetVersionId] })],
);

// A planner's recorded reasoning about one disagreement between two dataset versions (F19). A note
// only: nothing computes from it, so it can't change a result (evidence-review.md). Append-only.
export const evidenceResolution = pgTable(
  "evidence_resolution",
  {
    decisionId: uuid("decision_id").notNull(),
    resourceTypeKey: text("resource_type_key").notNull(),
    mappedBy: uuid("mapped_by").notNull(), // dataset_version id, as in Disagreement.mappedBy
    notMappedBy: uuid("not_mapped_by").notNull(), // dataset_version id, as in Disagreement.notMappedBy
    revision: integer("revision").notNull(),
    reliedOn: text("relied_on").notNull(),
    rationale: text("rationale").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.decisionId, t.resourceTypeKey, t.mappedBy, t.notMappedBy, t.revision] }), // the guard for R10
    check("evidence_resolution_revision_positive", sql`${t.revision} > 0`),
    check("evidence_resolution_relied_on_check", sql`${t.reliedOn} in ('mapped_by', 'not_mapped_by', 'neither')`),
    check("evidence_resolution_rationale_not_empty", sql`length(btrim(${t.rationale})) > 0`),
    check("evidence_resolution_distinct_pair", sql`${t.mappedBy} <> ${t.notMappedBy}`),
  ],
);
