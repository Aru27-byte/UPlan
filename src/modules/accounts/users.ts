import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";
import type { DbOrTx } from "@/platform/db";
import { ConflictError, isUniqueViolation } from "@/platform/errors";

/**
 * Finds or creates the app_user for a signed-in Supabase identity and returns UPlan's id for them
 * (accounts-roles.md, R2). Creates the person and nothing else: no membership and no staff row, so
 * registering grants no access.
 *
 * One insert keyed on the Supabase id, so two requests provisioning the same person at once both
 * succeed and leave one row. `setWhere` means an unchanged person costs no write — and then the
 * insert returns no row, so the id is read back from the row the conflict proved exists.
 *
 * A person from before the move to Supabase Auth already has a row (with no auth_id) holding their
 * memberships. An operator links it deliberately (deployment-guide.md). Until then a new identity
 * with the same email hits the email's unique constraint, and is refused rather than merged: a
 * matching email alone doesn't prove it is the same person.
 */
export async function provisionUser(
  db: DbOrTx,
  user: { authId: string; email: string; name: string },
): Promise<string> {
  try {
    const [inserted] = await db
      .insert(appUser)
      .values(user)
      .onConflictDoUpdate({
        target: appUser.authId,
        set: { email: user.email, name: user.name },
        setWhere: sql`${appUser.email} is distinct from ${user.email} or ${appUser.name} is distinct from ${user.name}`,
      })
      .returning({ id: appUser.id });
    if (inserted) return inserted.id;

    const [existing] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.authId, user.authId));
    if (!existing) throw new Error("app_user row for a conflicting auth_id could not be read back");
    return existing.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        "This email address already belongs to a UPlan account from before sign-in moved to Supabase. UPlan staff need to link it before you can sign in.",
      );
    }
    throw err;
  }
}
