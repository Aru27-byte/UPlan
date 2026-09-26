# TechDesign — Locked Report

**Feature:** F10 · `reports`
**Status:** Draft
**Requirements:** [Requirements/locked-report.md](../Requirements/locked-report.md) (R1–R15)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Report release_, D12), [data-model.md](data-model.md) (`report`)
**Release:** 1

## Module

```
src/modules/reports/
  index.ts        public API: releaseReport, getLatestReport, getReport
  tables.ts         report
  release.ts        the release claim transaction + release_report job body
  document.tsx       the report's React component tree (server-rendered, no client JS)
  render.ts          Playwright PDF printing + ST_AsSVG map generation
  *.test.ts
```

## The report document (R3, R4, R5, R6, R7)

`document.tsx` is a plain React tree (Server Components only — the report is never interactive) that takes one `analysis_run`'s pinned `AnalysisResults` (F7, F9), the profile version it resolved against, and the decision, and renders:

- Cover: decision title, permit number, jurisdiction, filing date, and — per R5 — each critical area type's `mapStatus` and whether its rule set vested to the filing date or uses today's rules. Per R15 it also carries parcel or address, applicant, and project manager where recorded, and an unrecorded one prints as "Not yet recorded".
- Screening and studies (R15): one table from the run's `screening` rows and one list from `studyFlags`, rendered with `describeScreeningRow` (F14), each row carrying its provenance. The section opens with F14's fixed statements, and every study named in the profile without a flag prints "not flagged by mapped data" with the P2 sentence.
- Source register and resolutions (R14): the distinct dataset versions from the run's `analysis_run_dataset` rows and the distinct rules from every `ruleKeys` list, each through the provenance formatter, then `listResolutions` for the run's disagreements, each with rationale, author, and date. The register is derived from the pinned run and the pinned profile version, never re-read from "current".
- Evidence base: every resource type, its measured presence or an explicit "none found in the study area" (R7 — the literal fact, never "clear" or "safe"), disagreements and gaps (F7) stated as facts, and every `Limit` from the run (R3).
- Impact: one table per resource type, each `Impact` row rendered through `formatDerivedProvenance` (F4) — including ranges (`min`/`max`, `dependsOn`) exactly as computed, never collapsed to a single number (R4).
- No section anywhere accepts free text describing a judgment: `document.tsx`'s props type has no `recommendation`, `finding`, or `summary` field, and no template string concatenates rule names into a sentence that implies approval or denial (R6) — the same discipline `impact-analysis.md` R6 applies to the data now applies to its rendering.
- Every map figure is an inline `<svg>` with a `<title>` and `<desc>` (R8), generated as described below — never a screenshot of the live WebGL map (D12).

```tsx
// document.tsx — illustrative shape; every prop is already-resolved data, no fetching inside
export function ReportDocument(props: {
  decision: Decision;
  run: AnalysisRun;
  profileVersion: ProfileVersion;
  mapsSvg: Record<string, string>;
}): JSX.Element {
  /* … */
}
```

## Generating the maps (R8)

