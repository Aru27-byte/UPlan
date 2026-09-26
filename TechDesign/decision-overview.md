# TechDesign — Decision Overview and Stage Rail

**Feature:** F18 · `workflow`
**Status:** Draft
**Requirements:** [Requirements/decision-overview.md](../Requirements/decision-overview.md) (R1–R13)
**Builds on:** [decisions.md](decisions.md) (F5), [evidence-base.md](evidence-base.md) (`run.ts`, pinning), [study-scoping.md](study-scoping.md) (F14), [system-architecture.md](system-architecture.md) (_Modules_, _Concurrency and consistency_)
**Release:** 1

## Approach

The Overview and the stage rail are a read model over records that already exist. They need one new module, because they combine `decisions`, `analysis`, `profiles`, and `reports`, and `analysis` and `reports` already import `decisions`. Putting the combination in any of those four would make an import cycle.

_Revised 2026-09-27:_ the module owns one table, `phase_review` (F21), so it is no longer read-only. Step states are still derived, never stored; the reviews are the planner's own records that the derivation reads. The routes are under `projects/[projectId]`, and the module list, the review states, and the phase pages are in [research-phases.md](research-phases.md).

**Rejected:** doing the combination in the route or layout. Step states and next actions are domain rules, and `file-structure-and-imports.md` keeps domain rules out of `src/app/`.

**Rejected:** storing step states in a table. They are derivable, and a stored copy would go stale the moment a geometry revision or dataset version arrives.

## Module

```
src/modules/workflow/          owns phase_review (F21)
  index.ts                     getWorkflow, and the F21/F22 functions
  workflow.ts                  getWorkflow: loads the facts, calls the pure functions
  steps.ts                     deriveSteps(facts): StepState[]        — pure
  next-actions.ts              deriveNextActions(facts): NextAction[] — pure
  (phases, drafting, reviews, finish, summaries: see research-phases.md and research-changes.md)
  *.test.ts
```

`workflow` imports `decisions`, `analysis`, `profiles`, and `reports` through their `index.ts` files. Nothing imports `workflow` except routes and the worker. `system-architecture.md`'s module table has a row for it.

## One read of the inputs (R7)

`run.ts` today reads the study area, footprint, profile, dates, and dataset versions inline, then hashes them. `getAnalysisStatus` needs the same values to say whether a run for the current inputs exists. Reading them separately would let the page and the run disagree, and would read "current" twice. So the read is extracted, and both call it.

```ts
// analysis/pin-inputs.ts — extracted from runAnalysis; run.ts and status.ts both call it
export type PinnedInputs = {
  studyAreaRevision: number;
  footprintRevision: number | null;
  profileVersionId: string;
  resolvedFor: Record<string, string>; // rule set -> the date its rules were resolved for (stored on the run, shown to the planner)
  inForceRuleKeys: string[]; // "<kind>:<key>:<effectiveOn>" for every rule in force; sorted. This, not the date, is what the hash carries
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
  | { kind: "rules-in-force" } // a rule took effect or was repealed, so the set of rules in force differs
  | { kind: "dataset-version"; datasetKey: string };

export async function getAnalysisStatus(actor: Actor, decisionId: string): Promise<AnalysisStatus>;
```

**Why the hash carries the rules in force and not the date.** `resolveRulesInForce` resolves a non-vesting rule set for _today_. If `resolvedFor` were hashed, every project's inputs would differ each midnight, every completed project would read "out of date", and F21 outputs would vanish daily. The rules that apply only change when a rule takes effect or is repealed, so the hash carries the sorted list of in-force rule identities. `analysis_run.rules_resolved_for` still records the dates, so a run states what it resolved for (F18 R9). This also lets `run.ts`'s "identical inputs are a no-op" rule (F7 R8) hold across days.

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
  | { step: PhaseKey; state: ReviewState }                                   // the six phases (research-phases.md)
  | { step: "overview"; state: "recorded" | "needs-attention" }
  | { step: "report"; state: "not-ready" | "ready" | "generating" | "published"; latestVersion: number | null };

