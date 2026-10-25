# TechDesign — Locked Report

**Feature:** F10 · `reports`
**Status:** Draft — revised 2026-09-27: versions and database storage; revised 2026-10-22: the document is stitched from versioned report sections
**Requirements:** [Requirements/locked-report.md](../Requirements/locked-report.md) (R1–R18)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Report release_, D12), [data-model.md](data-model.md) (`report`), [research-changes.md](research-changes.md) (F22 — the publishing flow, versions, and the job)
**Release:** 1

## What changed

The first design released a report from the decision's latest run inside one transaction in `reports`, printed its PDF in a worker, and put the file in object storage. This revision keeps the document, the PDF printing, and the worker job, and changes three things:

1. **The transaction that starts a release moved to `workflow`** (`finishResearch`, F22). It needs the project's current report sections (F21), and `reports` can't import `workflow`. `reports` keeps `requestFinalDocument(tx, …)`, which inserts the `releasing` row and enqueues the job inside the caller's transaction.
2. **The file lives in the database**, in `report.pdf`, beside its `pdf_sha256` (R9). `object_key` and the object-storage calls in `reports` are removed. Object storage stays for profile uploads and raw evidence.
3. **Each publication is a numbered version** (`report.version_number`), and the document is rendered from pinned records only (R16, R17).
4. **The document is stitched from the section contents pinned in the snapshot** — each phase's newest section version, or its analysis draft when no version exists. A section that is out of date blocks generation. The review record is gone; the section version is the record (R16, R18).

**Rejected:** rendering the PDF inside the transaction that starts the release. Chromium takes seconds, and the decision row is locked for the whole transaction. The job renders after the lock is released, from records that can no longer change (the project is `finishing` and read-only).

## Module

```
src/modules/reports/
  index.ts            public API: requestFinalDocument, listDocumentVersions, getDocumentFile,
                      ReportSnapshotSchema, CURRENT_TEMPLATE_VERSION, PHASE_KEYS
  tables.ts             report
  snapshot.ts           ReportSnapshotSchema (see research-changes.md)
  versions.ts           listDocumentVersions, getDocumentFile
  request.ts            requestFinalDocument(tx, …): the releasing row and its job
  document.tsx          the document's React component tree (server-rendered, no client JS)
  render.ts             renderReportHtml(row): pinned reads, ST_AsSVG maps
  render-and-store.ts   renderAndStoreReport, markReportFailed — worker only, never in index.ts
  *.test.ts
```

`render.ts` and `render-and-store.ts` import `react-dom/server`, which Next.js refuses in anything the app router can reach, so they are kept out of `index.ts` and reached by the worker with the one sanctioned deep import (`eslint.config.js`). That is unchanged.

## Sections (R18)

The document is stitched from per-step sections, each a Server Component over resolved data in `sections.tsx`: `DetailsSection` and `RulesSection` (Overview), `SiteSection`, `FootprintSection`, `EvidenceSection`, `ScreeningSection`, `StudiesSection`, and `ImpactSection` (which also carries "What desk analysis can't see"). The sections that read a run take one `RunContent` (profile document, results, dataset provenance, titles and limitations, impact provenance, resolutions) plus the phase's `SectionContent` (`headline`, `lines`, `tables`). The `tables` field carries only a caption and a column order; every value and every provenance column comes from the run. `document.tsx` adds only what belongs to the whole: the header, what changed since the previous version, the source register, and each section's version number.

Two callers build that data. `render.ts` builds it from a report row's pinned records (R17). `live.ts` (`loadLiveReportContent`) builds it for a step page from the run and geometry revisions the page was handed, so a step page can show its section as it will print. Both resolve content through `run-content.ts` (`loadRunSources`, `buildImpactProvenance`, `toReportResolutions`), the one copy of that logic. The live preview stores nothing and is never published; it reads no "current" a second time, because the caller passes the run id and revisions it already pinned. The content stylesheet, `REPORT_CONTENT_STYLES`, is scoped to `.report-paper`, so the printed document and the in-app preview share one set of rules. The Site and Footprint phases each print their own map, with distinct SVG ids.

## The document (R3, R4, R5, R6, R7, R14, R15, R16)

`document.tsx` is a plain React tree that takes already-resolved data and fetches nothing. Its props are built by `render.ts` from the report row (`analysisRunId`, `snapshot`) and the records it names. In order:

