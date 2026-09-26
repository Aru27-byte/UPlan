# TechDesign — Decision Overview and Stage Rail

**Feature:** F18 · `workflow`
**Status:** Draft
**Requirements:** [Requirements/decision-overview.md](../Requirements/decision-overview.md) (R1–R13)
**Builds on:** [decisions.md](decisions.md) (F5), [evidence-base.md](evidence-base.md) (`run.ts`, pinning), [study-scoping.md](study-scoping.md) (F14), [system-architecture.md](system-architecture.md) (_Modules_, _Concurrency and consistency_)
**Release:** 1

## Approach

The Overview and the stage rail are a read model over records that already exist. They add no table. They need one new read-only module, because they combine `decisions`, `analysis`, `profiles`, and `reports`, and `analysis` and `reports` already import `decisions`. Putting the combination in any of those four would make an import cycle.

**Rejected:** doing the combination in the route or layout. Step states and next actions are domain rules, and `file-structure-and-imports.md` keeps domain rules out of `src/app/`.

**Rejected:** storing step states in a table. They are derivable, and a stored copy would go stale the moment a geometry revision or dataset version arrives.

## Module

```
src/modules/workflow/          read-only; owns no table
  index.ts                     getWorkflow
  workflow.ts                  getWorkflow: loads the facts, calls the pure functions
  steps.ts                     deriveSteps(facts): StepState[]        — pure
  next-actions.ts              deriveNextActions(facts): NextAction[] — pure
  *.test.ts
```

`workflow` imports `decisions`, `analysis`, `profiles`, and `reports` through their `index.ts` files. Nothing imports `workflow` except routes. `system-architecture.md`'s module table gains a row for it.

## One read of the inputs (R7)

`run.ts` today reads the study area, footprint, profile, dates, and dataset versions inline, then hashes them. `getAnalysisStatus` needs the same values to say whether a run for the current inputs exists. Reading them separately would let the page and the run disagree, and would read "current" twice. So the read is extracted, and both call it.

```ts
// analysis/pin-inputs.ts — extracted from runAnalysis; run.ts and status.ts both call it
export type PinnedInputs = {
  studyAreaRevision: number;
  footprintRevision: number | null;
  profileVersionId: string;
  resolvedFor: Record<string, string>; // rule set -> the date its rules were resolved for
  datasetVersionIds: string[]; // sorted
  resultsVersion: number;
  inputSha256: string;
  // plus the loaded study area, footprint, resolved rules, dataset mappings, and the jurisdiction's
  // analysis SRID, which run.ts needs and status.ts ignores
};

// null when the decision has no study area yet: there is nothing to analyze
export async function pinInputs(
  decisionId: string,
  purpose: "current" | "preview",
  profileChangeId?: string,
): Promise<PinnedInputs | null>;
```

```ts
// analysis/status.ts
export type AnalysisStatus =
  | { kind: "none" } // no study area yet, so there is nothing to analyze
  | { kind: "current"; runId: string }
  | { kind: "running"; runId: string }
  | { kind: "failed"; runId: string; errorDetail: string }
  | { kind: "out-of-date"; changes: InputChange[] }; // no run exists for the current inputs

export type InputChange =
  | { kind: "study-area"; from: number | null; to: number }
  | { kind: "footprint"; from: number | null; to: number } // from is null when this is the first footprint
  | { kind: "profile-version" }
  | { kind: "rule-date"; ruleSet: string; from: string; to: string }
  | { kind: "dataset-version"; datasetKey: string };

export async function getAnalysisStatus(actor: Actor, decisionId: string): Promise<AnalysisStatus>;
```

`getAnalysisStatus` calls `pinInputs(decisionId, "current")` once, returns `none` when that is `null`, finds the run with that `input_sha256` through `unique (decision_id, purpose, input_sha256)`, and maps its `status`. With no such run it compares the pinned inputs to the latest succeeded run's stored columns and pins to list what changed (R7). `out-of-date` covers both "queued behind another job" and "not yet enqueued". The page shows the changes, not a guess about the queue.

