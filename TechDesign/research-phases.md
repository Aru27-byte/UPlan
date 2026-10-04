# TechDesign — Research Phases and Review

**Feature:** F21 · `workflow` + `decisions` (boundary upload) + the six phase pages
**Status:** Draft
**Requirements:** [Requirements/research-phases.md](../Requirements/research-phases.md) (R1–R14)
**Builds on:** [decision-overview.md](decision-overview.md) (F18 — `pinInputs`, `getAnalysisStatus`, steps), [study-scoping.md](study-scoping.md) (F14), [evidence-review.md](evidence-review.md) (F19), [decisions.md](decisions.md) (F5), [system-architecture.md](system-architecture.md) (_Concurrency and consistency_)
**Release:** 1

## Approach

A phase's output is not stored. It is a pure function of records that are already immutable: a geometry revision, a finished analysis run, and the append-only resolution notes. `workflow` loads those records once, derives all six outputs, and fingerprints each. What is stored is the planner's response: one append-only `phase_review` row per review, holding the fingerprint it was made on and a copy of the summary that was on screen.

That gives the loop the requirements describe without a state machine to keep in step. "Needs review" is "there is an output whose fingerprint has no review". "Changed since your last review" is "there is an output, and the newest earlier review has a different fingerprint". Nothing is set by a button that a later change could leave wrong.

**Rejected:** storing each drafted output as its own row. It would duplicate the run's results, need its own pinning, and make a second place for numbers to disagree with the run (the same reason F14 shares F7's run).

**Rejected:** letting the planner edit a drafted summary. The summary is derived from measurements; an edited sentence would be a claim with no measurement behind it, in a document that must hold up (P3). A disagreement becomes a revision request and a changed input.

**Rejected:** a language model for the summaries. The charter, `do-not.md`, and the decision of 2026-09-26 rule it out; and templates over measured numbers make every sentence testable.

## Module

```
src/modules/workflow/
  index.ts          public API: getWorkflow, recordReview, finishResearch, cancelResearchChange,
                    listProjectSummaries, PHASES, types
  tables.ts         phase_review
  phases.ts         PHASES, PhaseKey, derivePhaseOutputs(facts) — pure
  drafting.ts       the fixed sentence templates: draftSite … draftImpact — pure
  diff.ts           diffLines(previous, current) — pure
  facts.ts          loadPhaseFacts(db|tx, decision): the reads
  reviews.ts        recordReview, listReviews
  steps.ts          deriveSteps — pure (F18)
  next-actions.ts   deriveNextActions — pure (F18)
  workflow.ts       getWorkflow: facts → outputs → review states → steps, actions
  summaries.ts      listProjectSummaries (F20)
  finish.ts         finishResearch, cancelResearchChange (F22)
  *.test.ts
```

`workflow` imports `decisions`, `analysis`, `profiles`, and `reports` through their `index.ts`. Nothing imports `workflow` except routes and the worker. It owns one table, `phase_review`. (`decision-overview.md` first described it as read-only; owning `phase_review` is the change.)

## Phases and outputs (R1, R2, R4)

```ts
// phases.ts
export const PHASES = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type PhaseKey = (typeof PHASES)[number];

export type PhaseOutput = {
  phase: PhaseKey;
  contentSha256: string;            // R7: the fingerprint a review is bound to
  headline: string;                 // one sentence, from a template
  lines: string[];                  // the drafted sentences, from templates
  inputs: { label: string; value: string }[]; // R1: what this was drafted from
};

export type PhaseFacts = {
  studyArea: { revision: number; areaAcres: number; sourceNote: string } | null;
  footprint: { revision: number; areaAcres: number; sourceNote: string } | null;
  status: AnalysisStatus;           // F18
  run: {                            // present only when status.kind === "current" (R4)
    id: string;
    results: AnalysisResults;
    profileVersionId: string;
    datasetVersionIds: string[];
  } | null;
  rules: InForceRules | null;       // the rules the current run used, for labels and named studies
  resolutions: EvidenceResolution[]; // latest revision per (resource type, pair)
};

export function derivePhaseOutputs(facts: PhaseFacts): Partial<Record<PhaseKey, PhaseOutput>>;
```

A phase is absent from the returned record when R4's condition isn't met, and the reason is derived beside it (`missingReason(phase, facts)`: `"no-study-area"`, `"no-footprint"`, or `"analysis-not-current"`), so the page says what is missing.