export type WorkflowFacts = {
  phases: PhaseView[];             // research-phases.md: outputs, review states, history
  filedOn: string | null;
  vestingRuleSetExists: boolean;
  status: AnalysisStatus;
  results: AnalysisResults | null; // the current run's results, if the analysis is current
  unresolvedDisagreements: number; // F19
  decisionStatus: "in_progress" | "finishing" | "report_released";
  latestVersion: number | null;    // F22
};
```

The rules, one per step:

| Step | State |
| --- | --- |
| Overview | _Needs attention_ when a vesting rule set exists and the filing date is missing; otherwise _Recorded_ |
| Site … Impact | The phase's `ReviewState` (research-phases.md R5): _To do_, _Updating_, _Needs review_, _Reviewed_, or _Revision requested_. A failed analysis shows _Needs attention_ on the analysis phases |
| Report | _Generating_ while `finishing`; _Version N published_ when completed; _Ready to finish_ when every phase is _Reviewed_ and the analysis is current; otherwise _Not ready_ |

A step whose analysis is `out-of-date`, `running`, or `failed` shows the analysis status beside its state rather than changing its own state (R7). Nothing in `steps.ts` returns a state named done, complete, clear, or approved (R2).

`getWorkflow` returns `{ steps, status, facts }`. The layout renders the rail from `steps`. The rail is a `<nav aria-label>` list with `aria-current="page"` on the active item and each state as text next to its icon (R12, R13). The existing gate stays where it is: the Footprint page shows "Draw the study area first" when there is none (R3).

## Next actions (R6)

```ts
// next-actions.ts — pure; the array order is the priority order
export type NextAction = { step: StepKey; key: NextActionKey; count?: number };