`pinInputs` throws `ValidationError` when a vesting rule set has no filing date, the same error a run fails with (F1 R3). The status function lets it reach the page, which shows it as the reason (R4, "what could delay this"). There is no default date.

## Step states (R1, R2, R3)

```ts
// steps.ts — pure
export type StepKey =
  | "overview"
  | "site"
  | "evidence"
  | "screening"
  | "studies"
  | "footprint"
  | "impact"
  | "report";
export type StepState =
  | { step: StepKey; state: "to-do" }
  | { step: StepKey; state: "needs-attention"; count: number; reasonKey: string }
  | { step: StepKey; state: "recorded" };

export type WorkflowFacts = {
  hasStudyArea: boolean;
  hasFootprint: boolean;
  filedOn: string | null;
  vestingRuleSetExists: boolean;
  status: AnalysisStatus;
  results: AnalysisResults | null; // the latest current-version run, if any
  unresolvedDisagreements: number; // F19
  reportStatus: "none" | "releasing" | "released" | "failed";
};
```

The rules, one per step:

| Step | To do | Needs attention | Recorded |
| --- | --- | --- | --- |
| Overview | — | filing date missing and a vesting rule set exists | otherwise |
| Site | no study area | — | a study area exists |
| Evidence | no succeeded run | gaps + unresolved disagreements > 0 (count) | a succeeded run exists |
| Screening | no succeeded run | — | a succeeded run exists |
| Studies | no succeeded run | study flags > 0 (count) | a succeeded run exists |
| Footprint | no footprint | — | a footprint exists |
| Impact | no run with a footprint | — | a run with a footprint exists |
| Report | no released report | the analysis is out of date or failed | a report is released |

A step with a run whose status is `out-of-date`, `running`, or `failed` shows the analysis status beside its state rather than changing its own state (R7). Nothing in `steps.ts` returns a state named done, complete, clear, or approved (R2).

`getWorkflow` returns `{ steps, status, facts }`. The layout renders the rail from `steps`. The rail is a `<nav aria-label>` list with `aria-current="page"` on the active item and each state as text next to its icon (R12, R13). The existing gate stays where it is: the Footprint page shows "Draw the study area first" when there is none (R3).

## Next actions (R6)

```ts
// next-actions.ts — pure; the array order is the priority order
export type NextAction = { step: StepKey; key: NextActionKey; count?: number };

const RULES: { key: NextActionKey; step: StepKey; when: (f: WorkflowFacts) => number | boolean }[] = [
  { key: "draw-study-area", step: "site", when: (f) => !f.hasStudyArea },
  { key: "record-filing-date", step: "overview", when: (f) => f.vestingRuleSetExists && f.filedOn === null },
  { key: "review-failed-analysis", step: "overview", when: (f) => f.status.kind === "failed" },
  { key: "review-disagreements", step: "evidence", when: (f) => f.unresolvedDisagreements },
  { key: "review-flagged-studies", step: "studies", when: (f) => f.results?.studyFlags.length ?? 0 },
  { key: "trace-footprint", step: "footprint", when: (f) => f.hasStudyArea && !f.hasFootprint },
  { key: "review-impact", step: "impact", when: (f) => f.hasFootprint && f.status.kind === "current" },
  { key: "release-report", step: "report", when: (f) => f.status.kind === "current" && f.reportStatus === "none" },
];
```

`NextActionKey` is a string literal union, and the label for each key is a fixed sentence in the route. The action list has no free-text field and takes no input from a model (R6). `f.results?.studyFlags.length ?? 0` is not a hidden default: `results` is null exactly when no run exists, and then there are truly no flags to review.

## The Overview page (R4, R5, R8, R9, R11)

`src/app/(app)/decisions/[decisionId]/overview/page.tsx` is a Server Component and calls one function, `getWorkflow`. It renders five blocks under the five questions of R4:

