import { sql } from "drizzle-orm";

import { appUser } from "@/platform/auth-tables";
import type { DbOrTx } from "@/platform/db";

/**
 * Keeps app_user in step with the Supabase identity (accounts-roles.md, R2). Creates the person and
 * nothing else: no membership and no staff row, so registering grants no access. One statement, so
 * two requests provisioning the same person at once both succeed and leave one row; `setWhere`
 * means an unchanged person costs no write. An email already held by a different id raises the
 * unique violation rather than merging two identities.
 */
export async function provisionUser(
  db: DbOrTx,
  user: { id: string; email: string; name: string },
): Promise<void> {
  await db
    .insert(appUser)
    .values(user)
    .onConflictDoUpdate({
      target: appUser.id,
      set: { email: user.email, name: user.name },
      setWhere: sql`${appUser.email} is distinct from ${user.email} or ${appUser.name} is distinct from ${user.name}`,
    });
}
