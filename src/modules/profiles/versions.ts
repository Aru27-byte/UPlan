import { desc, eq } from "drizzle-orm";

import { requireMembership, type Actor } from "@/modules/accounts";
import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { getJurisdiction } from "./jurisdiction";
import type { ProfileDocument } from "./schema";
import { jurisdiction, profileVersion } from "./tables";

export async function getCurrentProfile(actor: Actor, jurisdictionId: string) {
  const j = await getJurisdiction(actor, jurisdictionId);
  if (!j.currentProfileVersionId) return null; // R7 of jurisdiction-profile.md: no profile yet
  return getProfileVersion(actor, j.currentProfileVersionId);
}

/** Internal (system-authority) read for job bodies such as run_analysis — no actor to check membership for. */
export async function getCurrentProfileForAnalysis(jurisdictionId: string) {
  const [j] = await db
    .select({ currentProfileVersionId: jurisdiction.currentProfileVersionId })
    .from(jurisdiction)
    .where(eq(jurisdiction.id, jurisdictionId));
  if (!j) throw new NotFoundError("jurisdiction");
  if (!j.currentProfileVersionId) return null;
  const [row] = await db
    .select()
    .from(profileVersion)
    .where(eq(profileVersion.id, j.currentProfileVersionId));
  return row ?? null;
}

export async function getProfileVersion(actor: Actor, versionId: string) {
  // `db` is deliberately schema-less (platform/db.ts) — the query builder is used everywhere,
  // never Drizzle's relational `db.query` API, so platform never has to import module tables.
  const [row] = await db.select().from(profileVersion).where(eq(profileVersion.id, versionId));
  if (!row) throw new NotFoundError("profile version");
  requireMembership(actor, row.jurisdictionId);
  return row;
}

export async function getMaxVersionNumber(tx: DbOrTx, jurisdictionId: string): Promise<number> {
  const [row] = await tx
    .select({ versionNumber: profileVersion.versionNumber })
    .from(profileVersion)
    .where(eq(profileVersion.jurisdictionId, jurisdictionId))
    .orderBy(desc(profileVersion.versionNumber))
    .limit(1);
  return row?.versionNumber ?? 0;
}

/** Called inside the approval transaction (profile-upload-edit.md), before moving the current pointer (R9). */
export function assertNoOrphanedDatasetMapping(
  newDocument: ProfileDocument,
  mappedResourceTypeKeys: string[],
): void {
  const keys = new Set(newDocument.resourceTypes.map((r) => r.key));
  const orphaned = mappedResourceTypeKeys.filter((k) => !keys.has(k));
  if (orphaned.length > 0) {
    throw new ValidationError(
      `profile change drops resource type(s) still mapped by evidence: ${orphaned.join(", ")}`,
    );
  }
}

export async function moveCurrentPointer(
  tx: DbOrTx,
  jurisdictionId: string,
  versionId: string,
): Promise<void> {
  await tx
    .update(jurisdiction)
    .set({ currentProfileVersionId: versionId })
    .where(eq(jurisdiction.id, jurisdictionId));
}
