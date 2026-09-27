import { pgTable, uuid, text, integer, date, timestamp, check, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";
import { geometryColumn } from "@/platform/geometry-column";

// TechDesign/data-model.md ("Decisions and analysis"), TechDesign/decisions.md.
export const decision = pgTable(
  "decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id").notNull(), // FK added via follow-up ALTER TABLE (profiles owns jurisdiction)
    title: text("title").notNull(),
    permitNumber: text("permit_number"),
    applicationType: text("application_type").notNull(),
    applicationFiledOn: date("application_filed_on"),
    // Project details (F5 R10): nullable because each is a fact that may not exist yet, like
    // permit_number. Only application_filed_on feeds an analysis.
    parcelOrAddress: text("parcel_or_address"),
    applicant: text("applicant"),
    projectManager: text("project_manager"),
    targetDecisionOn: date("target_decision_on"),
    status: text("status").notNull(),
    rowVersion: integer("row_version").notNull().default(1),
    // The owner: the only person who can see or change the decision (accounts-roles.md R3).
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete (F20 R5, D25): the row and everything under it stay, because working data may
    // be public record.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => appUser.id),
  },
  (t) => [
    check(
      "decision_application_type_check",
      sql`${t.applicationType} in ('subdivision', 'short_subdivision', 'clearing_grading')`,
    ),
    check("decision_status_check", sql`${t.status} in ('in_progress', 'finishing', 'report_released')`),
    check("decision_deleted_shape", sql`(${t.deletedAt} is null) = (${t.deletedBy} is null)`),
    index("decision_by_owner")
      .on(t.createdBy, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const decisionGeometry = pgTable(
  "decision_geometry",
  {
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => decision.id),
    kind: text("kind").notNull(),
    revision: integer("revision").notNull(),
    geom: geometryColumn("MultiPolygon", 4326)("geom").notNull(),
    sourceNote: text("source_note").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.decisionId, t.kind, t.revision] }), // two saves of the same revision: the second fails (R5/R6)
    check("decision_geometry_kind_check", sql`${t.kind} in ('study_area', 'footprint')`),
    check("decision_geometry_revision_positive", sql`${t.revision} > 0`),
  ],
);
