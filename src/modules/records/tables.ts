import { pgTable, uuid, text, date, timestamp, jsonb, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/data-model.md ("Records"), TechDesign/records-export.md.
export const retentionFlag = pgTable(
  "retention_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id").notNull(), // FK added via follow-up ALTER TABLE (profiles owns jurisdiction)
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    eligibleOn: date("eligible_on").notNull(),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text("reviewed_by").references(() => appUser.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    outcome: text("outcome"),
  },
  (t) => [
    unique("retention_flag_one_per_record").on(t.recordType, t.recordId),
    check("retention_flag_outcome_check", sql`${t.outcome} is null or ${t.outcome} in ('keep', 'dispose')`),
    check(
      "retention_flag_review_shape",
      sql`(${t.outcome} is null) = (${t.reviewedAt} is null and ${t.reviewedBy} is null)`,
    ),
  ],
);

export const recordsExport = pgTable(
  "records_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id").notNull(), // FK added via follow-up ALTER TABLE (profiles owns jurisdiction)
    scope: jsonb("scope").notNull().$type<ExportScope>(),
    format: text("format").notNull(),
    status: text("status").notNull(),
    objectKey: text("object_key"),
    sha256: text("sha256"),
    errorDetail: text("error_detail"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => appUser.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    check("records_export_status_check", sql`${t.status} in ('building', 'ready', 'failed')`),
    check(
      "records_export_ready_shape",
      sql`(${t.status} = 'ready') = (${t.objectKey} is not null and ${t.sha256} is not null)`,
    ),
    check("records_export_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
  ],
);

export type ExportScope = {
  recordTypes: ("decision" | "report" | "profile-change" | "records-export")[];
  from: string | null;
  to: string | null;
};
