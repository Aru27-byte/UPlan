import { pgTable, uuid, text, jsonb, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/research-phases.md — a planner's recorded response to one phase's drafted output.
// Append-only (a trigger in migration 0005 rejects UPDATE and DELETE): changing a mind records a new
// review. `decision_id` references decision(id) through migration 0005, not here, because a
// module's tables.ts never imports another module's tables.
export const phaseReview = pgTable(
  "phase_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull(),
    phase: text("phase").notNull(),
    // The fingerprint of the output that was reviewed (R7): a review never carries to different output.
    contentSha256: text("content_sha256").notNull(),
    verdict: text("verdict").notNull(),
    note: text("note"),
    // { templateVersion, headline, lines } as it was shown, so the history stays readable after a
    // template's wording changes.
    summary: jsonb("summary").notNull().$type<unknown>(),
    reviewedBy: text("reviewed_by")
      .notNull()
      .references(() => appUser.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "phase_review_phase_check",
      sql`${t.phase} in ('site', 'evidence', 'screening', 'studies', 'footprint', 'impact')`,
    ),
    check("phase_review_verdict_check", sql`${t.verdict} in ('reviewed', 'revision_requested')`),
    check(
      "phase_review_note_shape",
      sql`${t.verdict} <> 'revision_requested' or (${t.note} is not null and length(btrim(${t.note})) > 0)`,
    ), // R6: a revision request always says what needs work
    index("phase_review_by_phase").on(t.decisionId, t.phase, t.reviewedAt),
  ],
);
