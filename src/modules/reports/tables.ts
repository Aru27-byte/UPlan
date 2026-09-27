import { pgTable, uuid, text, integer, timestamp, check, unique, jsonb, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// node-postgres returns a bytea column as a Buffer and takes a Buffer back, so the custom type only
// has to name the column's SQL type.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// TechDesign/data-model.md ("Reports"), TechDesign/locked-report.md, TechDesign/research-changes.md.
// One row per attempt to publish a project's final document; a released row is one version.
// `decision_id` and `analysis_run_id` reference their tables through migration 0005.
export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(), // numbers attempts, so a retry never collides
    versionNumber: integer("version_number"), // numbers published documents; assigned at release, no gaps
    analysisRunId: uuid("analysis_run_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    status: text("status").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<unknown>(), // ReportSnapshot (reports/snapshot.ts)
    changeNote: text("change_note"),
    pdf: bytea("pdf"), // the document itself, kept in the database (F22 R1, D23)
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
    // Version numbers are unique per project, and only released rows have one: a partial unique
    // index in migration 0005 (report_one_version).
    check("report_sequence_positive", sql`${t.sequenceNumber} > 0`),
    check("report_version_positive", sql`${t.versionNumber} is null or ${t.versionNumber} > 0`),
    check("report_status_check", sql`${t.status} in ('releasing', 'released', 'failed')`),
    check(
      "report_released_shape",
      sql`(${t.status} = 'released') = (${t.pdf} is not null and ${t.pdfSha256} is not null and ${t.releasedAt} is not null and ${t.versionNumber} is not null)`,
    ),
    check("report_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
  ],
);
