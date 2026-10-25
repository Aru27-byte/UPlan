import { pgTable, uuid, text, integer, jsonb, timestamp, check, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/research-phases.md — a planner's adopted narrative for one phase's report section. Append-only
// (a trigger in migration 0010 rejects UPDATE and DELETE): changing a mind records a new version. Foreign
// keys to decision, ai_suggestion, and this table itself are added by hand in migration 0010, because a
// module's tables.ts never imports another module's tables.

export type SectionTableFormatRow = { key: string; caption: string | null; columnOrder: string[] };
export type SectionContentRow = { headline: string; lines: string[]; tables: SectionTableFormatRow[] };

export const reportSectionVersion = pgTable(
  "report_section_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(),
    phase: text("phase").notNull(),
    versionNumber: integer("version_number").notNull(),
    source: text("source").notNull(),
    content: jsonb("content").$type<SectionContentRow>().notNull(),
    // sha256(canonicalJson(content)): what a change is bound to.
    contentSha256: text("content_sha256").notNull(),
    // The engine fingerprint it was built on (R7): a version never carries to different output.
    outputSha256: text("output_sha256").notNull(),
    instruction: text("instruction"),
    suggestionId: uuid("suggestion_id"),
    sourceVersionId: uuid("source_version_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "report_section_version_phase_check",
      sql`${t.phase} in ('site', 'evidence', 'screening', 'studies', 'footprint', 'impact')`,
    ),
    check("report_section_version_source_check", sql`${t.source} in ('analysis', 'ai', 'revert')`),
    check(
      "report_section_version_instruction_shape",
      sql`${t.source} <> 'ai' or (${t.instruction} is not null and length(btrim(${t.instruction})) between 1 and 2000)`,
    ),
    check("report_section_version_number_check", sql`${t.versionNumber} > 0`),
    uniqueIndex("report_section_version_number").on(t.decisionId, t.phase, t.versionNumber),
    index("report_section_version_by_phase").on(t.decisionId, t.phase, t.createdAt),
  ],
);
