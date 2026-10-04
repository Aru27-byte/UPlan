import { and, eq, sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";
import type { DbOrTx } from "@/platform/db";

import { staffMember } from "./tables";
import { provisionUser } from "./users";

export type Actor = {
  userId: string; // app_user.id — UPlan's id for the person, not the Supabase user id
  isStaff: boolean;
};

/**
 * Reads staff status once per request/job and returns a plain object every module function takes
 * — never a raw session, and never re-queried mid-computation (.claude/rules/conventions.md: "Pin
 * exact versions in every computation").
 */
export async function getActor(db: DbOrTx, userId: string): Promise<Actor> {
  const staffRows = await db.select().from(staffMember).where(eq(staffMember.userId, userId));
  return { userId, isStaff: staffRows.length > 0 };
}

/**
 * The Actor for a signed-in Supabase identity, provisioned if need be (accounts-roles.md, R2).
 *
 * This runs on every page render, so the usual case — the person exists and their email and name are
 * unchanged — costs one read that answers both "who" and "staff?". Only a new person, or one whose email
 * or name changed, goes through provisionUser's write and a second read; that is the same operation done
 * the long way, not a substitute for it, and a failure in either path propagates.
 */
export async function resolveActor(db: DbOrTx, user: { authId: string; email: string; name: string }): Promise<Actor> {
  const [known] = await db
    .select({
      id: appUser.id,
      isStaff: sql<boolean>`exists (select 1 from ${staffMember} where ${staffMember.userId} = ${appUser.id})`,
    })
    .from(appUser)
    .where(and(eq(appUser.authId, user.authId), eq(appUser.email, user.email), eq(appUser.name, user.name)));
  if (known) return { userId: known.id, isStaff: known.isStaff };

  return getActor(db, await provisionUser(db, user));
}
