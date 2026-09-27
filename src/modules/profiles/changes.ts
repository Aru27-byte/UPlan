import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { requireStaff, type Actor } from "@/modules/accounts";
import { listOpenDecisions } from "@/modules/decisions";
import { getMappedResourceTypeKeys } from "@/modules/evidence";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, ForbiddenError, NotFoundError, isUniqueViolation } from "@/platform/errors";
import { addJob } from "@/platform/jobs";
import { putIfAbsent } from "@/platform/object-storage";

import { jurisdictionColumnsWithoutBoundary } from "./jurisdiction";
import { CURRENT_TEMPLATE_VERSION, ProfileDocumentSchema, type ProfileDocument } from "./schema";
import { parseUpload } from "./upload";
import { assertNoOrphanedDatasetMapping, getMaxVersionNumber, moveCurrentPointer } from "./versions";
import { jurisdiction, profileChange, profileUpload, profileVersion } from "./tables";

export type ProfileChange = typeof profileChange.$inferSelect;

/** Internal (system-authority) read for the run_analysis job body — a preview run pins a change's proposed document. */
export async function getProfileChange(changeId: string): Promise<ProfileChange> {
  const [row] = await db.select().from(profileChange).where(eq(profileChange.id, changeId));
  if (!row) throw new NotFoundError("profile change");
  return row;
}

