import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Supabase Auth holds identities, passwords, and sessions; this is UPlan's record of each person
// (TechDesign/data-model.md, accounts-roles.md). `id` is UPlan's own stable key — every
// `created_by` / `granted_by` / `user_id` column elsewhere references it, and it never changes.
// `auth_id` is the Supabase user id that signs in as this person: null for a person from before
// UPlan moved to Supabase Auth, until an operator links them. Only accounts' `provisionUser`
// writes this table. Named `app_user` because `user` is reserved in PostgreSQL.
export const appUser = pgTable("app_user", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  authId: uuid("auth_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
