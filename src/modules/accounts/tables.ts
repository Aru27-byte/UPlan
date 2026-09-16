import { pgTable, text, timestamp, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";

// TechDesign/data-model.md — membership and staff_member. Role is text with a CHECK list, not a
// PostgreSQL enum, so adding a role is a one-line migration (.claude/rules/conventions.md).
export const membership = pgTable(
  "membership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id),
    jurisdictionId: text("jurisdiction_id").notNull(), // FK to jurisdiction, declared in profiles/tables.ts to avoid a cycle
    role: text("role").notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => appUser.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.jurisdictionId, t.role] }),
    check("membership_role_check", sql`${t.role} in ('planner', 'reviewer')`),
  ],
);

export const staffMember = pgTable("staff_member", {
  userId: text("user_id")
    .primaryKey()
    .references(() => appUser.id),
  grantedBy: text("granted_by")
    .notNull()
    .references(() => appUser.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});
