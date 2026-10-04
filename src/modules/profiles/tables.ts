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
  ],
);
// A change is applied the moment it is made (profile-upload-edit.md R5, decided 2026-10-04): the row is written
// already approved, by the person who made it, so it is an audit record, not a request awaiting review. The
// 'pending' and 'rejected' statuses remain in the check list only for rows written before that decision.

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

// Where a city's rules come from (profile-upload-edit.md R12): a web page UPlan reads, or an Excel workbook a
// planner uploaded. An editable list kept by planners, so rows are renamed and removed in place; nothing else
// depends on one. A 'url' source has a url and no upload; an 'excel' source has the upload that supplied its
// current rules and no url.
export const profileSource = pgTable(
  "profile_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdiction.id),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    url: text("url"),
    uploadId: uuid("upload_id").references(() => profileUpload.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("profile_source_kind_check", sql`${t.kind} in ('url', 'excel')`),
    check("profile_source_label_not_empty", sql`length(btrim(${t.label})) > 0`),
    check("profile_source_url_shape", sql`(${t.kind} = 'url') = (${t.url} is not null)`),
    check("profile_source_upload_shape", sql`(${t.kind} = 'excel') = (${t.uploadId} is not null)`),
  ],
);
