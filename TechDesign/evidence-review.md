# TechDesign — Evidence Review

**Feature:** F19 · `analysis` + `evidence`
**Status:** Draft
**Requirements:** [Requirements/evidence-review.md](../Requirements/evidence-review.md) (R1–R12)
**Builds on:** [evidence-layers.md](evidence-layers.md) (F3 — `dataset`, `dataset_version`), [evidence-base.md](evidence-base.md) (F7 — `Disagreement`), [provenance.md](provenance.md) (F4 — the one formatter), [data-model.md](data-model.md)
**Release:** 1

## Approach

Two changes. The attributes are two new columns on `dataset` plus facts that already exist, shown through the one provenance formatter. The resolutions are one new append-only table, written by `analysis` because it owns the disagreement's identity.

A resolution is a note keyed to a disagreement. It is not an input to any computation, so it is not part of `input_sha256`, it doesn't trigger a run, and it can't change a result. That keeps F7 R3 ("UPlan never resolves the conflict on the planner's behalf") true in the strongest way: there is no code path from a resolution to a number.

**Rejected:** letting a resolution choose a source for the analysis. It would put a planner's judgment inside the immutable run, break "the same pinned inputs give the same results", and make a released report depend on a note.

## Data model

```sql
-- F3 additions: recorded when a dataset is set up, never inferred (R2)
alter table dataset
  add column authority text not null
    check (authority in ('federal', 'state', 'regional', 'county', 'local')),
  add column spatial_precision text not null
    check (spatial_precision in ('site', 'parcel', 'regional', 'coarse'));

create table evidence_resolution (
  decision_id       uuid not null references decision (id),
  resource_type_key text not null,
  mapped_by         uuid not null references dataset_version (id),   -- as in Disagreement.mappedBy
  not_mapped_by     uuid not null references dataset_version (id),   -- as in Disagreement.notMappedBy
  revision          integer not null check (revision > 0),
  relied_on         text not null check (relied_on in ('mapped_by', 'not_mapped_by', 'neither')),
  rationale         text not null check (length(rationale) > 0),
  created_by        text not null references app_user (id),
  created_at        timestamptz not null default now(),
  primary key (decision_id, resource_type_key, mapped_by, not_mapped_by, revision),
  check (mapped_by <> not_mapped_by)
);

grant select, insert on evidence_resolution to uplan_app;   -- append-only, like decision_geometry
```

- The migration that adds the `dataset` columns can't use a default, because a default would stand in for missing information. For the rows that already exist, it sets each seeded dataset's `authority` and `spatial_precision` explicitly by `key`, from a list a person reviewed, before adding the `not null`. A dataset with no reviewed entry fails the migration instead of receiving a value.
- The primary key is the guard for R10. `saveResolution` takes the revision the client believes is next, and a collision is a unique violation that becomes `ConflictError`, the same pattern as `saveGeometry`.
- `relied_on` names a side of the pair rather than a dataset id, so a resolution can't reference a dataset that isn't part of its own disagreement.

## Module

```
src/modules/analysis/
  resolutions.ts        saveResolution, listResolutions   — this feature
src/modules/evidence/
  attributes.ts         EvidenceAttributes from dataset + version   — this feature
```

```ts
// resolutions.ts
export async function saveResolution(
  actor: Actor,
  decisionId: string,
  input: {
    resourceType: string;
    mappedBy: string;
    notMappedBy: string;
    reliedOn: "mapped_by" | "not_mapped_by" | "neither";
    rationale: string;
    expectedRevision: number;
  },
): Promise<EvidenceResolution> {
  const status = await getAnalysisStatus(actor, decisionId); // reaches the project through getDecision: the actor must own it
  if (status.kind !== "current") throw new ValidationError("Wait for the analysis to finish before recording a resolution.");
  const run = await getRun(status.runId);
  // The write below takes lockEditableDecision(tx, actor, decisionId), so a completed or generating project refuses it (F22 R3, R8).
  // R11: only a disagreement the latest run reports can be resolved
  const isReported = run.results.evidenceBase.disagreements.some(
    (x) =>
      x.resourceType === input.resourceType && x.mappedBy === input.mappedBy && x.notMappedBy === input.notMappedBy,
  );
  if (!isReported) throw new ValidationError("no such disagreement in the latest analysis");
  try {
    return await db.transaction(async (tx) => {
      await lockEditableDecision(tx, actor, decisionId); // F22 R3, R8: refused when completed or generating
      const [row] = await tx.insert(evidenceResolution)
        .values({ ...input, decisionId, revision: input.expectedRevision, createdBy: actor.userId }).returning();
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`revision ${input.expectedRevision} already exists for this disagreement`); // R10
    throw err;
  }
}
```

**A resolution and the phase review (F21).** The Evidence phase's fingerprint includes each resolution's key and revision, so recording one asks the planner to review the Evidence phase again and, on a completed project, shows in the research change. It still changes no measurement: the fingerprint changes because the output now states the note, not because any number moved.

`rationale` is validated by Zod as non-empty at the route boundary and by the `check` in the table (R7). `listResolutions(actor, decisionId)` returns every revision, and the page shows the highest per key.