/** For the Profile page's change history (UIDesign/City_Profile.png): every change, newest first. */
export async function listProfileChanges(jurisdictionId: string): Promise<ProfileChange[]> {
  return db
    .select()
    .from(profileChange)
    .where(eq(profileChange.jurisdictionId, jurisdictionId))
    .orderBy(desc(profileChange.proposedAt));
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function insertPendingChange(
  tx: DbOrTx,
  input: {
    jurisdictionId: string;
    proposedDocument: ProfileDocument;
    source: "upload" | "edit";
    uploadId: string | null;
    reason: string;
    proposedBy: string;
  },
): Promise<ProfileChange> {
  const [current] = await tx
    .select(jurisdictionColumnsWithoutBoundary)
    .from(jurisdiction)
    .where(eq(jurisdiction.id, input.jurisdictionId));
  if (!current) throw new NotFoundError("jurisdiction");

  let rows: ProfileChange[];
  try {
    rows = await tx
      .insert(profileChange)
      .values({
        jurisdictionId: input.jurisdictionId,
        baseVersionId: current.currentProfileVersionId,
        proposedDocument: input.proposedDocument,
        source: input.source,
        uploadId: input.uploadId,
        reason: input.reason,
        status: "pending",
        proposedBy: input.proposedBy,
      })
      .returning();
  } catch (err) {
    // profile_change_one_pending: only one pending change per city (R5 of profile-upload-edit.md)
    if (isUniqueViolation(err))
      throw new ConflictError("a profile change is already pending for this jurisdiction");
    throw err;
  }
  const [change] = rows;
  if (!change) throw new Error("insert into profile_change unexpectedly returned no row");

  await addJob(
    tx,
    "preview_profile_change",
    { changeId: change.id },
    { queueName: `jurisdiction:${input.jurisdictionId}`, maxAttempts: 3 },
  );
  return change;
}

export async function proposeUpload(
  actor: Actor,
  jurisdictionId: string,
  fileBuffer: Buffer,
  reason: string,
) {
  // Any signed-in person may propose a change (accounts-roles.md R2); only staff decide one (R7).
  const fileSha256 = sha256(fileBuffer);
  const objectKey = `profile-uploads/${jurisdictionId}/${fileSha256}.xlsx`;
  await putIfAbsent("objects", objectKey, fileBuffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const result = await parseUpload(fileBuffer);

  return db.transaction(async (tx) => {
    const [upload] = await tx
      .insert(profileUpload)
      .values({
        jurisdictionId,
        objectKey,
        fileSha256,
        templateVersion: result.ok ? CURRENT_TEMPLATE_VERSION : null,
        validationErrors: result.ok ? [] : result.errors,
        uploadedBy: actor.userId,
      })
      .returning();
    if (!upload) throw new Error("insert into profile_upload unexpectedly returned no row");

    if (!result.ok) return { upload, change: null }; // R3: nothing else is written on a failed upload

    const change = await insertPendingChange(tx, {
      jurisdictionId,
      proposedDocument: result.document,
      source: "upload",
      uploadId: upload.id,
      reason,
      proposedBy: actor.userId,
    });
    return { upload, change };
  });
}

export async function proposeEdit(
  actor: Actor,
  jurisdictionId: string,
  editedDocument: unknown,
  reason: string,
) {
  const document = ProfileDocumentSchema.parse(editedDocument);
  return db.transaction((tx) =>
    insertPendingChange(tx, {
      jurisdictionId,
      proposedDocument: document,
      source: "edit",
      uploadId: null,
      reason,
      proposedBy: actor.userId,
    }),
  );
}

export async function decideChange(
  actor: Actor,
  changeId: string,
  outcome: "approved" | "rejected",
  note: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [change] = await tx.select().from(profileChange).where(eq(profileChange.id, changeId));
    if (!change) throw new NotFoundError("profile change");
    requireStaff(actor); // assumed per round 10, changed 2026-09-27 — profile-upload-edit.md's Open items
    if (actor.userId === change.proposedBy)
      throw new ForbiddenError("cannot approve or reject your own change");

    const updated = await tx
      .update(profileChange)
      .set({ status: outcome, decidedBy: actor.userId, decidedAt: sql`now()`, decisionNote: note })
      .where(and(eq(profileChange.id, changeId), eq(profileChange.status, "pending")))
      .returning();
    if (updated.length === 0) throw new ConflictError("profile change is no longer pending");

    if (outcome === "rejected") return; // R9: the row and its history stand as they are

    const [current] = await tx
      .select(jurisdictionColumnsWithoutBoundary)
      .from(jurisdiction)
      .where(eq(jurisdiction.id, change.jurisdictionId))
      .for("update"); // locks the row for the rest of this transaction
    if (!current) throw new NotFoundError("jurisdiction");
    if (current.currentProfileVersionId !== change.baseVersionId) {
      throw new ConflictError("jurisdiction's current profile has moved since this change was based");
    }

    // Re-validate rather than `as`-cast: proposedDocument is untyped jsonb, and a cast on data
    // read back from the database is exactly what .claude/rules/conventions.md's "no `as` casts
    // on data from outside the process" forbids, even though this document was already validated
    // once before it was stored.
    const proposedDocument = ProfileDocumentSchema.parse(change.proposedDocument);
    const mappedKeys = await getMappedResourceTypeKeys(tx, change.jurisdictionId);
    assertNoOrphanedDatasetMapping(proposedDocument, mappedKeys); // R9 of jurisdiction-profile.md

    const nextVersionNumber = (await getMaxVersionNumber(tx, change.jurisdictionId)) + 1;
    const [version] = await tx
      .insert(profileVersion)
      .values({
        jurisdictionId: change.jurisdictionId,
        versionNumber: nextVersionNumber,
        document: change.proposedDocument,
        documentSha256: sha256(Buffer.from(JSON.stringify(change.proposedDocument))),
        changeId: change.id,
      })
      .returning();
    if (!version) throw new Error("insert into profile_version unexpectedly returned no row");
    await moveCurrentPointer(tx, change.jurisdictionId, version.id);

    const openDecisions = await listOpenDecisions(change.jurisdictionId, tx);
    for (const d of openDecisions) {
      await addJob(
        tx,
        "run_analysis",
        { decisionId: d.id, purpose: "current" },
        { queueName: `decision:${d.id}`, maxAttempts: 3, jobKey: `run_analysis:${d.id}` },
      );
    }
  });
}
