# TechDesign — Decisions

**Feature:** F5 · `decisions`
**Status:** Draft
**Requirements:** [Requirements/decisions.md](../Requirements/decisions.md) (R1–R15)
**Builds on:** [data-model.md](data-model.md) (`decision`, `decision_geometry`), [system-architecture.md](system-architecture.md) (_Concurrency and consistency_), [accounts-roles.md](accounts-roles.md) (ownership, F11)
**Shared module with:** [proposal-footprint.md](proposal-footprint.md) (F8 — the footprint-tracing workflow built on `saveGeometry`), [sample-data.md](sample-data.md) (F23 — sample inputs), [research-phases.md](research-phases.md) (F21 — boundary upload)
**Release:** 1

## Module

```
src/modules/decisions/
  index.ts            public API
  tables.ts             decision, decision_geometry
  decisions.ts          createDecision, getDecision, listDecisions, updateDecisionDetails, deleteDecision,
                        reopen, lockEditableDecision, beginFinish, markReportReleased, markFinishFailed
  geometry.ts           saveGeometry, getLatestGeometry, getGeometryRevision, getGeometryAreaAcres
  upload.ts             parseBoundaryUpload, saveGeometryFromUpload            (F21 R11)
  sample-data.ts        SAMPLE_*, createSampleProject, loadSampleGeometry, loadSampleDetails   (F23)
  *.test.ts
```

## Status and ownership

`decision.status` has three values, matched by a `check` constraint:

| Value | Screen label | Meaning |
| --- | --- | --- |
| `in_progress` | In progress | Research is open. The only status in which anything can be changed |
| `finishing` | Generating document | A final document is being produced. Everything is read-only |
| `report_released` | Completed | A document has been published |

The transitions and who performs each are drawn in [research-changes.md](research-changes.md). Each is one compare-and-set on the row.

**Ownership.** A decision's owner is `created_by`. Every function that takes a `decisionId` reaches the row through `getDecision` or `lockEditableDecision`, and both put `created_by = actor` and `deleted_at is null` in the query itself (`accounts-roles.md`). There is no jurisdiction check because there is no membership.

## Decisions (R1, R3, R4, R9–R15)

```ts
// decisions.ts
export type NewDecision = {
  jurisdictionId: string;
  title: string;
  applicationType: "subdivision" | "short_subdivision" | "clearing_grading";
  parcelOrAddress?: string | null;
  applicant?: string | null;
  projectManager?: string | null;
  targetDecisionOn?: string | null;   // YYYY-MM-DD
  applicationFiledOn?: string | null; // YYYY-MM-DD
};

export async function createDecision(actor: Actor, input: NewDecision): Promise<Decision> {
  return db.transaction((tx) => insertDecision(tx, actor, input)); // insertDecision is shared with createSampleProject (F23)
}

export async function getDecision(actor: Actor, decisionId: string): Promise<Decision> {
  const [row] = await db.select().from(decision)
    .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)));
  if (!row) throw new NotFoundError("project"); // R1: not yours, deleted, and absent are one answer
  return row;
}

export async function listDecisions(actor: Actor): Promise<Decision[]> {
  return db.select().from(decision)
    .where(and(eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)))
    .orderBy(desc(decision.createdAt))
    .limit(LIST_LIMIT); // LIST_LIMIT = 100; project-dashboard.md says so on the page when reached
}
```

`insertDecision(tx, actor, input)` validates `input` with Zod (title non-empty and at most 200 characters; dates as `YYYY-MM-DD`), verifies the jurisdiction exists (a foreign key does the real work, and a violation becomes a `ValidationError` naming the city), and inserts with `status = 'in_progress'`, `created_by = actor.userId`. When a filing date is supplied it enqueues an analysis run in the same transaction (R12), and otherwise none: a decision with no study area has nothing to analyze.

### The lock (R13)

```ts
// The one guard every change takes. Returns the locked row.
export async function lockEditableDecision(tx: DbOrTx, actor: Actor, decisionId: string): Promise<Decision> {
  const [row] = await tx.select().from(decision)
    .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("project");
  switch (row.status) {
    case "in_progress": return row;
    case "finishing": throw new ConflictError("A document is being generated for this project. Try again when it finishes.");
    case "report_released": throw new ConflictError("This project is completed. Start a research change to edit it.");
  }
}
```

