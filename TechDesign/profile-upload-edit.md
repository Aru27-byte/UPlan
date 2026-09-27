# TechDesign — Profile Upload and Editing

**Feature:** F17 · `profiles`
**Status:** Draft
**Requirements:** [Requirements/profile-upload-edit.md](../Requirements/profile-upload-edit.md) (R1–R11)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Profile upload or edit_, D13), [data-model.md](data-model.md) (`profile_upload`, `profile_change`), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)
**Release:** 1

## Module

Same module as F1 (`src/modules/profiles/`), adding:

```
src/modules/profiles/
  template.ts     generateTemplate() — write-excel-file, from ProfileDocumentSchema
  upload.ts        parseUpload() — read-excel-file + Zod, produces ProfileDocument or an error list
  changes.ts       proposeUpload, proposeEdit, decideChange (approve/reject)
  preview.ts        runPreview (called by the preview_profile_change job)
  *.test.ts
```

## Template and upload (R1, R2, R3, R11)

```ts
// template.ts
export function generateTemplate(): Buffer {
  // write-excel-file: one sheet per array in ProfileDocumentSchema (resourceTypes, bufferRules,
  // studyTriggers, treeRules, settings), column headers taken from the schema's field names, so the
  // template can never name a field the parser doesn't also expect (R1).
}
```

```ts
// upload.ts
export type UploadResult = { ok: true; document: ProfileDocument } | { ok: false; errors: string[] }; // every problem, not the first one (R2)

export function parseUpload(fileBuffer: Buffer): UploadResult {
  const rows = readExcelFile(fileBuffer); // row limits enforced per system-architecture.md's *Uploads*
  // maps rows back into the ProfileDocumentSchema shape, collecting every row-level
  // problem (missing citation, missing effective date, unknown resource type, bad enum value)
  // before calling ProfileDocumentSchema.safeParse — never throws on the first bad row.
  // A row carrying a geometry, layer file reference, or anything outside rules/settings
  // is itself a validation error (R11): "uploads carry rules and settings only".
}
```

- **R3:** the route handler that accepts an upload always inserts a `profile_upload` row (object key, file hash, `template_version`, `validation_errors`) — `template_version` is `null` and `validation_errors` non-empty exactly when parsing failed (the `check` constraint in `data-model.md`). Nothing else is written on failure: no `profile_change` row is created, so the current and any pending profile are untouched.
- Upload route: `.xlsx` only, ≤ 5 MB, per `system-architecture.md`'s _Security and access → Uploads_.

## Proposing a change (R4, R5, R11)

```ts
// changes.ts
export async function proposeUpload(
  actor: Actor,
  jurisdictionId: string,
  fileBuffer: Buffer,
  reason: string,
) {
  // Any signed-in person may propose a change (accounts-roles.md R2); only staff decide one (R7).
  const fileSha256 = sha256(fileBuffer);
  const objectKey = `profile-uploads/${jurisdictionId}/${fileSha256}.xlsx`;
  await objectStorage.putIfAbsent(objectKey, fileBuffer); // idempotent write; see platform/objectStorage
  const result = parseUpload(fileBuffer);
  return db.transaction(async (tx) => {
    const upload = await tx
      .insert(profileUpload)
      .values({
        jurisdictionId,
        objectKey,
        fileSha256,
        templateVersion: result.ok ? CURRENT_TEMPLATE_VERSION : null,
        validationErrors: result.ok ? [] : result.errors,
      })
      .returning();
    if (!result.ok) return { upload, change: null }; // R3
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
  const document = ProfileDocumentSchema.parse(editedDocument); // R8 in jurisdiction-profile.md
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

async function insertPendingChange(tx, input): Promise<ProfileChange> {
  const current = await tx.query.jurisdiction.findFirst({ where: eq(jurisdiction.id, input.jurisdictionId) });
  const [change] = await tx
    .insert(profileChange)
    .values({
      ...input,
      baseVersionId: current?.currentProfileVersionId ?? null,
      status: "pending",
    })
    .returning();
  // profile_change_one_pending (partial unique index) makes a second pending proposal for this
  // city fail here with a unique-violation, which the route translates to ConflictError naming
  // the existing pending change (R5) — never a check-then-insert race.
  await addJob(
    tx,
    "preview_profile_change",
    { changeId: change.id },
    {
      queueName: `jurisdiction:${input.jurisdictionId}`,
      maxAttempts: 3,
    },
  );
  return change;
}
```

- **R4:** `reason` is a required, non-empty column (`profile_change.reason` `check (length(reason) > 0)`); there is no path that inserts a change without it.
- **R5:** enforced by the database (`profile_change_one_pending`), not by a check-then-insert in application code, per the concurrency rules. A unique-violation on that index is caught at the module boundary and re-thrown as `ConflictError` with the pending change's id.

## Preview (R6)

```ts
// preview.ts — the preview_profile_change job handler
export async function runPreview(changeId: string): Promise<void> {
  const change = await getChange(changeId); // status must still be 'pending'
  const openDecisions = await listOpenDecisions(change.jurisdictionId); // decisions module
  for (const decision of openDecisions) {
    await enqueueAnalysisRun(decision.id, { purpose: "preview", profileChangeId: change.id }); // analysis module
  }
}
```