**The fingerprint** is `sha256(canonicalJson(payload))`, using the same `canonicalJson` `run.ts` uses for `input_sha256`, so key order can't change it. Each phase hashes only what its output states:

| Phase | Payload |
| --- | --- |
| site | `{ studyAreaRevision }` |
| evidence | `{ evidenceBase: run.results.evidenceBase, datasetVersionIds, resolutions: [{ resourceType, mappedBy, notMappedBy, revision }] }` |
| screening | `{ screening: run.results.screening, gaps: run.results.evidenceBase.gaps }` |
| studies | `{ studyFlags: run.results.studyFlags, namedStudies: [{ study, triggerKey, resourceType }], limits: run.results.limits }` |
| footprint | `{ footprintRevision }` |
| impact | `{ impacts: run.results.impacts, limits: run.results.limits, footprintRevision }` |

The payload holds ids, revisions, and measured numbers, not the sentence text. A template wording fix doesn't invalidate every review, and a measurement change always does. `TEMPLATE_VERSION` in `drafting.ts` is part of every summary a review stores (below), not of the fingerprint.

A run is "current" only if the analysis for the **current inputs** finished (`AnalysisStatus`, F18). The hash of those inputs carries the set of rules in force, not the date they were resolved for, so a project doesn't go out of date at midnight (see _Pinned inputs_ in `decision-overview.md`).

## Drafting (R2, R3, R13)

`drafting.ts` is a set of pure functions, one per phase, each `(facts) => { headline, lines }`. Numbers and dates go through the display formatters in `provenance` (`formatAcres`, `formatSqFt`, `formatFeet`), the one place anything is rounded. The wording is a fixed template. The full set, by phase:

| Phase | Headline | Lines |
| --- | --- | --- |
| site | "Study area drawn: {acres} (revision {n})." | "Source: {sourceNote}." · the sample notice when the note is a sample note (F23) · "The study area is not limited to parcel lines, because habitat does not follow them." |
| evidence | "{k} of {n} resource types have mapped evidence over the study area." | One line per gap ("{label}: no dataset is mapped." or "{label}: the mapped data does not cover the study area.") · one per disagreement ("{label}: {sqft} is mapped by one source and not by another.") followed, when one exists, by "The planner relies on {this source, the other source, neither} (revision {r})." · "{d} dataset versions were used." |
| screening | "{r} of {t} mapped datasets have features inside the study area." | `describeScreeningRow` for each row, in display order · a gap line for each resource type with a gap · the fixed line "Nothing mapped is not the same as nothing present: a screen can't see what no dataset records." |
| studies | "{f} of {s} studies named in the profile are flagged by mapped data." | One line per named study: "{Study}: flagged by {resource labels}; the nearest mapped feature is {ft} away." or "{Study}: not flagged by mapped data. The city decides which studies an application needs." · the same fixed line as Screening |
| footprint | "Footprint traced: {acres} (revision {n})." | "Source: {sourceNote}." · the sample notice · "The footprint is the proposal under evaluation, not evidence." |
| impact | "{n} measured overlaps across {m} resource types." or, with none, "No mapped resource or buffer overlaps the footprint." | One line per impact: "{label}: {measure} {min}[–{max}] {unit}{, approximate boundary}[; depends on {attribute}]" · with none, "This describes the mapped data, not a finding about the site." · one line per recorded limit |

- **R3** is enforced two ways. The templates contain no evaluative words, and a denylist test renders every template over fixtures (including empty ones) and fails if any output matches `safe`, `clear`, `clearance`, `waive`, `acceptable`, `recommend`, `approve`, `deny`, `denied`, `no study needed`, or `not required`. The `PhaseOutput` type has no severity, score, or rank field, so a verdict has nowhere to live.
- **R2, R13:** every page that shows a drafted summary renders the fixed notice "Drafted by UPlan's analysis engine from measurements. No language model wrote this." beside it, and each limit through `describeLimit` in `analysis`, which replaces the two copies of the limit sentences that `impact/page.tsx` and `document.tsx` held.
- Ordering inside every list is the run's own deterministic order (`orderResults`), so the same facts give the same lines.

## Reviews (R5, R6, R7, R8, R12)

