# TechDesign — Profile Upload and Editing

**Feature:** F17 · `profiles`
**Status:** Draft — changes apply at once (2026-10-04)
**Requirements:** [Requirements/profile-upload-edit.md](../Requirements/profile-upload-edit.md) (R1–R12; R6, R7, R9 withdrawn)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Profile upload or edit_, D13), [data-model.md](data-model.md) (`profile_upload`, `profile_change`, `profile_source`), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)
**Release:** 1

## Module

Same module as F1 (`src/modules/profiles/`), adding:

```
src/modules/profiles/
  template.ts     generateTemplate() — write-excel-file, from ProfileDocumentSchema
  upload.ts       parseUpload() — read-excel-file + Zod, produces ProfileDocument or an error list
  settings.ts     SettingsEditSchema, applySettingsEdit() — the pure part of saving the settings panel
  changes.ts      applyDocument (private), applyProfileDocument, editSettings, applyUpload
  sources.ts      listSources, addUrlSource, updateSource, removeSource, saveExcelSource
  *.test.ts
```

The page is `src/app/(app)/profile/`: a server `page.tsx`; `resource-type-panel.client.tsx` (the City Resource Types list, its search, and the Update Regulations button); `profile-flyout.client.tsx` (the gear button and the slide-in panel with its Settings and Sources tabs); `settings-form.tsx` and `sources-view.tsx` (server-rendered content of the two tabs); and `actions.ts`.

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

- The template download is the route `GET /api/profile/template`; its button is in the Sources tab (R1).
- **R3:** `applyUpload` always inserts a `profile_upload` row (object key, file hash, `template_version`, `validation_errors`) — `template_version` is `null` and `validation_errors` non-empty exactly when parsing failed (the `check` constraint in `data-model.md`). On failure nothing else is written: no `profile_change`, no version, no `profile_source` row.
- Upload route: `.xlsx` only, ≤ 5 MB, per `system-architecture.md`'s _Security and access → Uploads_.

## Applying a change (R4, R5, R8, R10, R11)

Every path that changes the profile ends in one private function, so there is one transaction shape:

```ts
// changes.ts
async function applyDocument(tx, input: {
  actor, jurisdictionId,
  baseVersionId: string | null,          // the revision the caller's page showed; null when it showed no profile
  source: "upload" | "edit", uploadId: string | null, reason: string,
  build: (current: ProfileDocument | null) => ProfileDocument,
}): Promise<{ versionId: string; versionNumber: number }> {
  // 1. select the jurisdiction row FOR UPDATE
  // 2. if jurisdiction.current_profile_version_id !== baseVersionId → ConflictError          (R5)
  // 3. read the current document (null before the first profile) and call build(current) — inside the lock
  // 4. assertNoOrphanedDatasetMapping(document, mappedKeys)                                  (jurisdiction-profile.md R9)
  // 5. insert profile_change { status: 'approved', proposed_by = decided_by = actor, decided_at = now() }
  // 6. insert profile_version (next number) → change_id; move the current pointer
  // 7. add_job run_analysis for every open decision, queue decision:<id>, max_attempts 3     (R8, R10)
}
```

- **R5, R8:** steps 1–7 are one transaction. The pointer moves only under the row lock, and the base-revision check inside the lock is the compare-and-set: of two saves from the same revision, the second finds the pointer moved and gets `ConflictError`. Nothing is checked and then written outside the lock.
- `build` receives the current document inside the lock, so a settings edit is always derived from the profile it replaces, never from a read taken earlier on the page.
- **R10:** `listOpenDecisions` filters `status = 'in_progress'`; a decision whose report has released is never enqueued.

```ts
export async function editSettings(actor, jurisdictionId, baseVersionId, edit: unknown)   // R4
export async function applyUpload(actor, jurisdictionId, baseVersionId, file, { sourceId, label })  // R12
export async function applyProfileDocument(actor, jurisdictionId, baseVersionId, document, reason)  // seed script and fixtures
```