- **Known:** per resource type, the datasets that map it and the count of intersecting features, from the run's `screening` rows.
- **Not known:** `evidenceBase.gaps`, the unresolved disagreements, and `limits`.
- **Could delay:** the analysis status and its changes, a missing filing date, the target decision date with days remaining computed from the injected clock, and the report state.
- **What desk analysis can't settle:** `studyFlags` and the screening rows that are `approximate` with a nonzero overlap or reach, each worded from F14's templates.
- **Next:** `deriveNextActions`.

Below them: **Rules that apply** (R8), from `resolveRulesInForce` applied to the current profile for this decision, each entry with its citation and effective date through the provenance formatter; and **Assumptions** (R9), from the run's `rules_resolved_for` and the resource types' `mapStatus`. Every count shown is an integer. No block sums or averages anything into a single figure (R5).

## Project details (R10)

`decisions` gains four nullable columns and one function (see `decisions.md` R10–R12 and `data-model.md`). `setFilingDate` is replaced by `updateDecisionDetails`, which sets any of the detail fields in one compare-and-set on `row_version`, and enqueues `run_analysis` in the same transaction when `filedOn` changed. The header's filing-date form is removed, and the Overview's form is the one place details are edited. The stale-view conflict (R10) is the `ConflictError` that compare-and-set already raises.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | The layout renders the rail from `getWorkflow().steps` | Replaces `tab-nav.client.tsx` |
| R2 | `deriveSteps`; no state name means approval | Table above |
| R3 | The rail is links; only F8's existing gate remains | |
| R4 | The Overview's five blocks | Data from `results`, `status`, and F19 |
| R5 | No aggregate value anywhere in `workflow` | Type shapes carry integers and lists only |
| R6 | `deriveNextActions`, fixed `RULES` | Keys are a literal union |
| R7 | `getAnalysisStatus`, `pinInputs`, `InputChange` | One shared read of current inputs |
| R8 | `resolveRulesInForce` + the provenance formatter | Links to `/profile` |
| R9 | `rules_resolved_for`, `mapStatus`, footprint presence | Read from the run and profile |
| R10 | `updateDecisionDetails` in `decisions`; the details form | Compare-and-set on `row_version` |
| R11 | `getLatestReportForDecision` | Sequence, `released_at`, download link |
| R12 | Text labels plus distinct icons for status and analysis status | Checked by axe and a visual check |
| R13 | `<nav>` semantics, responsive layout | Look-up only on phones |

## Risks and tradeoffs

- **Extracting `pinInputs` changes `run.ts`.** The extracted function must be byte-for-byte what the run hashed before, or every open decision recomputes for no reason. A test pins a fixture's `input_sha256` before and after the extraction.
- **The status page can lag the job by a moment.** `out-of-date` truthfully covers the gap between a save and the run row appearing. The page never claims "running" until a `running` row exists.
- **A cross-module read model is more code than a route calling four functions.** It is the smallest version that keeps the rules out of `src/app/` and cycle-free.

## Verification

- Vitest unit tests: `deriveSteps` and `deriveNextActions` over a table of `WorkflowFacts`, asserting each cell of the state table and the priority order (R2, R6). A shape test asserts no step state or action key names done, complete, clear, safe, or approved (R2, P2). A test asserts no exported value in `workflow` is a percentage or score (R5).
- Testcontainers integration tests: `getAnalysisStatus` returns `current`, `running`, `failed`, and `out-of-date` with the exact `InputChange`s after each kind of input change (R7); a vesting rule set with no filing date surfaces the `ValidationError` instead of a default (R7); the `pinInputs` fixture hash is unchanged by the extraction; `updateDecisionDetails` with a stale `row_version` fails with `ConflictError`, and **a race test** fires two edits of one `row_version` at once on separate connections and asserts exactly one succeeds (R10).
- Playwright: the rail shows the right states through a create → draw → run → trace → release path (R1–R3, R11); the Overview passes `@axe-core/playwright` at desktop and phone widths (R13); the stage rail's `aria-current` is on the active page.

## Open questions

- Whether the Report stage's _Needs attention_ should also count the pre-release checks in F10 R13 once they exist. The state rule above uses only the analysis status so the two features stay independent.
