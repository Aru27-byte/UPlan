import { pgTable, uuid, text, integer, timestamp, jsonb, char, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";
import { geometryColumn } from "@/platform/geometry-column";

// TechDesign/data-model.md ("Cities and people", "City profiles"). jurisdiction lives here because
// F1's own name is "Jurisdiction profile" and jurisdiction.current_profile_version_id points
// directly at profile_version — see TechDesign/jurisdiction-profile.md. membership (accounts
// module) references jurisdiction.id via a follow-up ALTER TABLE in the generated migration,
// the same forward-reference pattern data-model.md itself uses for profile_change.base_version_id.
export const jurisdiction = pgTable("jurisdiction", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  stateCode: char("state_code", { length: 2 }).notNull(),
  timeZone: text("time_zone").notNull(),
  analysisSrid: integer("analysis_srid").notNull(),
  boundary: geometryColumn("MultiPolygon", 4326)("boundary").notNull(),
  currentProfileVersionId: uuid("current_profile_version_id"), // FK added below, after profile_version exists
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profileUpload = pgTable(
  "profile_upload",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdiction.id),
    objectKey: text("object_key").notNull(),
    fileSha256: text("file_sha256").notNull(),
    templateVersion: integer("template_version"),
    validationErrors: jsonb("validation_errors").notNull().$type<string[]>(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => appUser.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("profile_upload_jurisdiction_hash").on(t.jurisdictionId, t.fileSha256),
    check(
      "profile_upload_valid_or_errored",
      sql`${t.templateVersion} is not null or jsonb_array_length(${t.validationErrors}) > 0`,
    ),
  ],
);

export const profileChange = pgTable(
  "profile_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdiction.id),
    baseVersionId: uuid("base_version_id"), // FK added below, after profile_version exists
    proposedDocument: jsonb("proposed_document").notNull(),
    source: text("source").notNull(),
    uploadId: uuid("upload_id").references(() => profileUpload.id),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => appUser.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by").references(() => appUser.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
  },
  (t) => [
    check("profile_change_source_check", sql`${t.source} in ('upload', 'edit', 'code_change')`),
    check("profile_change_status_check", sql`${t.status} in ('pending', 'approved', 'rejected')`),
    check("profile_change_reason_not_empty", sql`length(${t.reason}) > 0`),
    check(
      "profile_change_decided_shape",
      sql`(${t.status} = 'pending') = (${t.decidedBy} is null and ${t.decidedAt} is null)`,
    ),
    check("profile_change_upload_shape", sql`(${t.source} = 'upload') = (${t.uploadId} is not null)`),
    check(
      "profile_change_no_self_approval",
      sql`${t.decidedBy} is null or ${t.decidedBy} <> ${t.proposedBy}`,
    ),
  ],
);
// One pending change per city (R5 of profile-upload-edit.md): partial unique index, added in a
// hand-written migration since Drizzle's table builder has no partial-index helper pre-1.0.
// create unique index profile_change_one_pending on profile_change (jurisdiction_id) where status = 'pending';

export const profileVersion = pgTable(
  "profile_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdiction.id),
    versionNumber: integer("version_number").notNull(),
    document: jsonb("document").notNull(),
    documentSha256: text("document_sha256").notNull(),
    changeId: uuid("change_id")
      .notNull()
      .unique()
      .references(() => profileChange.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("profile_version_jurisdiction_number").on(t.jurisdictionId, t.versionNumber),
    check("profile_version_number_positive", sql`${t.versionNumber} > 0`),
  ],
);