```ts
// tables.ts
export const phaseReview = pgTable("phase_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decision.id),
  phase: text("phase").notNull(),
  contentSha256: text("content_sha256").notNull(),
  verdict: text("verdict").notNull(),       // 'reviewed' | 'revision_requested'
  note: text("note"),
  summary: jsonb("summary").notNull(),      // { templateVersion, headline, lines } as it was shown
  reviewedBy: text("reviewed_by").notNull().references(() => appUser.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("phase_review_phase_check", sql`${t.phase} in ('site','evidence','screening','studies','footprint','impact')`),
  check("phase_review_verdict_check", sql`${t.verdict} in ('reviewed','revision_requested')`),
  check("phase_review_note_shape", sql`${t.verdict} <> 'revision_requested' or (${t.note} is not null and length(btrim(${t.note})) > 0)`), // R6
  index("phase_review_by_phase").on(t.decisionId, t.phase, t.reviewedAt),
]);
// Append-only (R8): a trigger raises on UPDATE and DELETE (migration 0003).
```

```ts
// reviews.ts
export async function recordReview(actor: Actor, decisionId: string, input: {
  phase: PhaseKey;
  verdict: "reviewed" | "revision_requested";
  note: string | null;
  expectedContentSha256: string; // R7: the fingerprint of the page the planner read
}): Promise<PhaseReview> {
  return db.transaction(async (tx) => {
    const d = await lockEditableDecision(tx, actor, decisionId); // owner, not deleted, status 'in_progress' (R12)
    const facts = await loadPhaseFacts(tx, d);
    const output = derivePhaseOutputs(facts)[input.phase];
    if (!output) throw new ValidationError(`There is no ${input.phase} output to review yet.`); // R4
    if (output.contentSha256 !== input.expectedContentSha256)
      throw new ConflictError("This output changed while you were reading it. Reload the page and review the new output."); // R7
    const [row] = await tx.insert(phaseReview).values({ decisionId, phase: input.phase, contentSha256: output.contentSha256,
      verdict: input.verdict, note: input.note, summary: { templateVersion: TEMPLATE_VERSION, headline: output.headline, lines: output.lines },
      reviewedBy: actor.userId }).returning();
    return row;
  });
}
```

- **Race safety.** `lockEditableDecision` takes `select … for update` on the decision row. Every input write (`saveGeometry`, `updateDecisionDetails`, `saveResolution`) and `finishResearch` takes the same lock, so a review and an input change serialize: either the review sees the new output and its fingerprint no longer matches, or the change waits for the review. Two reviews of the same output both succeed and are both kept, which is honest: two clicks are two reviews. The client blocks the double submit and sends the fingerprint it rendered.
- **R6:** the note rule is also a `check` constraint, so no code path can store a revision request without one. `note` is trimmed and limited to 2,000 characters by Zod at the Server Function.
- **R12:** a project not `in_progress` is refused by `lockEditableDecision` with a `ConflictError` that says to start a research change (F22).

### Review state (R5, R8, R10)

```ts
export type ReviewState =
  | { kind: "to-do"; reason: "no-study-area" | "no-footprint" }
  | { kind: "updating"; status: AnalysisStatus }        // inputs exist, the analysis isn't current
  | { kind: "needs-review"; changedSince: PhaseReview | null } // changedSince: the newest earlier review, if any
  | { kind: "reviewed"; review: PhaseReview }
  | { kind: "revision-requested"; review: PhaseReview };

export type PhaseView = {
  phase: PhaseKey;
  output: PhaseOutput | null;
  state: ReviewState;
  history: PhaseReview[];                 // R8: newest first
  changes: { added: string[]; removed: string[] } | null; // R10: present when changedSince is
};
```

State is derived: the newest review row for the phase whose `content_sha256` equals the output's fingerprint decides between `reviewed` and `revision-requested`; with none, the phase is `needs-review`, and `changedSince` is the newest review at any fingerprint. `diffLines(previous.summary.lines, output.lines)` returns the sentences added and removed as multisets, in output order. It carries no judgment (R10).

## Pages (R1, R9, R13, R14)

Six Server Components under `src/app/(app)/projects/[projectId]/`. Each calls `getWorkflow(actor, projectId)` (one read) and renders a `PhasePage` with the phase's `PhaseView`:

```
src/ui/phase/
  phase-page.tsx         the four blocks in order (R1)
  inputs-block.tsx       "Drafted from": the inputs, each with a link to where it changes (R9)
  drafted-output.tsx     the headline, the lines, the R2 notice
  review-panel.client.tsx the verdict, the note, the submit; sends the fingerprint (R7)
  review-history.tsx     R8
  changes-block.tsx      R10
```