`render.ts` calls PostGIS directly for each figure the report needs, from the same pinned geometries the numbers came from (never the live map's WebGL canvas):

```sql
select ST_AsSVG(ST_Transform(geom, 4326), 0, 6) from decision_geometry
  where decision_id = $1 and kind = 'study_area' and revision = $2;
```

Each returned path is wrapped in a hand-authored `<svg>` template with a `<title>` (e.g., "Study area and footprint") and `<desc>` summarizing what's shown, plus a scale indication — satisfying R8's per-map title/description requirement without any charting library.

## Releasing (R1, R10, R11)

```ts
// release.ts
export async function releaseReport(actor: Actor, decisionId: string): Promise<Report> {
  return db.transaction(async (tx) => {
    const [decision] = await tx
      .select()
      .from(decisionTable)
      .where(eq(decisionTable.id, decisionId))
      .for("update"); // lock
    requirePlanner(actor, decision.jurisdictionId);

    const run = await getLatestRun(tx, decisionId, "current"); // R1: the latest successful current run
    if (!run || run.status !== "succeeded")
      throw new ValidationError("no successful analysis run to release");

    await tx
      .select()
      .from(jurisdictionTable)
      .where(eq(jurisdictionTable.id, decision.jurisdictionId))
      .for("share"); // R10
    await tx
      .select()
      .from(datasetVersionTable)
      .where(inArray(datasetVersionTable.id, await pinnedDatasetVersionIds(tx, run.id)))
      .for("share"); // R10

    const stillCurrent = await isStillCurrentInput(tx, decision, run); // re-check profile + dataset pointers
    if (!stillCurrent)
      throw new ConflictError(
        "the rules or evidence changed since this run — refresh and re-run before releasing",
      );

    const nextSeq = (await getMaxSequence(tx, decisionId)) + 1;
    const [report] = await tx
      .insert(reportTable)
      .values({
        decisionId,
        sequenceNumber: nextSeq,
        analysisRunId: run.id,
        templateVersion: CURRENT_TEMPLATE_VERSION,
        status: "releasing",
        objectKey: `${decision.jurisdictionId}/${decisionId}/`,
        requestedBy: actor.userId,
      })
      .returning(); // object_key finalized to include the report id once generated, per data-model.md
    await addJob(
      tx,
      "release_report",
      { reportId: report.id },
      { queueName: `decision:${decisionId}`, maxAttempts: 3 },
    );
    return report;
  });
}
```

- **R1:** `getLatestRun(..., "current")` is the only run this reads — never a `preview` run, and never a run for a different decision.
- **R10:** the `FOR UPDATE` on `decision` and `FOR SHARE` on the jurisdiction and pinned dataset-version rows, plus the `stillCurrent` recheck, together implement `system-architecture.md`'s "Profile approvals and dataset refreshes take `FOR UPDATE` on the same rows, so a release can't interleave with them" — either this transaction commits first (and is honestly against the versions it locked), or a concurrent approval/refresh's own `FOR UPDATE` commits first and `stillCurrent` here returns false, giving the planner a clear `ConflictError` telling them to re-run and release again.
- **R11 (part 1):** `report_one_releasing` (partial unique index on `status = 'releasing'`) means a second release attempt while one is in flight fails immediately rather than double-rendering.

```ts
// release.ts — the release_report job body
export async function renderAndStoreReport(reportId: string): Promise<void> {
  const report = await getReportForRender(reportId); // status must be 'releasing'
  const objectKey = `${report.jurisdictionId}/${report.decisionId}/${report.id}.pdf`;

  const already = await objectStorage.headIfExists(objectKey); // R11 (part 2): idempotent retry
  if (already) {
    await finalizeReleased(reportId, objectKey, already.metadata.sha256); // finalize without re-rendering
    return;
  }

  const html = renderToStaticMarkup(<ReportDocument {...(await loadReportProps(reportId))} />);
  const pdf = await printWithPlaywright(html, { tagged: true, outline: true }); // R8, D12
  const pdfSha256 = sha256(pdf);
  await objectStorage.putIfAbsent(objectKey, pdf, { metadata: { sha256: pdfSha256 } }); // create-only credentials
  await finalizeReleased(reportId, objectKey, pdfSha256);
}

async function finalizeReleased(reportId: string, objectKey: string, pdfSha256: string) {
  await db.update(reportTable)
    .set({ status: "released", objectKey, pdfSha256, releasedAt: sql`now()` })
    .where(and(eq(reportTable.id, reportId), eq(reportTable.status, "releasing"))); // compare-and-set; final-row trigger blocks any further change
}
```

- **R2, R9:** the `reports` bucket's application credentials can create and read objects but never overwrite or delete them, and in production a retention rule blocks everyone else too (`data-model.md`, `system-architecture.md`); the database's `report_final` trigger also blocks any update once `status <> 'releasing'`. Together these make R2 true at three independent layers (storage permissions, storage retention rule, database trigger), not just application code discipline.
- **R11:** a crashed job after the object write but before `finalizeReleased` retries into the `already` branch above and finalizes from the object already in storage — it never renders twice or produces a second object for the same report id.

## Before release (R13)

```ts
// index.ts — read-only, advisory: releaseReport's own transaction is still what decides
export type ReleaseReadiness = {
  blocking: { key: "no-successful-run" | "analysis-out-of-date" | "analysis-failed" | "filing-date-missing" }[];
  stated: { key: "evidence-gaps" | "source-disagreements" | "approximate-boundaries" | "desk-analysis-limits"; count: number }[];
};

export async function getReleaseReadiness(actor: Actor, decisionId: string): Promise<ReleaseReadiness>;
```

`getReleaseReadiness` calls `getAnalysisStatus` (see `decision-overview.md`) once and maps it: `out-of-date` and `failed` are blocking, and `pinInputs`'s `ValidationError` for a missing filing date becomes `filing-date-missing` and is not swallowed. The `stated` counts come from the same run's `evidenceBase`, its `screening` rows, and `limits`. `reports` already imports `analysis`, so this adds no import. `reports` must not import `workflow`, which imports `reports`.

Its keys are a literal union with fixed labels in the route, so there is no free text and no score. The Report page renders the list above the Release button. The button stays enabled when only `stated` items exist, and it is disabled with the reason shown when a `blocking` item exists. The claim in `releaseReport` remains the only authority, so a page that shows a stale list can't cause a bad release: the transaction rechecks (R10).

`CURRENT_TEMPLATE_VERSION` increments with this change, because the document gains sections. Released reports keep the template version they were rendered with.

## Sign-off readiness (R12)

`report.status` today is `'releasing' | 'released' | 'failed'`. F12 adds `'awaiting_signoff'` before `'releasing'` and a precondition in `releaseReport` (a signed-off `report_review` row must exist) — a one-line CHECK and one new status value, not a redesign of the transaction, object key scheme, or immutability guarantees above.

## Verification

- Golden fixture test: a fixture `AnalysisResults` renders to HTML whose text content contains the exact expected provenance strings, the exact impact ranges, and _no_ match against a small denylist of verdict-shaped words ("recommend", "should be approved", "clear to develop", "safe") — a direct, automatable check for R6 and R7.
- The same golden fixture also asserts the screening table, the study-flag list, the source register, and a recorded resolution's rationale appear in the rendered HTML, that an unflagged study prints the P2 sentence, and that an unrecorded project detail prints "Not yet recorded" (R14, R15). The verdict denylist runs over these sections too.
- Testcontainers integration tests for `getReleaseReadiness`: each `blocking` key appears for its condition and none for a current run (R13); after a state change, `releaseReport` still rejects with `ConflictError` even though an earlier `getReleaseReadiness` said nothing blocked, proving the list is advisory (R10, R13).
- Vitest integration test (per the testing rules' _Released PDFs_ row): print a fixture report and assert the PDF is tagged, has an outline, contains the expected provenance text, and its stored hash matches `pdf_sha256` (R8, R9).
- Testcontainers integration tests: `releaseReport` rejects when no successful `current` run exists (R1); a **race test** — a profile approval and a `releaseReport` call fired at once on separate connections — asserts one commits first and the other observes it via `FOR SHARE`/`stillCurrent` and fails with `ConflictError`, never an inconsistent report (R10); calling `releaseReport` twice concurrently hits `report_one_releasing` and only one succeeds; a simulated crash between object-store write and `finalizeReleased` (test calls the two steps separately) confirms a retry finalizes without a second render or a second object (R11); an attempted `UPDATE` against a `released` row is rejected by the database trigger directly, independent of application code (R2, R9).
