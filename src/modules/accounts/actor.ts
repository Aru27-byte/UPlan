import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/platform/db";

import { staffMember } from "./tables";

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
