import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import type { Actor } from "@/modules/accounts";
import { listOpenDecisions } from "@/modules/decisions";
import { getMappedResourceTypeKeys } from "@/modules/evidence";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { addJob } from "@/platform/jobs";
import { putIfAbsent } from "@/platform/object-storage";

import { jurisdictionColumnsWithoutBoundary } from "./jurisdiction";
import { CURRENT_TEMPLATE_VERSION, ProfileDocumentSchema, type ProfileDocument } from "./schema";
import { applySettingsEdit, SettingsEditSchema } from "./settings";
import { saveExcelSource } from "./sources";
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

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// profile-upload-edit.md R5, R8: a change takes effect the moment it is made. In one transaction this locks the
// city, checks the caller built their change on the profile that is current, writes the change as an audit row
// (already approved, by the person who made it), creates the new version, moves the pointer, and queues every
// open decision for re-analysis. `build` receives the current document (null before the first profile) inside the
// lock, so a change derived from the current profile can never be derived from a stale read.
async function applyDocument(
  tx: DbOrTx,
  input: {
    actor: Actor;
    jurisdictionId: string;
    baseVersionId: string | null; // the revision the caller's page showed; null when it showed no profile
    source: "upload" | "edit";
    uploadId: string | null;
    reason: string;
    build: (current: ProfileDocument | null) => ProfileDocument;
  },
): Promise<{ versionId: string; versionNumber: number }> {
  const [city] = await tx
    .select(jurisdictionColumnsWithoutBoundary)
    .from(jurisdiction)
    .where(eq(jurisdiction.id, input.jurisdictionId))
    .for("update"); // locks the row for the rest of this transaction
  if (!city) throw new NotFoundError("jurisdiction");
  if (city.currentProfileVersionId !== input.baseVersionId) {
    throw new ConflictError("The city's profile changed while this page was open. Reload the page and try again.");
  }

  let current: ProfileDocument | null = null;
  if (city.currentProfileVersionId) {
    const [version] = await tx
      .select({ document: profileVersion.document })
      .from(profileVersion)
      .where(eq(profileVersion.id, city.currentProfileVersionId));
    if (!version) throw new NotFoundError("profile version");
    // Re-validate rather than `as`-cast: untyped jsonb (conventions.md).
    current = ProfileDocumentSchema.parse(version.document);
  }

  const document = input.build(current);
  assertNoOrphanedDatasetMapping(document, await getMappedResourceTypeKeys(tx, input.jurisdictionId)); // R9 of jurisdiction-profile.md

  const [change] = await tx
    .insert(profileChange)
    .values({
      jurisdictionId: input.jurisdictionId,
      baseVersionId: city.currentProfileVersionId,
      proposedDocument: document,
      source: input.source,
      uploadId: input.uploadId,
      reason: input.reason,
      status: "approved",
      proposedBy: input.actor.userId,
      decidedBy: input.actor.userId,
      decidedAt: sql`now()`,
    })
    .returning();
  if (!change) throw new Error("insert into profile_change unexpectedly returned no row");

  const versionNumber = (await getMaxVersionNumber(tx, input.jurisdictionId)) + 1;
  const [version] = await tx
    .insert(profileVersion)
    .values({
      jurisdictionId: input.jurisdictionId,
      versionNumber,
      document,
      documentSha256: sha256(Buffer.from(JSON.stringify(document))),
      changeId: change.id,
    })
    .returning();
  if (!version) throw new Error("insert into profile_version unexpectedly returned no row");
  await moveCurrentPointer(tx, input.jurisdictionId, version.id);

  const openDecisions = await listOpenDecisions(input.jurisdictionId, tx); // R10: open only
  for (const d of openDecisions) {
    await addJob(
      tx,
      "run_analysis",
      { decisionId: d.id, purpose: "current" },
      { queueName: `decision:${d.id}`, maxAttempts: 3, jobKey: `run_analysis:${d.id}` },
    );
  }
  return { versionId: version.id, versionNumber };
}

/** Applies a whole document as the city's next profile version (seed scripts and test fixtures; the page edits settings and uploads). */
export async function applyProfileDocument(
  actor: Actor,
  jurisdictionId: string,
  baseVersionId: string | null,
  document: unknown,
  reason: string,
) {
  const parsed = ProfileDocumentSchema.parse(document); // R8 of jurisdiction-profile.md
  return db.transaction((tx) =>
    applyDocument(tx, { actor, jurisdictionId, baseVersionId, source: "edit", uploadId: null, reason, build: () => parsed }),
  );
}

/** Saves the settings panel (R4): vesting, map status per resource type, retention, and export formats. */
export async function editSettings(actor: Actor, jurisdictionId: string, baseVersionId: string | null, edit: unknown) {
  const parsed = SettingsEditSchema.safeParse(edit);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  return db.transaction((tx) =>
    applyDocument(tx, {
      actor,
      jurisdictionId,
      baseVersionId,
      source: "edit",
      uploadId: null,
      reason: "Settings edited in UPlan",
      build: (current) => {
        if (!current) throw new ValidationError("This city has no profile yet. Upload a workbook from Sources first.");
        return applySettingsEdit(current, parsed.data);
      },
    }),
  );
}

/**
 * Applies an Excel workbook as the city's rules and records it as a source (R1–R3, R12). A workbook that fails
 * validation stores only the upload attempt and its error list; nothing about the profile or the source list changes.
 * `target.sourceId` replaces the workbook behind an existing Excel source; null adds a new one.
 */
export async function applyUpload(
  actor: Actor,
  jurisdictionId: string,
  baseVersionId: string | null,
  fileBuffer: Buffer,
  target: { sourceId: string | null; label: string },
) {
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

    if (!result.ok) return { upload, versionNumber: null }; // R3: nothing else is written on a failed upload

    const { document } = result;
    const applied = await applyDocument(tx, {
      actor,
      jurisdictionId,
      baseVersionId,
      source: "upload",
      uploadId: upload.id,
      reason: `Excel upload: ${target.label}`,
      build: () => document,
    });
    await saveExcelSource(tx, actor, jurisdictionId, upload.id, target);
    return { upload, versionNumber: applied.versionNumber };
  });
}