1. **Cover.** Title, city, **version number and publication time in the city's time zone** (R16), profile version, the project details where recorded ("Not yet recorded" where not, R15), each critical area type's `mapStatus` and whether its rule set vested to the filing date or uses the resolution date (R5), the **sample-data banner** when `snapshot.details.usesSampleData` (R16), and a **Built from** line naming each phase's section version number, or "analysis draft" when it had none.
2. **What changed** (version 2 and later). The reason (`change_note`), the phases and details that changed from the previous version, and its number (R16).
3. **Site and Footprint.** One section each, with its own inline SVG map, `<title>` and `<desc>` (R8), from the pinned revisions, led by the section's stored headline and narrative.
4. **Evidence base**, led by the section's stored headline and narrative: every resource type, its measured presence or an explicit "none mapped in the study area" (the literal fact, never "clear" or "safe", R7), disagreements and gaps stated as facts, every `Limit` (R3), and each recorded resolution with its rationale, author, and date (R14).
5. **Screening register and study flags** (R15), rendered with `describeScreeningRow` (F14), each row with its provenance, opening with F14's fixed statements, and the section's narrative and table formats around them. Every study named in the profile without a flag prints "not flagged by mapped data" and the P2 sentence.
6. **Impact**, led by the section's stored headline and narrative: one row per `Impact` through `formatDerivedProvenance` (F4), ranges exactly as computed, never collapsed (R4), with the stored table caption and column order.
7. **Source register** (R14): the distinct dataset versions from the run's `analysis_run_dataset` rows and the distinct rules from every `ruleKeys` list, each through the provenance formatter, read from the pinned run and the pinned profile version.

- The section contents are built by `finishResearch` from the project's current sections and copied into the snapshot; `reports` doesn't import `workflow`, and the worker no longer receives a `draftPhaseSummaries` function. A section with no stored version is copied from its analysis draft; a section that is out of date blocks finishing, so the snapshot always holds current content.
- No prop is free text describing a judgment: the props type has no `recommendation`, `finding`, or `verdict` field, and the only free text in the document is the planner's `change_note` and the adopted section narrative, printed as the planner's own words, never as UPlan's finding (R6). The narrative is checked against the denylist before it is stored as a version.
- The **limit sentences** come from `describeLimit` in `analysis`. `document.tsx` no longer carries its own copy.

## Generating the maps (R8, R17)

```sql
select ST_AsSVG(ST_Transform(geom, 3857), 0, 6) from decision_geometry
  where decision_id = $1 and kind = 'study_area' and revision = $2;   -- $2 is the run's recorded revision
```

Each path is wrapped in a hand-authored `<svg>` with a `<title>` and `<desc>`. The revision comes from `analysis_run.study_area_revision` and `footprint_revision`, never from "the latest revision" (the first version read the latest, which could differ from the run after a later change).

## Publishing (R1, R10, R11)

The transaction that starts it is `finishResearch` in [research-changes.md](research-changes.md). `reports` contributes:

```ts
// request.ts — always called inside finishResearch's transaction
export async function requestFinalDocument(tx: DbOrTx, input: {
  decisionId: string; actor: Actor; runId: string; snapshot: ReportSnapshot; changeNote: string | null;
}): Promise<{ reportId: string }> {
  const [row] = await tx.insert(report).values({
    decisionId: input.decisionId,
    sequenceNumber: sql`(select coalesce(max(sequence_number), 0) + 1 from report where decision_id = ${input.decisionId})`,
    analysisRunId: input.runId, templateVersion: CURRENT_TEMPLATE_VERSION, status: "releasing",
    snapshot: ReportSnapshotSchema.parse(input.snapshot), changeNote: input.changeNote, requestedBy: input.actor.userId,
  }).returning({ id: report.id });
  await addJob(tx, "release_report", { reportId: row.id }, { queueName: `decision:${input.decisionId}`, maxAttempts: 3 });
  return { reportId: row.id };
}
```

- **R1, R10.** The caller holds `select … for update` on the decision and has just compare-and-set its status to `finishing`. Profile approval and dataset refresh take the same row lock before requeuing analyses (they act on `in_progress` projects only), so neither interleaves with the read of the run and the section versions. A change that lands after the transaction commits doesn't affect this document: it is built from the pinned run.
- The old "still current" recheck against `jurisdiction.current_profile_version_id` and the dataset pointers is not needed: it existed because the release read "the latest run" at an arbitrary time. Publishing is now bound to the run that `getAnalysisStatus` says is current for the inputs the decision holds a lock on, and the report says which profile version it was built under (R16). A profile approval that lands afterward starts a new analysis only if the project is `in_progress`; a `finishing` or completed project is untouched (F2's default).
- **R11.** Retrying is safe because the job does its work in two steps. Rendering has no side effect. Storing is one transaction that compare-and-sets the row from `releasing` to `released`, so two attempts of one finish can't both store. A retry after success finds the row `released` and returns. After the last retry the wrapper in `tasks.ts` records `failed` and returns the project to `in_progress`.

### The job (`renderAndStoreReport`)

Described in [research-changes.md](research-changes.md). In short: read the row, render HTML from pinned records, print the PDF with Playwright (`tagged: true`, `outline: true`, R8, D12), hash it, then in one transaction compare-and-set `releasing → released` with the bytes, the hash, the release time, and the next `version_number`, and move the decision from `finishing` to `report_released`.

### Immutability (R2, R9)

A database trigger on `report` (migration 0003) raises on `DELETE`, on any `UPDATE` of a `released` or `failed` row, and on any `UPDATE` of a `releasing` row that changes a column other than `status`, `pdf`, `pdf_sha256`, `released_at`, `version_number`, or `error_detail`. R2 and R9 therefore hold in the database, independent of application code. The application's credentials are not what makes it true. (Object storage's create-only credentials, which the first design used, no longer apply to documents.)