`select … for update` serializes every writer of one project: `saveGeometry`, `updateDecisionDetails`, `saveResolution`, `recordReview`, `finishResearch`, and `deleteDecision`. It is cheap because the row is per project. The `switch` lists every status with no `default`, so a fourth status fails to compile until handled (conventions).

### Details, delete, reopen, finishing

```ts
export type DecisionDetailsPatch = {
  title?: string; applicationType?: NewDecision["applicationType"];
  parcelOrAddress?: string | null;    // null clears a detail; absent leaves it alone
  applicant?: string | null; projectManager?: string | null;
  targetDecisionOn?: string | null; applicationFiledOn?: string | null;
};

export async function updateDecisionDetails(actor, decisionId, patch: DecisionDetailsPatch, expectedRowVersion: number): Promise<Decision> {
  return db.transaction(async (tx) => {
    const d = await lockEditableDecision(tx, actor, decisionId);
    const [row] = await tx.update(decision).set({ ...normalized(patch), rowVersion: sql`row_version + 1` })
      .where(and(eq(decision.id, decisionId), eq(decision.rowVersion, expectedRowVersion))) // R11: compare-and-set
      .returning();
    if (!row) throw new ConflictError("This project changed since you loaded it. Reload and try again.");
    if (patch.applicationFiledOn !== undefined && patch.applicationFiledOn !== d.applicationFiledOn)
      await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx); // R12: the change and its job commit together
    return row;
  });
}

export async function deleteDecision(actor, decisionId, expectedRowVersion: number): Promise<void>; // R14 — see below
export async function reopen(actor, decisionId, expectedRowVersion: number): Promise<Decision>;      // R8 — research-changes.md
export async function beginFinish(tx, decisionId): Promise<void>;                                     // in_progress -> finishing, one row
export async function markReportReleased(decisionId, tx): Promise<void>;                              // finishing -> report_released, one row
export async function markFinishFailed(decisionId, tx): Promise<void>;                                // finishing -> in_progress, one row
```

- **R11.** Details are one compare-and-set. It also holds the lock, so a details edit and a geometry save don't interleave, while a geometry save doesn't bump `row_version` (its own revision key is its guard), so saving a boundary never makes an open details form stale.
- **R12.** It enqueues only when the filing date changed, because no other detail is an analysis input. The job key collapses a still-pending duplicate.
- **R14.** `deleteDecision` is `update decision set deleted_at = now(), deleted_by = $actor, row_version = row_version + 1 where id = $id and created_by = $actor and deleted_at is null and row_version = $expected and status <> 'finishing'`. Zero rows means `ConflictError`, or `NotFoundError` when the row isn't the actor's (a second read tells which). Nothing else is written, and no other table is touched.
- `beginFinish`, `markReportReleased`, and `markFinishFailed` are the three status moves of a document's life. Each is `update … where id = $id and status = $from` and throws `ConflictError` unless it affected exactly one row. `markReportReleased` is called by `reports` in the same transaction that stores the document.
- **R9.** `created_by` and `created_at` are set once. `deleted_by` and `deleted_at` record a delete. The document history (`report` rows) and reviews record the rest of a decision's life, so no separate audit table is needed.

`listOpenDecisions(jurisdictionId, tx)` (used when a profile version or dataset version is approved, F1 and F3) and `listOpenDecisionsIntersecting(tx, coverage)` stay, and now filter on `status = 'in_progress' and deleted_at is null`. They are system-authority reads for job bodies, with no actor, like `getDecisionForAnalysis`.

## Geometry revisions (R2, R5, R6, R7, R13)

```ts
// geometry.ts
export async function saveGeometry(actor, decisionId, kind: GeometryKind, geojson: Geometry, sourceNote: string, expectedRevision: number) {
  const geom = MultiPolygonSchema.parse(geojson);   // Zod at the boundary; R2: no parcel-line constraint
  await assertValidGeometry(geom);                  // ST_IsValid / ST_IsValidReason (R7)
  try {
    return await db.transaction(async (tx) => {
      await lockEditableDecision(tx, actor, decisionId); // R13
      const row = await insertGeometryRevision(tx, { decisionId, kind, revision: expectedRevision, geom, sourceNote, createdBy: actor.userId });
      await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx); // same transaction as the insert
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`revision ${expectedRevision} already exists for this ${kind}`); // R6
    throw err;
  }
}
```