- Each preview run is an ordinary `analysis_run` row with `purpose = 'preview'` and `profile_change_id` set (never `profile_version_id` — the two are mutually exclusive per the `check` constraint in `data-model.md`), so it reuses the impact engine (F9) unchanged. A run that fails still finishes (`status = 'failed'`) and is shown, per R6's "including any decision whose preview run failed."
- The review screen (W2) reads every preview run for the pending change plus each decision's current `purpose = 'current'` run, and renders the rule differences (a document diff over `base_version_id`'s document vs. `proposed_document`) and the impact differences (comparing `AnalysisResults` between the two runs) side by side.

## Deciding a change (R7, R8, R9, R10)

```ts
// changes.ts
export async function decideChange(
  actor: Actor,
  changeId: string,
  decision: "approved" | "rejected",
  note: string | null,
): Promise<void> {
  return db.transaction(async (tx) => {
    const change = await tx.query.profileChange.findFirst({ where: eq(profileChange.id, changeId) });
    if (!change) throw new NotFoundError("profile change");
    requireStaff(actor); // assumed per round 10, changed 2026-09-27 — see Requirements' Open items
    if (actor.userId === change.proposedBy)
      throw new ForbiddenError("cannot approve or reject your own change");

    const updated = await tx
      .update(profileChange)
      .set({ status: decision, decidedBy: actor.userId, decidedAt: sql`now()`, decisionNote: note })
      .where(and(eq(profileChange.id, changeId), eq(profileChange.status, "pending")))
      .returning();
    if (updated.length === 0) throw new ConflictError("profile change is no longer pending"); // compare-and-set

    if (decision === "rejected") return; // R9: the row and its history stand as they are

    const [{ id: jurisdictionId }] = await tx
      .select({ id: jurisdiction.id })
      .from(jurisdiction)
      .where(eq(jurisdiction.id, change.jurisdictionId))
      .for("update"); // lock, per rule 4
    const currentJurisdiction = await tx.query.jurisdiction.findFirst({
      where: eq(jurisdiction.id, jurisdictionId),
    });
    if (currentJurisdiction.currentProfileVersionId !== change.baseVersionId) {
      throw new ConflictError("jurisdiction's current profile has moved since this change was based");
    }
    const mappedKeys = await getMappedResourceTypeKeys(tx, jurisdictionId); // evidence module
    assertNoOrphanedDatasetMapping(change.proposedDocument, mappedKeys); // jurisdiction-profile.ts, R9 there

    const nextVersionNumber = (await getMaxVersionNumber(tx, jurisdictionId)) + 1;
    const [version] = await tx
      .insert(profileVersion)
      .values({
        jurisdictionId,
        versionNumber: nextVersionNumber,
        document: change.proposedDocument,
        documentSha256: sha256(canonicalJson(change.proposedDocument)),
        changeId: change.id,
      })
      .returning();
    await tx
      .update(jurisdiction)
      .set({ currentProfileVersionId: version.id })
      .where(eq(jurisdiction.id, jurisdictionId));

    const openDecisions = await listOpenDecisions(jurisdictionId, tx); // R10: open only
    for (const d of openDecisions) {
      await enqueueAnalysisRun(d.id, { purpose: "current" }, tx);
    }
  });
}
```

- **R7:** `requireStaff` plus the `actor.userId === change.proposedBy` check together implement the assumed round-10 default; the schema also backs this with `check (decided_by is null or decided_by <> proposed_by)` in `data-model.md`, so even a future code path that skipped the application check would hit a database constraint.
- **R8:** everything above — the lock, the base-version recheck, the version insert, the pointer move, and every re-analysis enqueue — is one transaction. A crash before commit leaves the city on its old version with no partial state; nothing after commit can be observed half-done.
- **R9:** rejection only sets `status`, `decided_by`, `decided_at`, `decision_note` — the proposed document, the reason, and the upload (if any) are already immutable rows and stay exactly as proposed.
- **R10:** `listOpenDecisions` filters `status = 'in_progress'`; a decision with `status = 'report_released'` is never enqueued here, matching F10's "released reports never change."

## Verification

- Unit tests: `generateTemplate`'s columns match `ProfileDocumentSchema`'s field names exactly (a schema/template drift test, guarding R1 as the schema evolves); `parseUpload` against fixture workbooks — one valid, and one per validation failure named in R2 (missing citation, missing effective date, unknown resource type, a row that tries to carry geometry for R11) — asserting the complete error list, not just the first.
- Testcontainers integration tests: `proposeUpload`/`proposeEdit` insert the pending change and its job in one transaction; a second proposal while one is pending fails with `ConflictError` naming the first (R5) — including a **race test** starting both proposals at once on separate connections, asserting exactly one succeeds; `decideChange` approval is atomic end-to-end (version created, pointer moved, open decisions requeued, released decisions excluded — R10); rejecting leaves the row queryable with its reason intact (R9); approving twice (double-click) hits the compare-and-set and the second call gets `ConflictError`; a staff member approving their own change is refused (R7), and a non-staff person deciding one is refused both by the application check and, in a dedicated test, by the database constraint directly.
- `runPreview` integration test: a pending change against a jurisdiction with two open decisions produces two `purpose = 'preview'` runs, and a run that fails (fixture data that breaks the impact engine) still completes as `failed` and is visible to the review query (R6).
