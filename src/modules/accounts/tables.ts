import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { appUser } from "@/platform/auth-tables";

// TechDesign/data-model.md — staff_member is the only right beyond being a planner. There is no
// membership table (removed 2026-09-27, accounts-roles.md): a project belongs to the person who
// created it, and every signed-in person is a planner.
export const staffMember = pgTable("staff_member", {
  userId: text("user_id")
    .primaryKey()
    .references(() => appUser.id),
  grantedBy: text("granted_by")
    .notNull()
    .references(() => appUser.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});
