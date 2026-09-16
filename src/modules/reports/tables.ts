import { pgTable, uuid, text, integer, timestamp, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/data-model.md ("Reports"), TechDesign/locked-report.md.
export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(), // FK added via follow-up ALTER TABLE (decisions owns decision)
    sequenceNumber: integer("sequence_number").notNull(),
    analysisRunId: uuid("analysis_run_id").notNull(), // FK added via follow-up ALTER TABLE (analysis owns analysis_run); must be a 'current' run, checked on insert
    templateVersion: integer("template_version").notNull(),
    status: text("status").notNull(),
    objectKey: text("object_key").notNull(),
    pdfSha256: text("pdf_sha256"),
    errorDetail: text("error_detail"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => appUser.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    unique("report_decision_sequence").on(t.decisionId, t.sequenceNumber),
    check("report_sequence_positive", sql`${t.sequenceNumber} > 0`),
    check("report_status_check", sql`${t.status} in ('releasing', 'released', 'failed')`),
    check(
      "report_released_shape",
      sql`(${t.status} = 'released') = (${t.pdfSha256} is not null and ${t.releasedAt} is not null)`,
    ),
    check("report_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
  ],
);
// One release in flight per decision (R11 of locked-report.md), added as a partial unique index in
// a hand-written migration: create unique index report_one_releasing on report (decision_id) where status = 'releasing';
