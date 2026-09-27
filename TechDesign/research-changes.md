# TechDesign — Research Changes and Document Versions

**Feature:** F22 · `workflow` + `reports` + `decisions`
**Status:** Draft
**Requirements:** [Requirements/research-changes.md](../Requirements/research-changes.md) (R1–R12)
**Builds on:** [locked-report.md](locked-report.md) (F10), [research-phases.md](research-phases.md) (F21), [decisions.md](decisions.md) (F5), [decision-overview.md](decision-overview.md) (F18), [system-architecture.md](system-architecture.md) (_Concurrency and consistency_, J-table)
**Release:** 1

## Approach

A project's life is a small state machine on `decision.status`, and every transition is one compare-and-set. A completed project changes by moving back to `in_progress`; the phases then say which of their outputs differ from the last published version, by comparing fingerprints (F21) with the ones stored in that version. Finishing again inserts a new `report` row with the next version number. Nothing about an earlier version is touched.

```
                 finishResearch                    job succeeds
   in_progress ─────────────────▶ finishing ─────────────────────▶ report_released
        ▲  ▲                          │                                  │
        │  └─ cancelResearchChange ───┼──────────────────────────────────┤
        │        (nothing changed)    │ job fails after retries          │
        │◀────────────────────────────┘                                  │
        └──────────────────────── startResearchChange ◀─────────────────┘
```

In the data, the labels are `in_progress`, `finishing`, and `report_released`. Screens say _In progress_, _Generating document_, and _Completed_.

**Rejected:** a `research_change` table with open and closed rows. Whether a change is open is already `status = 'in_progress'` with at least one published version, and what it changed is the difference between the current outputs and the last version's snapshot. A table would duplicate both facts.

**Rejected:** storing the PDF in object storage, as the first version of F10 did. The requirement is that UPlan keeps the document with its hash in its own database (R1). A document is a few hundred kilobytes, and one store means one backup, one transaction, and no create-only credentials to explain. Object storage remains for uploads (`profile_upload`) and raw evidence. The tradeoff is recorded in `alternatives-and-tradeoffs.md` (D23).

## Data model

`report` is rewritten in place (no `ReportV2`). Migration 0003:

```sql
alter table report
  add column version_number integer,                  -- assigned when released; null while releasing or failed
  add column snapshot       jsonb,                    -- ReportSnapshot below
  add column change_note    text,
  add column pdf            bytea;
-- backfill is impossible for rows whose PDF lives in object storage, so the migration refuses to run over them
do $$ begin
  if exists (select 1 from report) then
    raise exception 'report has rows whose PDFs live in object storage; see TechDesign/deployment-guide.md, "Upgrading to document versions"';
  end if;
end $$;
alter table report alter column snapshot set not null;
alter table report drop column object_key;

alter table report add constraint report_released_shape check (
  (status = 'released') = (pdf is not null and pdf_sha256 is not null and released_at is not null and version_number is not null));
alter table report add constraint report_version_positive check (version_number is null or version_number > 0);
create unique index report_one_version on report (decision_id, version_number) where version_number is not null;
```

- `report_one_releasing` from the first design is not needed: `decision.status = 'finishing'` is the one-in-flight guard, and it is a compare-and-set (R8).
- **Immutability (R2).** A trigger on `report` raises when a `released` or `failed` row is updated or deleted, and when a `releasing` row changes any column other than `status`, `pdf`, `pdf_sha256`, `released_at`, `version_number`, and `error_detail`. Deleting is only ever refused. No code path changes a published version.
- `sequence_number` stays and numbers attempts, so a failed attempt and its retry never collide. `version_number` numbers published documents and has no gaps, because it is assigned only at release, inside the one-in-flight window, from `coalesce(max(version_number), 0) + 1`, and the partial unique index guards it (R2).

```ts
// reports/snapshot.ts
export const ReportSnapshotSchema = z.object({
  templateVersion: z.number().int().positive(),
  details: z.object({
    title: z.string(), applicationType: z.enum([...]),
    parcelOrAddress: z.string().nullable(), applicant: z.string().nullable(), projectManager: z.string().nullable(),
    targetDecisionOn: z.iso.date().nullable(), applicationFiledOn: z.iso.date().nullable(),
    usesSampleData: z.boolean(),                 // F23: derived at finish from the pinned inputs
  }),
  runId: z.uuid(),
  profileVersionId: z.uuid(),
  phases: z.array(z.object({
    phase: z.enum(PHASE_KEYS), contentSha256: z.string(), verdict: z.literal("reviewed"),
    note: z.string().nullable(), reviewedAt: z.iso.datetime(), reviewedByName: z.string(),
    changed: z.boolean(),                        // differs from the previous version's fingerprint (always true for version 1)
    summary: z.object({ templateVersion, headline: z.string(), lines: z.array(z.string()) }), // the drafted output as it was reviewed
  })).length(6),
  resolutions: z.array(z.object({ resourceType, mappedBy, notMappedBy, revision })), // the recorded reasoning that applied (F19 R12)
  previousVersion: z.number().int().positive().nullable(),
  detailsChanged: z.boolean(),
});
```

