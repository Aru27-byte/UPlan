import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  check,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// TechDesign/data-model.md ("Decisions and analysis"), TechDesign/evidence-base.md.
export const analysisRun = pgTable(
  "analysis_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(), // FK added via follow-up ALTER TABLE (decisions owns decision)
    purpose: text("purpose").notNull(),
    profileVersionId: uuid("profile_version_id"), // FK added via follow-up ALTER TABLE (profiles owns profile_version)
    profileChangeId: uuid("profile_change_id"), // FK added via follow-up ALTER TABLE (profiles owns profile_change)
    rulesResolvedFor: jsonb("rules_resolved_for").notNull().$type<Record<string, string>>(),
    studyAreaRevision: integer("study_area_revision").notNull(),
    footprintRevision: integer("footprint_revision"),
    inputSha256: text("input_sha256").notNull(),
    status: text("status").notNull(),
    results: jsonb("results").$type<unknown>(),
    errorDetail: text("error_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("analysis_run_one_per_input").on(t.decisionId, t.purpose, t.inputSha256),
    check("analysis_run_purpose_check", sql`${t.purpose} in ('current', 'preview')`),
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
    datasetVersionId: uuid("dataset_version_id").notNull(), // FK added via follow-up ALTER TABLE (evidence owns dataset_version)
  },
  (t) => [primaryKey({ columns: [t.analysisRunId, t.datasetVersionId] })],
);
