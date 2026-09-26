# TechDesign — Sample Data

**Feature:** F23 · `decisions` + `evidence` + `scripts/seed-local.ts`
**Status:** Draft
**Requirements:** [Requirements/sample-data.md](../Requirements/sample-data.md) (R1–R9)
**Builds on:** [decisions.md](decisions.md) (F5), [research-phases.md](research-phases.md) (F21), [evidence-layers.md](evidence-layers.md) (F3), [provenance.md](provenance.md) (F4)
**Release:** 1

## Approach

Sample data is data, not a mode. The sample study area and footprint are two fixed GeoJSON values saved through the same `saveGeometry` path as a drawn one, and the illustrative evidence is ordinary datasets, versions, and features, created the way any dataset is. What marks them as sample is a label on the record, read by the code that displays them. The analysis never reads the label (R4).

**Rejected:** a "demo mode" switch that swaps in canned results. It would prove nothing about the engine and would need a second code path in every phase.

**Rejected:** generating random geometry. Hand-placed shapes give known overlaps, so a test can assert exact areas and the sample can be designed to exercise every phase (R5).

## Sample inputs (R1, R2, R7, R8)

```
src/modules/decisions/sample-data.ts
  SAMPLE_NOTE_PREFIX      "Sample data — "
  SAMPLE_DETAILS          fixed details, each value labeled as sample
  SAMPLE_STUDY_AREA       MultiPolygon
  SAMPLE_FOOTPRINT        MultiPolygon
  isSampleNote(note)      note.startsWith(SAMPLE_NOTE_PREFIX)
  createSampleProject(actor): Promise<Decision>
  loadSampleGeometry(actor, decisionId, kind, expectedRevision): Promise<DecisionGeometry>
  loadSampleDetails(actor, decisionId, expectedRowVersion): Promise<Decision>
```

- The sample details are: title "Sammamish Ridge Estates (sample)", type subdivision, parcel or address "Sample parcel — not a real address", applicant "Sample applicant (fictional)", project manager "Sample project manager (fictional)", target decision date and filing date fixed dates. No value is a real person or company (R7).
- The study area and footprint are the rectangles the local seed already used, in the pilot city's area, and each geometry's `source_note` is `"Sample data — illustrative study area, not a real parcel."` or the footprint equivalent (R6).
- `loadSampleGeometry` is `saveGeometry` with the fixture. `loadSampleDetails` is `updateDecisionDetails` with the fixture. Neither has a path of its own, so the lock, the revision guard, and the analysis enqueue all apply (R8).
- `createSampleProject` does what creating a project and loading all three inputs would, in **one transaction**, so a failure part-way leaves nothing behind. It calls the internal helpers `insertDecision`, `insertGeometryRevision`, and `enqueueAnalysisRun(…, tx)` that `createDecision` and `saveGeometry` are built from, rather than duplicating them.
- **R8:** all of it goes through `lockEditableDecision`, so a completed project refuses it.

## Sample evidence (R3, R5, R9)

```
src/modules/evidence/sample-evidence.ts
  SAMPLE_EVIDENCE            the illustrative datasets and their hand-placed features
  installSampleEvidence(actor, jurisdictionId): Promise<{ created: string[]; existing: string[] }>
```

- **Datasets.** One per resource type in the Sammamish profile, plus a second, disagreeing wetlands dataset, and **none** for critical aquifer recharge areas, so a gap exists (R5). Each is `is_sample = true`, publisher "City of Sammamish (illustrative test data)", and carries a confidence rationale saying not to use its figures in a real decision. Each has an explicit `authority` and `spatial_precision` (F19).
- **Placement.** The shapes are the ones the local seed used, placed relative to the sample study area and footprint so that: wetlands sit inside the footprint (a direct impact) and the alternate wetlands dataset half-overlaps them (a disagreement); streams, geologic hazards, habitat, and corridors are inside or within their buffer of the footprint; flood areas and forest canopy are inside the study area and away from the footprint (evidence, no overlap); and the approximate-boundary types (per the profile) carry the "approximate" label (R5).
- **`installSampleEvidence`** requires staff (`requireStaff`) and is create-if-missing per dataset key. For each key it does one insert of the dataset guarded by the unique `key` (`on conflict do nothing`), and creates the version and feature only when the insert created the dataset, all in one transaction, so two clicks at once create each dataset once. It never updates or deletes (R9). It uses direct inserts, the same as the seed script did, because `ingestDataset` needs GDAL, which is not installed everywhere (`alternatives-and-tradeoffs.md`), and each version's `processing_steps` records `"sample: inserted directly, not ingested"`. It maps each dataset to the jurisdiction with `mapToJurisdiction`.
- It runs each hand-written geometry through `ST_IsValid` before inserting, since `evidence_feature` has no gate of its own, and throws on an invalid one.