`reviewedByName` is copied, so a later change to a person's name can't change a published record. `PHASE_KEYS` is a literal tuple in `reports`, and a unit test asserts it equals `workflow`'s `PHASES`, so `reports` needn't import `workflow` (which imports `reports`).

`decision` gains `finishing` in its status check (see `decisions.md`).

## Starting a research change (R3, R4)

```ts
// decisions.ts — reopen is renamed startResearchChange in the UI only; the function keeps its name
export async function reopen(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<Decision> {
  return db.transaction(async (tx) => {
    const updated = await tx.update(decision)
      .set({ status: "in_progress", rowVersion: sql`row_version + 1` })
      .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt),
        eq(decision.rowVersion, expectedRowVersion), eq(decision.status, "report_released")))
      .returning();
    if (updated.length === 0) throw new ConflictError("This project isn't completed, or it changed since you loaded it.");
    await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx); // the profile or datasets may have moved since it was published
    return updated[0];
  });
}
```

The enqueue is in the same transaction. The `run_analysis` job key collapses it with any pending one, and a run whose inputs are unchanged is a no-op (F7 R8).

`lockEditableDecision(tx, actor, id)` is the guard every input write and every review takes. It selects the decision `for update`, requires the actor to own it and it not be deleted, and requires `status = 'in_progress'`. Otherwise it throws `ConflictError`: "This project is completed. Start a research change to edit it." for `report_released`, and "A document is being generated. Try again when it finishes." for `finishing` (R3, R8).

## What changed (R5)

```ts
// workflow/changes.ts — pure
export type ChangeSummary = {
  baseVersion: number;
  phases: { phase: PhaseKey; changed: boolean; reviewedAtCurrentOutput: boolean }[];
  detailsChanged: boolean;
  hasChanges: boolean;                      // any phase changed or the details changed
};
export function summarizeChanges(
  outputs: Partial<Record<PhaseKey, PhaseOutput>>,
  reviews: Partial<Record<PhaseKey, ReviewState>>,
  base: ReportSnapshot,
  baseVersion: number,
  currentDetails: ReportSnapshot["details"],
): ChangeSummary;
```

A phase is `changed` when its output is absent (it is being recomputed) or its fingerprint differs from `base.phases[phase].contentSha256`. Details are compared field by field. The base is the highest released version. With no released version there is no change summary, and the project is simply being researched for the first time.

## Finishing research (R1, R6, R8)

```ts
// workflow/finish.ts
export async function finishResearch(actor: Actor, decisionId: string, input: {
  changeNote: string | null; expectedRowVersion: number;
}): Promise<{ reportId: string }> {
  return db.transaction(async (tx) => {
    const d = await lockEditableDecision(tx, actor, decisionId);
    if (d.rowVersion !== input.expectedRowVersion) throw new ConflictError("This project changed since you loaded the page. Reload and check it again.");
    const facts = await loadPhaseFacts(tx, d);
    if (facts.status.kind !== "current" || !facts.run) throw new ValidationError("The analysis for the current inputs hasn't finished.");
    const outputs = derivePhaseOutputs(facts);
    const reviews = await loadLatestReviewsFor(tx, decisionId, outputs);   // newest review at each output's fingerprint
    const unreviewed = PHASES.filter((p) => !outputs[p] || reviews[p]?.verdict !== "reviewed");
    if (unreviewed.length > 0) throw new ValidationError(`Review ${listNames(unreviewed)} first.`);         // R1

    const base = await getLatestReleasedSnapshot(tx, decisionId);          // reports, or null
    const changes = base ? summarizeChanges(outputs, reviews, base.snapshot, base.versionNumber, detailsOf(d)) : null;
    if (changes && !changes.hasChanges) throw new ConflictError(`Nothing has changed since version ${base.versionNumber}. Cancel the research change instead.`); // R6
    const note = input.changeNote?.trim() || null;
    if (base && note === null) throw new ValidationError("Give a short reason for this version.");             // R6

    await setStatus(tx, decisionId, "in_progress", "finishing");            // compare-and-set: exactly one row (R8)
    return requestFinalDocument(tx, { decisionId, actor, runId: facts.run.id, snapshot: buildSnapshot(...), changeNote: note });
  });
}
```