- **R4:** `editSettings` parses the edit with `SettingsEditSchema` (vesting, retention, export formats, and `mapStatus` keyed by resource type), then `applySettingsEdit(current, edit)` returns the document with those changed and everything else untouched. A `mapStatus` key that is not a resource type of the current profile, or a resource type without one, means the panel was built from an older profile and is refused with a `ValidationError`, not patched. The result passes `ProfileDocumentSchema` like any upload. The change's `reason` is the fixed text "Settings edited in UPlan"; `profile_change.reason` stays `not null` and non-empty.
- **R12:** `applyUpload` puts the file in Object Storage (create-only, keyed by hash), parses it, inserts the upload row, and — only if it parsed — calls `applyDocument` and then `saveExcelSource` in the same transaction, so a source row exists exactly when its workbook was applied. With a `sourceId` it replaces the workbook behind that Excel source and renames it; without one it adds a source.
- The same workbook cannot be uploaded twice for one city (`profile_upload_jurisdiction_hash`); the Server Function reports that as a `ConflictError`.

## Sources (R12)

```ts
// tables.ts — profile_source
//   kind: 'url' | 'excel'; label; url (kind = 'url' only); upload_id (kind = 'excel' only); created_by; created_at
//   checks: kind in list; label not blank; (kind = 'url') = (url is not null); (kind = 'excel') = (upload_id is not null)
```

- A planner-maintained list, edited in place. `updateSource`/`removeSource` filter on `jurisdiction_id` as well as `id` and require exactly one affected row, so a source of another city, or one already removed, is `NotFoundError`.
- A web address must parse as an `http` or `https` URL (`z.url({ protocol: /^https?$/ })`), because the address is rendered as a link; `javascript:` and `data:` addresses are rejected.
- Removing a source does not touch the profile or any version. Nothing else references `profile_source`, so there is no immutability concern.

## The profile page

- **Title and subheading:** `City of {name} Profile`; beneath it a gold version chip, the city and state, and when the profile last changed. With no profile the chip says so.
- **City Resource Types:** one list. Each row is a resource type with its rule set, map status, and rule count, and opens to its regulations (buffers, study triggers, and — for the tree rule set — significant-tree and removal-cap rules), each with its code citation and effective date through the one provenance formatter (P1). The header holds the resource-type and rule counts, a search over names and regulations, and the Update Regulations button. A resource type with no rules says so; that is a fact about the profile, not a clearance (P2).
- **Update Regulations** is rendered disabled until its behavior is specified.
- **Settings flyout:** a gear button at the top right opens a native `<dialog>` that slides in from the right. Settings and Sources are tabs; both stay mounted so a half-typed form survives a tab switch. The settings form is keyed by the profile version id, so it rebuilds from the saved values after every save.
- **No review:** the page has no change history, no queue of changes awaiting review, and no approve or reject control.

## Verification

- Unit tests (`settings.test.ts`): `applySettingsEdit` applies every setting and leaves the rules untouched (R4); refuses an unknown or missing map status, an empty export-format list, and a retention list missing a record type (R4). `generateTemplate`'s columns match `ProfileDocumentSchema` (R1); `parseUpload` against fixture workbooks reports the complete error list (R2, R11).
- Integration tests (`profile-edit.integration.test.ts`, Testcontainers): a settings save creates version 2 recorded as an approved change by its author (R5); a save from a stale revision is a `ConflictError` and writes nothing (R5); **race test** — two saves from the same revision on separate connections, exactly one succeeds and the other is a `ConflictError` (R5); settings for a city with no profile are refused (R4); a second first-profile from no base is a `ConflictError` (R5); web sources are added, renamed, re-addressed, and removed, `javascript:` addresses and blank names are refused, and a source of one city cannot be changed through another (R12).
- Not yet covered by a test: `applyUpload` end to end (valid workbook creates a version and a source; invalid workbook stores only the upload — R3, R12) and the Server Functions' form parsing.