The **City profile** page shows staff a "Sample evidence" panel: what it installs, that it is illustrative, and one button with a confirmation. Non-staff never see it, and the function refuses them regardless (R9).

## Labels (R6)

- `dataset.is_sample boolean not null default false` (migration 0003). The default is `false` because "not sample" is the truth for every dataset that isn't one, not a stand-in for missing information.
- `EvidenceProvenance` gains `isSample: boolean`. `formatEvidenceProvenance` prefixes the source line with `"Sample data (illustrative) — "` when it is true, so the map popup, the evidence card, the impact provenance, and the document all show it through the one formatter, with no page doing it separately (F4).
- **A project "uses sample data"** when its latest study area or footprint note passes `isSampleNote`, or any dataset version pinned by its current run is from an `is_sample` dataset. `workflow`'s `PhaseFacts` carries `usesSampleData`, and it is copied into the published snapshot. It is derived from records every time, so replacing a sample boundary with a real one clears the label from the geometry side, and the dataset side stays for as long as the illustrative datasets are in the analysis, which is the truth.
- The label appears on the dashboard row, the project header, the Overview, and the document's first page.

## Seed script

`scripts/seed-local.ts` is rewritten to use the same modules:

1. Run graphile-worker's migrations (its schema must exist before anything enqueues).
2. Ensure the Sammamish jurisdiction.
3. Make the named person UPlan staff, and create a synthetic staff reviewer for the profile approval (the no-self-approval constraint is unchanged).
4. Ensure the illustrative profile through `proposeEdit` and `decideChange`.
5. Call `installSampleEvidence`.

It no longer grants a membership (there are none) and no longer creates a demo decision: a planner starts one from the dashboard with **Start with sample data**. Its reset of the illustrative datasets remains, marked local-development only, and the script refuses to run when `NODE_ENV` is `production`.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `createSampleProject` and the dashboard and new-research actions | One transaction |
| R2 | `loadSampleDetails`, `loadSampleGeometry` | Ordinary revisions |
| R3 | The gap rules of F7; `installSampleEvidence`; the staff panel | Gaps stated, never empty successes |
| R4 | No reader of `is_sample` or `isSampleNote` in `analysis` or `workflow` outputs, other than the label | Asserted by a test that greps the analysis code for those names |
| R5 | `SAMPLE_EVIDENCE` placement, the sample geometry | An integration test asserts each named feature of the output |
| R6 | `SAMPLE_NOTE_PREFIX`, `dataset.is_sample`, the provenance formatter, `usesSampleData` | One formatter |
| R7 | The fixed fictional values | A test asserts every free-text sample value says "sample" or "fictional" |
| R8 | `lockEditableDecision` | Refused when completed or generating |
| R9 | `installSampleEvidence` | Staff only; create-if-missing |

## Risks and tradeoffs

- **Illustrative datasets in a real deployment.** A staff member could install them in production. The confirmation says what they are, every figure carries the label, and every published document says so. The alternative, hiding the button, would leave the demonstration unavailable where it may be wanted (a training environment).
- **Direct inserts skip ingestion.** The sample never exercises `ingestDataset`. That path has its own tests (F3); the sample tests the analysis, not ingestion.

## Verification

- Vitest unit tests: `isSampleNote`; the fixtures are valid `MultiPolygon`s; the sample details contain "sample" or "fictional" in every free-text value (R7); a source-scan test asserts `analysis/` and `workflow/` outputs never branch on `isSampleNote` or `is_sample` (R4); `formatEvidenceProvenance` prefixes a sample source (R6).
- Testcontainers integration tests: `installSampleEvidence` twice creates each dataset once, and a race test fires it twice at once and asserts no duplicate and no error (R9); a non-staff actor is refused (R9); with the illustrative profile and datasets, a sample project's run contains a direct impact, a buffer impact, a disagreement, a gap, at least one flag and at least one unflagged study (R5); `createSampleProject` rolls back completely when its last step fails (R1); loading sample geometry over an existing revision adds revision 2 and keeps revision 1 (R8); loading on a completed project fails with `ConflictError` (R8).
- Playwright: start with sample data, watch the analysis finish, and see the "Sample data" label on the dashboard, header, and each provenance line (R1, R6).

## Open questions

- None.