These take plain props and `import type` from `workflow`. The page-specific detail (the per-resource evidence cards, the screening table, the impact cards, the map editors) stays in each route's own folder and sits between the drafted output and the review. Where a page can't show an output it shows the reason (R4), and, for an out-of-date analysis, the last finished output labeled "Out of date" (never as current).

**The review panel** is a client component with `useActionState` over the `recordReview` Server Function: two radio choices (_Reviewed_, _Request a revision_), a note field that becomes required for the second, and a submit button that disables itself while pending. It sends `expectedContentSha256`. On a `ConflictError` it shows the message and a reload link. It is absent while the phase is read-only (a completed project), replaced by the latest review and a note that starting a research change makes it editable.

**Where inputs change (R9, R11):**

| Phase | Inputs and where they change |
| --- | --- |
| Site | Study area: draw on the map, upload GeoJSON, or load sample data (this page) |
| Evidence | The study area (Site), the datasets, and the resolution notes (F19, on this page) |
| Screening | The study area (Site) and the profile (City profile) |
| Studies | The study area (Site) and the profile (City profile) |
| Footprint | Footprint: draw, upload, or load sample data (this page) |
| Impact | The footprint (Footprint), the study area (Site), and the profile |

## Boundary upload (R11)

```ts
// decisions/upload.ts
export function parseBoundaryUpload(text: string): MultiPolygon; // throws ValidationError
export async function saveGeometryFromUpload(actor, decisionId, kind, file: { name: string; text: string }, expectedRevision): Promise<DecisionGeometry>;
```

`parseBoundaryUpload` parses the JSON, unwraps a `Feature` or a one-feature `FeatureCollection`, and requires a `Polygon` or `MultiPolygon` (a `Polygon` is wrapped as a one-part `MultiPolygon`, which changes no coordinate). A `crs` member is rejected unless it names WGS 84 (`urn:ogc:def:crs:OGC:1.3:CRS84` or `EPSG:4326`). Every coordinate must fall within longitude ±180 and latitude ±90, which catches the common mistake of uploading a projected file with a "GeoJSON" name, with a message that says so. Zod validates the shape. It then calls `saveGeometry`, whose `ST_IsValid` check rejects a bad ring with PostGIS's reason, and never repairs it (F5 R7). The Server Function limits the file to 2 MB and to `.geojson` or `.json`, and stores the file's name in the revision's `source_note` ("Uploaded file: {name}").

## Report-section feedback, accordions, and the rail (R15, R16, R17)

