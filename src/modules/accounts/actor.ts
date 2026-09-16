import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/platform/db";

import { membership, staffMember } from "./tables";

export type Role = "planner" | "reviewer";

export type Actor = {
  userId: string;
  isStaff: boolean;
  memberships: { jurisdictionId: string; role: Role }[];
};

/**
 * Reads staff and membership status once per request/job and returns a plain object every module
 * function takes — never a raw session, and never re-queried mid-computation
 * (.claude/rules/conventions.md: "Pin exact versions in every computation").
 */
export async function getActor(db: DbOrTx, userId: string): Promise<Actor> {
  const [staffRow, membershipRows] = await Promise.all([
    db.select().from(staffMember).where(eq(staffMember.userId, userId)),
    db.select().from(membership).where(eq(membership.userId, userId)),
  ]);
  return {
    userId,
    isStaff: staffRow.length > 0,
    memberships: membershipRows.map((m) => ({ jurisdictionId: m.jurisdictionId, role: m.role as Role })),
  };
}
