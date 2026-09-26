import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Supabase Auth holds identities, passwords, and sessions; this is UPlan's mirror of each person,
// keyed by the Supabase user id, so `created_by` / `granted_by` / `user_id` columns elsewhere have
// something to reference (TechDesign/data-model.md, accounts-roles.md). Only accounts'
// `provisionUser` writes it. Named `app_user` because `user` is reserved in PostgreSQL.
export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