## Before finishing (R13)

```ts
// workflow/readiness.ts — read-only and advisory: finishResearch's own transaction is what decides
export type FinishReadiness = {
  blocking: { key: "section-not-ready" | "analysis-not-current" | "analysis-failed" | "filing-date-missing" | "nothing-changed"; phase?: PhaseKey }[];
  stated: { key: "evidence-gaps" | "source-disagreements" | "approximate-boundaries" | "desk-analysis-limits"; count: number }[];
};
export async function getFinishReadiness(actor: Actor, decisionId: string): Promise<FinishReadiness>;
```

`getReleaseReadiness` from the first design becomes `getFinishReadiness` and moves to `workflow`, which already holds the sections and the change summary and imports `reports`. It calls `getWorkflow` once and maps it: phases whose section is not Ready (To do, Updating, or Out of date), the analysis status, and `pinInputs`'s `ValidationError` for a missing filing date (not swallowed) become blocking items, as does an open research change with nothing changed. The `stated` counts come from the same run's `evidenceBase`, its `screening` rows, and `limits`.

Its keys are a literal union with fixed labels in the route, so there is no free text and no score. The Report page renders the list above the **Finish research** button. The button is disabled with the reason shown when a blocking item exists, and it stays enabled when only stated items exist. `finishResearch` remains the only authority, so a page showing a stale list can't cause a bad publication: the transaction rechecks (R10).

`CURRENT_TEMPLATE_VERSION` increments with this change, because the document gains sections. A published document keeps the template version it was rendered with.

## Sign-off readiness (R12)

`report.status` is `'releasing' | 'released' | 'failed'`. F12 adds `'awaiting_signoff'` before `'releasing'` and a precondition in `finishResearch` (a signed-off review row must exist) — a `check` change, one new status, and one more blocking key in `FinishReadiness`, not a redesign of the transaction, the version numbering, or the immutability guarantees.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `finishResearch` reads the run under the decision lock; `requestFinalDocument` records `analysis_run_id` | One run, never blended |
| R2 | The `report` immutability trigger | Database-enforced |
| R3–R7 | `document.tsx` sections 4–6, the denylist test | Unchanged in substance |
| R8 | `printToPdf` with `tagged` and `outline`; SVG `<title>`/`<desc>`; header cells | |
| R9 | `report.pdf`, `pdf_sha256`, the trigger; `getDocumentFile` verifies the hash on read | Stored in the database |
| R10 | The lock, the `finishing` status compare-and-set, the read-only project | See research-changes.md |
| R11 | Two-step job, compare-and-set store, `markReportFailed` after the last retry | |
| R12 | `finishResearch` gains a precondition; a status and a blocking key | No change of shape |
| R13 | `getFinishReadiness` | Advisory list, authoritative transaction |
| R14, R15 | Document sections 4, 5, 7 | |
| R18 | `sections.tsx`, `run-content.ts`, `live.ts`; `ReportDocument` stitches them | One component per section, shared with the step pages |
| R16 | Cover, What changed, the Built-from line; `ReportSnapshot` | Sample banner from `usesSampleData`; no verdicts or reviewer names |
| R17 | `renderReportHtml(row)` reads only the row, the run, the run's recorded revisions, and the pinned profile version | |

## Verification

- Golden fixture test: a fixture `AnalysisResults` and snapshot render to HTML whose text contains the exact expected provenance strings, the exact impact ranges, the version number, the reason, the Built-from line with each section's version number, and no match against a denylist of verdict-shaped words ("recommend", "should be approved", "clear to develop", "safe") — a direct check for R6 and R7. The denylist runs over every section, including the stored narrative.
- The same fixture asserts the screening table, the study-flag list, the source register, and a recorded resolution's rationale appear, that an unflagged study prints the P2 sentence, that an unrecorded detail prints "Not yet recorded", that the sample banner appears only when set, and that the What-changed block appears only after version 1 (R14–R16).
- A pinning test (R17): after publishing, change the study area and the profile, then render the same report row again and assert byte-identical HTML (the PDF's own metadata timestamps aside, which the test excludes by comparing HTML).
- Testcontainers integration tests: the trigger rejects an `UPDATE` and a `DELETE` of a released row, and an update of a `releasing` row's immutable columns (R2, R9); the job stores a PDF whose hash matches and numbers it 1, then 2 after a second finish (R9, R16); a job retried after success is a no-op; a failed last attempt records `failed`, returns the project to `in_progress`, and consumes no version number (R11); **a race test** fires two `finishResearch` calls at once and asserts one row (R10).
- Released-PDF test, with real Chromium (per the testing rules' _Released PDFs_ row): the PDF is tagged, has an outline, contains the provenance text, and its stored hash matches `pdf_sha256` (R8, R9).
- `getFinishReadiness`: each blocking key appears for its condition and none for a ready project; after a state change `finishResearch` still rejects even though an earlier readiness said nothing blocked, proving the list is advisory (R10, R13).
