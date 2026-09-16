import { pgTable, uuid, text, integer, date, timestamp, check, primaryKey } from "drizzle-orm/pg-core";
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
    status: text("status").notNull(),
    rowVersion: integer("row_version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "decision_application_type_check",
      sql`${t.applicationType} in ('subdivision', 'short_subdivision', 'clearing_grading')`,
    ),
    check("decision_status_check", sql`${t.status} in ('in_progress', 'report_released')`),
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