- **R2:** validation checks only that the input is a valid `MultiPolygon`. There is no parcel-boundary constraint anywhere in this path.
- **R5, R6:** the primary key `(decision_id, kind, revision)` is the guard (`data-model.md`). `saveGeometry` never reads the current maximum and increments it. The client sends the revision it believes is next, and a collision is a `ConflictError`. The lock does not replace this guard: two saves of one revision serialize on the lock, and the second then fails on the key.
- **R7:** `ST_IsValid` and `ST_IsValidReason` run before the insert, and a failure is a `ValidationError` naming the problem. Nothing in this file repairs a geometry. It runs before the transaction and its lock, so an invalid drawing never holds the project's lock.
- `getLatestGeometry`, `getGeometryAreaAcres`, and the new `getGeometryRevision(actor, decisionId, kind, revision)` (used to render a pinned revision) reach the row through `getDecision`. `getGeometryAreaAcres` still computes the area in PostGIS, in the jurisdiction's analysis projection (`do-not.md`).
- `getLatestGeometryInternal` stays for job bodies. Renderers read a **pinned revision** with `getGeometryRevisionInternal(decisionId, kind, revision)`, never the latest (F22 R11).

## Boundary upload (F21 R11) and sample inputs (F23)

`upload.ts` and `sample-data.ts` are described in [research-phases.md](research-phases.md) and [sample-data.md](sample-data.md). Both end in `saveGeometry` or `updateDecisionDetails`, so the lock, the revision guard, and the analysis enqueue apply to them without a second path.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `getDecision`, `lockEditableDecision`, `listDecisions` | Ownership and `deleted_at` in the query; one `NotFoundError` |
| R2 | `MultiPolygonSchema`; no parcel constraint | |
| R3 | Nullable `application_filed_on` (a `date`) | F1's `resolveRulesInForce` enforces "required before a vesting run" |
| R4 | The three-value status and its `check` | Gates requeue and every change |
| R5 | `insertGeometryRevision`; no update or delete path | Runs pin the revision number |
| R6 | Primary key `(decision_id, kind, revision)` | Race test |
| R7 | `assertValidGeometry` | Rejected with PostGIS's reason, never repaired |
| R8 | `reopen` | One compare-and-set plus an enqueue |
| R9 | `created_by`, `created_at`, `deleted_by`, `deleted_at`; reports and reviews | |
| R10 | Nullable detail columns; `projectManager` is text | "Not yet recorded" is shown for null |
| R11 | `updateDecisionDetails`'s compare-and-set | |
| R12 | The enqueue inside the same transaction | Only when the filing date changed |
| R13 | `lockEditableDecision` in every writer | `switch` without a `default` |
| R14 | `deleteDecision` | Soft delete, compare-and-set |
| R15 | `createDecision` with optional details; `createSampleProject` | One transaction |

## Verification

- Unit tests: `MultiPolygonSchema` boundary parsing rejects malformed GeoJSON before it reaches SQL; `NewDecision` validation (empty title, bad dates, an over-long title).
- Testcontainers integration tests, against a real PostGIS with the migrations applied:
  - **Ownership (R1):** a second actor and a staff actor each get `NotFoundError` from `getDecision`, `saveGeometry`, and `listDecisions` for the first actor's project; a deleted project reads as absent.
  - **Details (R10–R12):** `updateDecisionDetails` with a stale `row_version` fails with `ConflictError`, **and a race test** fires two updates on one version at once on separate connections and asserts one succeeds; changing the filing date leaves one pending `run_analysis` job and changing only the applicant leaves none.
  - **Geometry (R5–R7):** an invalid drawing is rejected with the real `ST_IsValidReason` text; two saves of one revision, sequential and **concurrent**, leave exactly one row and one `ConflictError`; saving a boundary does not change `row_version`.
  - **The lock (R13):** every writer fails with `ConflictError` on a `report_released` and on a `finishing` decision; a concurrent `saveGeometry` and `deleteDecision` serialize.
  - **Delete (R14):** hides the project, leaves geometry, runs, reviews, and reports in place, fails on a stale version and on `finishing`, and **a race test** fires two deletes at once and asserts one succeeds.
  - `listOpenDecisions` excludes completed, generating, and deleted decisions (R4).

## Open questions

- None.