// A phase "needs work" while its state is needs-review or revision-requested (research-phases.md).
const RULES: { key: NextActionKey; step: StepKey; when: (f: WorkflowFacts) => number | boolean }[] = [
  { key: "finish-generating", step: "report", when: (f) => f.decisionStatus === "finishing" },
  { key: "draw-study-area", step: "site", when: (f) => stateOf(f, "site") === "to-do" },
  { key: "record-filing-date", step: "overview", when: (f) => f.vestingRuleSetExists && f.filedOn === null },
  { key: "review-failed-analysis", step: "overview", when: (f) => f.status.kind === "failed" },
  { key: "wait-for-analysis", step: "overview", when: (f) => f.status.kind === "running" || f.status.kind === "out-of-date" },
  { key: "review-site", step: "site", when: (f) => needsReview(f, "site") },
  { key: "review-evidence", step: "evidence", when: (f) => needsReview(f, "evidence") },
  { key: "review-disagreements", step: "evidence", when: (f) => f.unresolvedDisagreements },
  { key: "review-screening", step: "screening", when: (f) => needsReview(f, "screening") },
  { key: "review-studies", step: "studies", when: (f) => needsReview(f, "studies") },
  { key: "trace-footprint", step: "footprint", when: (f) => stateOf(f, "site") !== "to-do" && stateOf(f, "footprint") === "to-do" },
  { key: "review-footprint", step: "footprint", when: (f) => needsReview(f, "footprint") },
  { key: "review-impact", step: "impact", when: (f) => needsReview(f, "impact") },
  { key: "finish-research", step: "report", when: (f) => f.decisionStatus === "in_progress" && allReviewed(f) },
  { key: "start-research-change", step: "report", when: (f) => f.decisionStatus === "report_released" },
];
```

`NextActionKey` is a string literal union, and the label for each key is a fixed sentence in the route. The action list has no free-text field and takes no input from a model (R6). `stateOf`, `needsReview` (the state is _needs review_ or _revision requested_), and `allReviewed` are three small pure helpers over `facts.phases`. The dashboard's "Resume research" link goes to the first action's step (F20 R4).

## The Overview page (R4, R5, R8, R9, R11)

`src/app/(app)/projects/[projectId]/overview/page.tsx` is a Server Component and calls one function, `getWorkflow`. It renders five blocks under the five questions of R4:

- **Known:** per resource type, the datasets that map it and the count of intersecting features, from the run's `screening` rows.
- **Not known:** `evidenceBase.gaps`, the unresolved disagreements, and `limits`.
- **Could delay:** the analysis status and its changes, a missing filing date, the target decision date with days remaining computed from the injected clock, and the document state.
- **What desk analysis can't settle:** `studyFlags` and the screening rows that are `approximate` with a nonzero overlap or reach, each worded from F14's templates.
- **Next:** `deriveNextActions`.

Below them: **Rules that apply** (R8), from `resolveRulesInForce` applied to the current profile for this decision, each entry with its citation and effective date through the provenance formatter; and **Assumptions** (R9), from the run's `rules_resolved_for` and the resource types' `mapStatus`. Every count shown is an integer. No block sums or averages anything into a single figure (R5).

## Project details (R10)

`decisions` gains four nullable columns and one function (see `decisions.md` R10–R12 and `data-model.md`). `setFilingDate` is replaced by `updateDecisionDetails`, which sets any of the detail fields (and the title) in one compare-and-set on `row_version` under the decision lock, and enqueues `run_analysis` in the same transaction when `filedOn` changed. The header's filing-date form is removed, and the Overview's form is the one place details are edited; on a completed project it is read-only until a research change starts. The stale-view conflict (R10) is the `ConflictError` that compare-and-set already raises. The form is an `ActionForm` (F20) that sends the row version it rendered with.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | The project layout renders the rail from `getWorkflow().steps` | Replaces `tab-nav.client.tsx` with `stage-rail.tsx` |
| R2 | `deriveSteps`; no state name means approval | Table above |
| R3 | The rail is links; only F8's existing gate remains | |
| R4 | The Overview's five blocks | Data from `results`, `status`, and F19 |
| R5 | No aggregate value anywhere in `workflow` | Type shapes carry integers and lists only |
| R6 | `deriveNextActions`, fixed `RULES` | Keys are a literal union |
| R7 | `getAnalysisStatus`, `pinInputs`, `InputChange` | One shared read of current inputs |
| R8 | `resolveRulesInForce` + the provenance formatter | Links to `/profile` |
| R9 | `rules_resolved_for`, `mapStatus`, footprint presence | Read from the run and profile |
| R10 | `updateDecisionDetails` in `decisions`; the details form | Compare-and-set on `row_version` |
| R11 | `listDocumentVersions` (F22) | Version number, publication date, download link |
| R12 | Text labels plus distinct icons for status and analysis status | Checked by axe and a visual check |
| R13 | `<nav>` semantics, responsive layout | Look-up only on phones |

## Risks and tradeoffs

- **Extracting `pinInputs` changes `run.ts`, and the hash changes with it.** `resultsVersion` (F14) and the in-force rule keys enter the hash, so every open decision recomputes once after this change. That is intended: their old results lack screening and study flags. It is a one-time cost, on each decision's own queue.
- **The status page can lag the job by a moment.** `out-of-date` truthfully covers the gap between a save and the run row appearing. The page never claims "running" until a `running` row exists.
- **A cross-module read model is more code than a route calling four functions.** It is the smallest version that keeps the rules out of `src/app/` and cycle-free.

## Verification

- Vitest unit tests: `deriveSteps` and `deriveNextActions` over a table of `WorkflowFacts`, asserting each cell of the state table and the priority order (R2, R6). A shape test asserts no step state or action key names done, complete, clear, safe, or approved (R2, P2). A test asserts no exported value in `workflow` is a percentage or score (R5).
- Testcontainers integration tests: `getAnalysisStatus` returns `current`, `running`, `failed`, and `out-of-date` with the exact `InputChange`s after each kind of input change (R7); a vesting rule set with no filing date surfaces the `ValidationError` instead of a default (R7); the `pinInputs` hash is **the same on two consecutive days** for a non-vesting decision with no rule change (the midnight test: the hash carries the rules in force, not the date), and changes when a rule's effective date passes; `updateDecisionDetails` with a stale `row_version` fails with `ConflictError`, and **a race test** fires two edits of one `row_version` at once on separate connections and asserts exactly one succeeds (R10).
- Playwright: the rail shows the right states through a create → draw → run → trace → release path (R1–R3, R11); the Overview passes `@axe-core/playwright` at desktop and phone widths (R13); the stage rail's `aria-current` is on the active page.

## Open questions

- Whether the Report stage's _Needs attention_ should also count the pre-release checks in F10 R13 once they exist. The state rule above uses only the analysis status so the two features stay independent.