- **R9:** matching a resolution to a disagreement is an exact match on `(resource_type_key, mapped_by, not_mapped_by)`. A disagreement in the current run with no matching resolution shows as "not yet recorded for the current data". A stored resolution whose pair isn't in the current run shows as "recorded for earlier data", with its original pair's provenance. No code compares versions loosely.
- **R11:** `saveResolution` reads the latest run once and checks the pair against it. A stale page that submits a pair no longer in the latest run gets a `ValidationError` naming that. The row is never inserted for a stale pair.

## Attributes (R1–R6)

```ts
// evidence/attributes.ts — plain data; display goes through provenance's formatter
export type EvidenceAttributes = {
  authority: "federal" | "state" | "regional" | "county" | "local"; // dataset.authority
  sourceAsOfOn: string | null; // dataset_version.source_as_of
  sourceAsOfNote: string | null; // required when source_as_of is null
  retrievedAt: string; // never shown as the publisher's date (F4)
  spatialPrecision: "site" | "parcel" | "regional" | "coarse";
  verification: "mapped-remote"; // R4: the only value in release 1
  professionalReview: "none"; // R4: the only value in release 1
};
```

`provenance` gains `formatEvidenceAttributes(attributes, today, mapStatus, consistency)`, returning the seven labelled lines of R1. It takes `today` from the injected clock and is the only place data age in years is computed and rounded (R3; no rounding elsewhere). `boundary status` comes from the profile's `mapStatus` and `consistency` from the run's disagreements for that resource type: "sources disagree", "sources agree" when two or more datasets map it with no disagreement, and "single source" otherwise (R5). `verification` and `professionalReview` are single-value literal types so the release-1 truth is in the type. When field verification exists in a later release, the type changes and the compiler finds every use.

The data-quality panel (R6) reads the dataset version's own columns and `processing_steps`. The geometry repair count is already recorded there (F3 R6). Coverage relative to the study area is the F7 gap test, `intersectsCoverage`, already used for gaps.

## Interfaces

`evidence/page.tsx` keeps its per-resource-type card and gains, under the confidence badge, the seven-line attribute list and a collapsed data-quality panel. Where the run reports a disagreement, the card shows both sources' provenance (F7 R3) and a small form: relied on (this source, that source, neither), rationale, and the revision it is based on. The form is a Server Function that authenticates, validates with Zod, and calls `saveResolution`. The client component that holds the form sends the revision it was rendered with, blocks a double submit, and discards a response to a superseded request (the browser-honesty rule). The card lists earlier revisions under "History".

The report (F10 R14) reads `listResolutions` for the pinned run's disagreements and renders each with its rationale, author, and date, through the same formatters.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `EvidenceAttributes` + `formatEvidenceAttributes` on the Evidence card | Seven labelled lines |
| R2 | `dataset.authority`, `dataset.spatial_precision`, both `not null` with `check` | Set at registration |
| R3 | `formatEvidenceAttributes` with the injected clock | No threshold label; note shown when no publisher date |
| R4 | Literal-typed `verification` and `professionalReview` | Stated, not omitted |
| R5 | Profile `mapStatus`; consistency from `evidenceBase.disagreements` | |
| R6 | Data-quality panel over `dataset_version` and `processing_steps` | Repair count from F3 R6 |
| R7 | `saveResolution`; no reader of `evidence_resolution` in `run.ts` or any computation | Structural: nothing computes from it |
| R8 | Append-only table with a revision in the key; `select, insert` only | Latest revision shown, history kept |
| R9 | Exact-key matching against the current run's disagreements | Two display states |
| R10 | Primary key collision becomes `ConflictError` | Race test below |
| R11 | `saveResolution`'s check against the latest run | Stale pair rejected |
| R12 | `listResolutions` in the report's evidence section | Template in F10 R14 |

## Risks and tradeoffs

- **A resolution can look like a decision.** The card words it as "the planner relies on X because …", next to both sources, and says the analysis is unchanged. The report repeats that.
- **Every dataset refresh reopens the question.** R9 makes that deliberate: a resolution isn't carried to different data. The cost is that a planner re-records after each refresh that touches a disagreement.
- **Two more columns on `dataset`** need a reviewed value for each seeded dataset. That review is the point: the authority and precision claims are made by a person, once.

## Verification

- Testcontainers integration tests: `saveResolution` rejects a pair the latest run doesn't report (R11); a pair stored, then a dataset refresh that changes one version, shows as "recorded for earlier data" and the current disagreement as not recorded (R9); the migration fails on a dataset with no reviewed `authority` (R2); a database-level test that `update` and `delete` on `evidence_resolution` are denied to `uplan_app` (R8); **a race test** fires two `saveResolution` calls for one revision at once on separate connections and asserts exactly one succeeds and the other fails with `ConflictError` (R10).
- A determinism test runs the same analysis before and after recording a resolution and asserts byte-identical `results` (R7).
- Unit tests: `formatEvidenceAttributes` with a fixed clock for a dated dataset, a dataset with only a note, and `retrievedAt` never appearing as the publisher's date (R3); a denylist test that no attribute line contains "current", "recent", "old", "verified" without "not" (R3, R4).
- Playwright: record a resolution on a disagreement, see it beside both sources with the analysis numbers unchanged, and pass `@axe-core/playwright` (R1, R7).

## Open questions

- None. The choice of five authority values and four precision values follows the ecological workflow's evidence model. A city that needs a different list is a profile question, and none has asked.