- **One transaction, one lock.** The decision row is locked for the whole function, so an input write, a review, a second finish, and a delete all wait. The fingerprints and reviews are read inside the lock, so what is published is what was reviewed (R1, R8, R11).
- `requestFinalDocument` (in `reports`) inserts the `releasing` row with `sequence_number = max + 1` and enqueues `release_report` with `max_attempts = 3` on the queue `decision:<id>`, in the same transaction (concurrency rules). A crash between the two is impossible: they commit together.
- The database, not the check above, is the last guard for R2: the unique index on `(decision_id, version_number)`, and the status compare-and-set that lets one finish through.

```ts
export async function cancelResearchChange(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<void>
```

`cancelResearchChange` takes the same lock, requires a released version and `!hasChanges`, and does one compare-and-set from `in_progress` to `report_released` (R7). With changes it throws `ConflictError("This research change has changes in it. Finish it, or change the inputs again.")`.

## The document job (R1, R2, R8, R10, R11)

```ts
// reports/render-and-store.ts (worker only, as before)
export async function renderAndStoreReport(reportId: string): Promise<void> {
  const row = await getReportRow(reportId);
  if (row.status !== "releasing") return;                       // a retry after success does nothing
  const html = await renderReportHtml(row);                     // pinned: row.analysisRunId, row.snapshot only
  const pdf = await printToPdf(html);
  const sha = sha256(pdf);
  await db.transaction(async (tx) => {
    const released = await tx.update(report)
      .set({ status: "released", pdf, pdfSha256: sha, releasedAt: sql`now()`,
             versionNumber: sql`(select coalesce(max(version_number), 0) + 1 from report where decision_id = ${row.decisionId})` })
      .where(and(eq(report.id, reportId), eq(report.status, "releasing"))).returning({ id: report.id });
    if (released.length === 0) throw new ConflictError("This document was already finished.");
    await markReportReleased(row.decisionId, tx);               // finishing -> report_released; exactly one row
  });
}

export async function markReportFailed(reportId: string, message: string): Promise<void>;  // report -> failed, decision finishing -> in_progress, one transaction
```

`src/worker/tasks.ts` wraps the task: on any error it rethrows, and when `helpers.job.attempts >= helpers.job.max_attempts` it first calls `markReportFailed` with the error text, so the failure is recorded and shown (the same pattern as `run.ts`, which records a failed run and rethrows). Until then the project stays `finishing`, read-only, with the retry in flight (R8).

**Pinning (R11).** `renderReportHtml(row)` reads only: the run named by `row.analysis_run_id`; the geometry revisions the run recorded (`study_area_revision`, `footprint_revision`), not "the latest"; the profile version named by the snapshot; and the snapshot. It no longer calls `getCurrentProfileForAnalysis` or `getLatestGeometryInternal`, which the first version used and which could disagree with the run after a later change (P3). The document is deterministic given the row, so a retry produces the same content.

**The document (R10).** The React tree gains, in this order: a cover block (title, city, version number, published time in the city's zone, profile version, project details, the sample-data banner when `details.usesSampleData`); for a later version, a **What changed** block (the reason, the phases and details that changed); then the existing sections (study area and footprint map, evidence base, screening register, study flags, impact, what desk analysis can't see) each led by its phase's drafted summary; the recorded resolutions (F10 R14); and a closing **Review record** table (phase, verdict, reviewer, time, note, fingerprint). Version, time, and reviewer text come from the snapshot and row, never from a clock at render time.

## Downloading and history (R9, R12)

```ts
// reports/versions.ts
export type DocumentVersion = { reportId: string; versionNumber: number; releasedAt: Date; publishedByName: string;
  changeNote: string | null; changedPhases: PhaseKey[]; detailsChanged: boolean; sizeBytes: number; pdfSha256: string; isLatest: boolean };
export async function listDocumentVersions(actor: Actor, decisionId: string): Promise<DocumentVersion[]>;   // newest first; never selects `pdf`
export async function getDocumentFile(actor: Actor, decisionId: string, versionNumber: number): Promise<{ bytes: Buffer; sha256: string; filename: string }>;
```

Both call `getDecision` first, so a non-owner gets `NotFoundError` (F11). The list selects `octet_length(pdf)` for the size and never the bytes. `getDocumentFile` selects the bytes for one version, recomputes their SHA-256, and throws if it differs from the stored hash, so a corrupted row is an error, not a bad download. The route handler returns the bytes with `Content-Type: application/pdf`, `Content-Disposition: attachment`, `X-Content-SHA256`, and `Cache-Control: private, no-store` (R12).

## Pages

