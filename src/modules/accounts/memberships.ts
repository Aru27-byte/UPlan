import { and, eq, sql } from "drizzle-orm";

import { db } from "@/platform/db";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";

import type { Actor, Role } from "./actor";
import { requireStaff } from "./access";
import { membership } from "./tables";

async function findUserIdByEmail(email: string): Promise<string | null> {
  // app_user is the mirror of Supabase identities, written by provisionUser; queried by raw SQL here
  // rather than importing its Drizzle table object, since that lives with platform/auth wiring.
  const result = await db.execute<{ id: string }>(
    sql`select id from app_user where email = ${email} limit 1`,
  );
  return result.rows[0]?.id ?? null;
}

/** Only UPlan staff grant access, in release 1 (R4, R8). Requires the person to have signed in once (R2 — no email/invite service exists). */
export async function grantMembership(
  actor: Actor,
  jurisdictionId: string,
  userEmail: string,
  role: Role,
): Promise<void> {
  requireStaff(actor);
  const userId = await findUserIdByEmail(userEmail);
  if (!userId)
    throw new ValidationError(`${userEmail} must sign in at least once before being granted access`);
  try {
    await db.insert(membership).values({ userId, jurisdictionId, role, grantedBy: actor.userId });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ConflictError(`${userEmail} already has the ${role} role for this jurisdiction`);
    throw err;
  }
}

export async function revokeMembership(
  actor: Actor,
  jurisdictionId: string,
  userId: string,
  role: Role,
): Promise<void> {
  requireStaff(actor);
  await db
    .delete(membership)
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.jurisdictionId, jurisdictionId),
        eq(membership.role, role),
      ),
    );
}

export async function listMemberships(actor: Actor, jurisdictionId: string) {
  requireStaff(actor);
  return db.select().from(membership).where(eq(membership.jurisdictionId, jurisdictionId));
}