**Which section a step feeds** is a constant in `src/app/_lib/report-sections.ts`, keyed by step, naming the `<h2>` headings in `reports/document.tsx` (Rules and boundaries this document uses; Site and footprint; Evidence base and Source register; Screening register; Studies; Impact and What desk analysis can't see) with a one-sentence description. It is the one place the step-to-heading mapping lives.

```ts
// tables.ts
export const reportSectionFeedback = pgTable("report_section_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decision.id),
  step: text("step").notNull(),             // 'overview' | the six phases
  note: text("note").notNull(),             // trimmed, 1 to 2,000 characters
  createdBy: text("created_by").notNull().references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("report_section_feedback_step_check", sql`${t.step} in ('overview','site','evidence','screening','studies','footprint','impact')`),
  check("report_section_feedback_note_shape", sql`length(btrim(${t.note})) between 1 and 2000`),
  index("report_section_feedback_by_step").on(t.decisionId, t.step, t.createdAt),
]);
// Append-only: a trigger raises on UPDATE and DELETE (migration 0007).
```

`feedback.ts` exports `recordSectionFeedback(actor, decisionId, { step, note })`, which takes `lockEditableDecision` (R12) and inserts one row, and `listSectionFeedback(actor, decisionId, step)`, newest first. Nothing reads the notes back into a drafted output, so feedback can't change a figure or a sentence (R2).

**The block** is `src/ui/phase/report-section-panel.client.tsx`: on the left a card tinted with the step's group color naming the section and what it contains, on the right an `ActionForm` with a labelled textarea and `SubmitButton`; the earlier notes sit in a `<details>` below. It stacks on a phone. `PhasePage` and the Overview render it first.

**Accordions** are `src/ui/accordion.tsx`: a native `<details>` with a styled `<summary>` (title, one-line summary, status, a chevron), closed by default, so it needs no script and works by keyboard. `PhasePage` wraps the inputs, the drafted output, the page's detail, and the history in it. The editors (`BoundaryPanel`) and the `MapWorkspace` panel stay `Panel`s (R16 exceptions).

**The rail** keeps `StageRail`'s props and adds each group's color from `src/ui/phase/group-tones.ts`, shared with the report-section block so a group has one color everywhere. Groups are outlined segments of numbered stages joined by arrows (a right arrow on wide screens, down on phones).

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | Six phase routes and `PhasePage` | Fixed block order |
| R2 | `derivePhaseOutputs`, `drafting.ts`, the fixed notice | Deterministic; no model call exists |
| R3 | Templates, `PhaseOutput`'s shape, the denylist test | No verdict field |
| R4 | `missingReason`, the `current` gate | Out-of-date output is labeled, never current |
| R5 | `ReviewState`, derived from fingerprints | No stored flag |
| R6 | `recordReview`, `phase_review_note_shape` | Database check as well as Zod |
| R7 | `expectedContentSha256`, the decision lock | `ConflictError` on mismatch |
| R8 | Append-only table and trigger, `history` | Newest first |
| R9 | The inputs table and `InputsBlock` | Links to the editors |
| R10 | `diffLines`, `ChangesBlock` | Multiset of sentences |
| R11 | `parseBoundaryUpload`, `saveGeometryFromUpload`, F23's loader | Checked, never repaired |
| R12 | `lockEditableDecision` | Also disables the panel |
| R13 | `describeLimit`, the provenance formatter | One copy of each limit sentence |
| R14 | Responsive `PhasePage`; editors stay browser-only | Phone: read and review |
| R15 | `report-sections.ts`, `report_section_feedback`, `recordSectionFeedback`, `ReportSectionPanel` | A note, never an edit |
| R16 | `Accordion`; map and editors stay `Panel`s | Native `<details>`, closed |
| R17 | `StageRail`, `group-tones.ts` | Words and shapes as well as color |

## Risks and tradeoffs

- **A fingerprint that is too sensitive** would ask for review after a change that doesn't matter. Hashing measurements and ids, not sentences, keeps a wording fix from doing that. The Studies payload includes the named studies from the rules in force, so a profile change that adds a trigger asks for a new review, which is correct.
- **A fingerprint that is too loose** would carry a review onto changed data. Every measured number the summary states is in its payload, and a test asserts that changing each one changes the hash.
- **Reviews stored as a copy of the summary** cost a few kilobytes each and make the history readable after the templates change. That is the reason for the copy.
- **A planner reviewing their own work** is not independent. That is why the wording is _Reviewed_, and why sign-off (F12) stays a separate, later feature.

## Verification

- Vitest unit tests: `derivePhaseOutputs` over a table of `PhaseFacts` (each phase present and absent per R4); fingerprint stability (same facts, same hash; each measured number changes it; reordering keys doesn't); the R3 denylist over every template with populated, empty, and gap-only fixtures; `diffLines` (added, removed, unchanged, duplicates); `parseBoundaryUpload` accepts a Polygon, a MultiPolygon, a Feature, and a one-feature collection, and rejects two features, a Point, a projected-coordinate file, a `crs` other than WGS 84, and non-JSON (R11).
- Testcontainers integration tests: `recordReview` stores the fingerprint and summary; a revision request without a note fails at Zod and, bypassing Zod, at the `check` (R6); a review with a stale fingerprint fails with `ConflictError` (R7); a review on a completed project fails with `ConflictError` (R12); updating and deleting a `phase_review` row fails (R8); the state moves _needs review → reviewed → needs review (changed)_ across a study-area change with a new run (R5, R10); **a race test** fires `recordReview` and `saveGeometry` at once on separate connections and asserts the review either matches the output it saw or fails with `ConflictError`, never a review of an output that is gone (R7).
- Testcontainers: `recordSectionFeedback` stores a note and `listSectionFeedback` returns it newest first; an empty note, a 2,001-character note, and an unknown step fail; updating and deleting a row fails; a completed project fails with `ConflictError` (R15).
- Playwright: draw or load a sample site, watch the analysis finish, review each phase, request a revision with a note, change the input, and see the phase ask again with the changes listed; axe at desktop and phone widths (R1–R10, R14).

## Open questions

- None.
