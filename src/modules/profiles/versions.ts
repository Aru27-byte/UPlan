import { desc, eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { getJurisdiction } from "./jurisdiction";
import type { ProfileDocument } from "./schema";
import { jurisdiction, profileVersion } from "./tables";

/** The city's current profile version, or null before its first approval (R7 of jurisdiction-profile.md). */
export async function getCurrentProfile(jurisdictionId: string) {
  const j = await getJurisdiction(jurisdictionId);
  if (!j.currentProfileVersionId) return null;
  return getProfileVersion(j.currentProfileVersionId);
}

/** A profile version by id — used to render a document from the exact version its run pinned (F22 R11). */
export async function getProfileVersion(versionId: string) {
  const [row] = await db.select().from(profileVersion).where(eq(profileVersion.id, versionId));
  if (!row) throw new NotFoundError("profile version");
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