- **Report (`projects/[id]/report`).** For an in-progress project: a checklist of the six phases with their review states, a change block when a version exists (R5), the reason field (required after version 1), and the **Finish research — publish version N** button, disabled with the reason when a phase is unreviewed or the analysis isn't current. For a completed project: the latest version's card with **Download**, its hash and size, and **Start a research change**. Below both, the version history table (R9). While `finishing`, a status panel with an automatic refresh (`router.refresh()` every 3 seconds while the status is `finishing`) and no actions.
- **Overview.** For a completed project, a banner and the same **Start a research change** button; for an open change, the change summary and **Cancel research change** when nothing changed (R7). The start button opens `ConfirmDialog`: "Start a research change to version {n}? Version {n} stays available and unchanged. You will review each phase your change affects, then publish version {n+1}." It offers a starting point: _Go to Overview_, _Upload a new site boundary_, _Upload a new footprint_, or a phase, all of which start the change first, then navigate (R4).
- **Phase pages** on a completed project show the notice "Version {n} is published. Start a research change to edit this phase." in place of the editors and the review panel.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `finishResearch`, `requestFinalDocument`, `report.pdf` and `pdf_sha256` | Reviews and analysis checked inside the lock |
| R2 | `version_number` assigned at release, unique index, immutability trigger | No gaps; a failed attempt takes no number |
| R3 | `reopen`, `lockEditableDecision` | Explicit start; every write refused otherwise |
| R4 | The start dialog's starting points; editors work once in progress | Upload, sample, details, resolutions |
| R5 | `summarizeChanges` | Fingerprints against the base snapshot |
| R6 | `finishResearch`'s `hasChanges` and reason checks | `ConflictError`, `ValidationError` |
| R7 | `cancelResearchChange` | Only when `!hasChanges` |
| R8 | `finishing` status compare-and-set, the lock, `markReportFailed` | One winner; failure recorded and shown |
| R9 | `listDocumentVersions`, the history table | Times in the city's zone |
| R10 | The document tree and `ReportSnapshot` | Sample banner, what changed, review record |
| R11 | `renderReportHtml(row)` reads only pinned records | Replaces "current profile" and "latest geometry" reads |
| R12 | `getDocumentFile`, the route handler | Hash verified on read |

## Risks and tradeoffs

- **The database holds documents.** A large project with many versions adds a few megabytes a year. Backups already cover the database (`system-architecture.md`), and the free-tier budget table is updated for database size. The list query never reads `pdf`, so history stays fast.
- **A worker that isn't running leaves a project `finishing`.** The page says a document is being generated and that the background worker must be running, and `LOCAL_HOSTING.md` says the worker is now required. After the last retry the failure is recorded and the project is released back to in progress.
- **A profile change while a project is completed** doesn't touch it, and shows up only when a research change starts and the run is recomputed. That is the F2 default: a released document stays as released.
- **Details-only versions.** A change to the applicant's name alone can publish a new version. That is correct: the document prints the details.

## Verification

- Vitest unit tests: `summarizeChanges` (each phase changed, unchanged, absent; details changed; no base) (R5); `ReportSnapshotSchema` accepts a valid snapshot and rejects five phases, a non-`reviewed` verdict, and an unknown phase; `PHASE_KEYS` equals `PHASES`; the document tree contains the sample banner only when set, the reason only after version 1, and no word from the F21 denylist (R10).
- Testcontainers integration tests: finishing with an unreviewed phase, a revision-requested phase, and a stale analysis each fail with the named reason (R1); finishing enqueues exactly one `release_report` job and moves the project to `finishing`; the job stores a PDF whose SHA-256 matches, sets version 1, and moves the project to completed (R1, R2); a second research change and finish makes version 2 with the reason and the changed phases, and version 1's row is byte-identical (R2, R5, R9); finishing with nothing changed fails (R6); cancelling with nothing changed restores completed, and cancelling with changes fails (R7); updating and deleting a released `report` row fails (R2); every input write on a completed and on a `finishing` project fails with `ConflictError` (R3, R8); a failed job at its last attempt records `failed` and returns the project to in progress with no version number consumed (R8); the download function returns the stored bytes, refuses a non-owner with `NotFoundError`, and throws on a corrupted hash (R12); **race tests**: two `finishResearch` calls at once — exactly one succeeds; `finishResearch` against `saveGeometry` at once — either the published snapshot matches the fingerprints reviewed or the finish fails (R8, R11).
- The PDF is checked by an integration test that runs the real render with Chromium: tagged, with an outline, containing the version number, the review record, and the sample banner when set (R10; `testing-and-verification.md`, released PDFs).
- Playwright: finish research, download version 1, start a research change, upload a new boundary, review the affected phases, publish version 2, and see both versions in the history; axe at desktop and phone widths (R3–R9).

## Open questions

- None. The retention treatment of stored documents is in the Requirements' open items.
