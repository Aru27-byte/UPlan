# TechDesign — Research Phases and Report Sections

**Feature:** F21 · `workflow` (phases, sections, chat) + `decisions` (boundary upload) + the six phase pages
**Status:** Draft — revised 2026-10-22: reviews and section feedback replaced by versioned report sections and a section chat
**Implementation:** Built in release 1; current as of 2026-10-24.
**Requirements:** [Requirements/research-phases.md](../Requirements/research-phases.md) (R1–R19)
**Builds on:** [decision-overview.md](decision-overview.md) (F18 — `pinInputs`, `getAnalysisStatus`, steps), [study-scoping.md](study-scoping.md) (F14), [evidence-review.md](evidence-review.md) (F19), [decisions.md](decisions.md) (F5), [locked-report.md](locked-report.md) (F10), [ai-assist.md](ai-assist.md) (F24), [system-architecture.md](system-architecture.md) (_Concurrency and consistency_)
**Release:** 1

## Approach

Two layers, and only one of them is stored.

- The **analysis draft** is not stored. It is a pure function of records that are already immutable — a geometry revision, a finished analysis run, and the append-only resolution notes — and it is fingerprinted (`PhaseOutput.contentSha256`). This is the existing `derivePhaseOutputs`, unchanged.
- The **section version** is stored. It holds the narrative the planner adopted: the headline, the sentences, and any table formatting. It records the engine fingerprint it was built on, its own content hash, who made it, when, and the instruction that produced it. It is append-only.

A phase's current section is the newest stored version, or the analysis draft when none exists. The state is derived from the comparison of the newest version's `output_sha256` with the current output's fingerprint: equal is **Ready**, different is **Out of date**, absent is **To do** or **Updating**. Nothing is set by a button that a later change could leave wrong.

**Rejected:** storing the analysis draft itself as a version on every analysis. It would duplicate the run's results, need its own pinning, and make a second place for numbers to disagree with the run. The draft stays a pure function; only the planner's adopted narrative is stored.

**Rejected:** a review verdict, a review note, or a "needs review" flag. The planner's acts are reading, changing, and reverting; each change is a version, and the version is the record (R5). A planner who wants to keep the draft unchanged keeps it by not changing it.

**Rejected:** letting a planner or a model edit the section's figures, maps, table values, quoted source text, lists, or notices. Those are locked (R2). The editable surface is the headline, the narrative lines, and a table's caption and column order; the model's output shape has no field for anything else.

**Changed 2026-10-22:** the phase's AI surface is the section chat, beside the section (F24 R19). The old assist spotlight, the review panel, and the feedback box are gone.

## Module

```
src/modules/workflow/
  index.ts          public API: getWorkflow, getSection, commitSectionChange, revertSection,
                    updateSectionToCurrent, finishResearch, cancelResearchChange, listProjectSummaries,
                    PHASES, types
  tables.ts         report_section_version
  phases.ts         PHASES, PhaseKey, derivePhaseOutputs(facts) — pure
  sections.ts       SectionContent, SectionState, buildSectionViews, commitSectionChange, revertSection,
                    updateSectionToCurrent, sectionDiff
  drafting.ts       the fixed sentence templates: draftSite … draftImpact — pure
  diff.ts           diffLines(previous, current) — pure
  facts.ts          loadPhaseFacts(db|tx, decision): the reads
  steps.ts          deriveSteps — pure (F18)
  next-actions.ts   deriveNextActions — pure (F18)
  workflow.ts       getWorkflow: facts → outputs → sections → steps, actions
  summaries.ts      listProjectSummaries (F20)
  finish.ts         finishResearch, cancelResearchChange (F22)
  readiness.ts      getFinishReadiness (F10)
  *.test.ts
```

`workflow` imports `decisions`, `analysis`, `profiles`, `assist`, and `reports` through their `index.ts`. Nothing imports `workflow` except routes and the worker. It owns one table, `report_section_version`. `reviews.ts`, `feedback.ts`, and the `phase_review` and `report_section_feedback` tables are deleted (migration 0010).

## Phases and analysis drafts (R2, R4)

```ts
// phases.ts
export const PHASES = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type PhaseKey = (typeof PHASES)[number];

export type PhaseOutput = {
  phase: PhaseKey;
  contentSha256: string;            // R7: the engine fingerprint a section version is bound to
  headline: string;
  lines: string[];
  inputs: { label: string; value: string }[];
};

export type PhaseFacts = {
  studyArea: GeometrySummary | null;
  footprint: GeometrySummary | null;
  status: AnalysisStatus;           // F18
  run: {                            // present only when status.kind === "current" (R4)
    id: string;
    results: AnalysisResults;
    profileVersionId: string;
    profileVersionNumber: number;
    datasetVersionIds: string[];
  } | null;
  rules: InForceRules | null;
  resolvedFor: Record<string, string> | null;
  datasetTitles: Map<string, string>;
  datasetLimitations: Map<string, string>;
  resolutions: EvidenceResolution[];
};

export function derivePhaseOutputs(facts: PhaseFacts): Partial<Record<PhaseKey, PhaseOutput>>;
```

A phase is absent from the returned record when R4's condition isn't met, and the reason is derived beside it (`missingReason(phase, facts)`: `"no-study-area"`, `"no-footprint"`, or `"analysis-not-current"`), so the page says what is missing.

The fingerprint is `sha256(canonicalJson(payload))`, using the same `canonicalJson` `run.ts` uses for `input_sha256`, so key order can't change it. Each phase hashes only what its output states:

| Phase | Payload |
| --- | --- |
| site | `{ studyAreaRevision }` |
| evidence | `{ evidenceBase: run.results.evidenceBase, datasetVersionIds, resolutions: [{ resourceType, mappedBy, notMappedBy, revision }] }` |
| screening | `{ screening: run.results.screening, gaps: run.results.evidenceBase.gaps }` |
| studies | `{ studyFlags: run.results.studyFlags, namedStudies: [{ study, triggerKey, resourceType }], limits: run.results.limits }` |
| footprint | `{ footprintRevision }` |
| impact | `{ impacts: run.results.impacts, limits: run.results.limits, footprintRevision }` |

The payload holds ids, revisions, and measured numbers, not the sentence text. A template wording fix doesn't invalidate every section version, and a measurement change always does. `TEMPLATE_VERSION` in `drafting.ts` is part of the snapshot, not of the fingerprint.

`draftContent(output)` is the bridge to a section: `{ headline: output.headline, lines: output.lines, tables: [] }`. The tables a phase prints are rendered from the run by `reports/sections.tsx`; their values are never part of a stored version.

A run is "current" only if the analysis for the **current inputs** finished (`AnalysisStatus`, F18). The hash of those inputs carries the set of rules in force, not the date they were resolved for, so a project doesn't go out of date at midnight (see _Pinned inputs_ in `decision-overview.md`).

## Drafting (R2, R3)

`drafting.ts` is unchanged: pure functions, one per phase, each `(facts) => { headline, lines }`, over fixed templates, with every number through the provenance formatters. The full set, by phase, stays as designed:

| Phase | Headline | Lines |
| --- | --- | --- |
| site | "Study area drawn: {acres} (revision {n})." | "Source: {sourceNote}." · the sample notice when the note is a sample note (F23) · "The study area is not limited to parcel lines, because habitat does not follow them." |
| evidence | "{k} of {n} resource types have mapped evidence over the study area." | One line per gap · one per disagreement, followed, when one exists, by the planner's reliance · "{d} dataset versions were used." |
| screening | "{r} of {t} mapped datasets have features inside the study area." | `describeScreeningRow` for each row · a gap line for each resource type with a gap · the fixed line "Nothing mapped is not the same as nothing present: a screen can't see what no dataset records." |
| studies | "{f} of {s} studies named in the profile are flagged by mapped data." | One line per named study · the same fixed line as Screening |
| footprint | "Footprint traced: {acres} (revision {n})." | "Source: {sourceNote}." · the sample notice · "The footprint is the proposal under evaluation, not evidence." |
| impact | "{n} measured overlaps across {m} resource types." or, with none, "No mapped resource or buffer overlaps the footprint." | One line per impact · with none, "This describes the mapped data, not a finding about the site." · one line per recorded limit |

- **R3** is enforced two ways. The templates contain no evaluative words, and a denylist test renders every template over fixtures (including empty ones) and fails if any output matches `safe`, `clear`, `clearance`, `waive`, `acceptable`, `recommend`, `approve`, `deny`, `denied`, `no study needed`, or `not required`. The `PhaseOutput` type has no severity, score, or rank field, so a verdict has nowhere to live. The same denylist runs over every section version before it is stored.
- Every page that shows the section renders the fixed note that its maps, tables, figures, and quoted source text come from the analysis and cannot be changed, and that its summary and narrative can (R16). It does not label the section as AI-assisted.
- Ordering inside every list is the run's own deterministic order (`orderResults`), so the same facts give the same lines.

## Section versions (R5, R7, R8, R10)

```ts
// sections.ts
export type SectionTableFormat = { key: string; caption: string | null; columnOrder: string[] };
export type SectionContent = { headline: string; lines: string[]; tables: SectionTableFormat[] };

export type SectionVersion = {
  id: string;
  phase: PhaseKey;
  versionNumber: number;             // per (decision, phase), 1, 2, 3 … with no gaps
  source: "analysis" | "ai" | "revert";
  content: SectionContent;
  contentSha256: string;             // sha256(canonicalJson(content))
  outputSha256: string;              // the engine fingerprint it was built on
  instruction: string | null;        // the planner's chat message, when source === "ai"
  sourceVersionNumber: number | null; // for a revert
  createdByName: string;
  createdAt: Date;
};

export type SectionState =
  | { kind: "to-do"; reason: "no-study-area" | "no-footprint"; version: SectionVersion | null }
  | { kind: "updating"; status: AnalysisStatus; version: SectionVersion | null }
  | { kind: "ready"; content: SectionContent; version: SectionVersion | null }
  | { kind: "out-of-date"; version: SectionVersion; reason: "no-study-area" | "no-footprint" | "analysis-not-current" };

export type PhaseView = {
  phase: PhaseKey;
  output: PhaseOutput | null;
  state: SectionState;
  versions: SectionVersion[];        // newest first
  changes: LineDiff | null;          // R10: the current content against the one before it
};

export function buildSectionViews(facts: PhaseFacts, versions: SectionVersion[]): PhaseView[];
```

```ts
// tables.ts
export const reportSectionVersion = pgTable("report_section_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull().references(() => decision.id),
  phase: text("phase").notNull(),
  versionNumber: integer("version_number").notNull(),
  source: text("source").notNull(),           // 'analysis' | 'ai' | 'revert'
  content: jsonb("content").notNull(),        // SectionContent
  contentSha256: text("content_sha256").notNull(),
  outputSha256: text("output_sha256").notNull(),
  instruction: text("instruction"),
  suggestionId: uuid("suggestion_id").references(() => aiSuggestion.id),
  sourceVersionId: uuid("source_version_id").references(() => reportSectionVersion.id),
  createdBy: text("created_by").notNull().references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("report_section_version_phase_check", sql`${t.phase} in ('site','evidence','screening','studies','footprint','impact')`),
  check("report_section_version_source_check", sql`${t.source} in ('analysis','ai','revert')`),
  check("report_section_version_instruction_shape", sql`${t.source} <> 'ai' or (${t.instruction} is not null and length(btrim(${t.instruction})) between 1 and 2000)`),
  uniqueIndex("report_section_version_number").on(t.decisionId, t.phase, t.versionNumber),
  index("report_section_version_by_phase").on(t.decisionId, t.phase, t.createdAt),
]);
// Append-only: a trigger raises on UPDATE and DELETE (migration 0010).
```

**State rule.** The newest version is the one with the greatest `version_number`.

| Output | Newest version | State | Shown |
| --- | --- | --- | --- |
| present | none | Ready | the analysis draft |
| present | `outputSha256` equals the output's | Ready | the version |
| present | `outputSha256` differs | Out of date | the version, labeled, with the reason |
| absent, missing input | any or none | To do | the version labeled Out of date, when there is one |
| absent, analysis not current | any or none | Updating | the version labeled Out of date, when there is one |

An out-of-date version is never shown as current (R4). The page also shows the analysis draft when there is one, behind **Update to current analysis**, and never silently.

**R10.** `sectionDiff(a, b)` is `diffLines([a.headline, ...a.lines], [b.headline, ...b.lines])`; it returns the sentences added and removed, as a multiset, in the new content's order. Table captions are included in the diff. It carries no judgment. `PhaseView.changes` is the diff of the previous version against the current one, or of the current analysis draft against the newest version when they differ; null when there is nothing to compare.

### Writing a version (R7, R8, R9)

All three writers take `lockEditableDecision` (owner, not deleted, `status = 'in_progress'`; otherwise `ConflictError` with F22's message — R13), load the facts and the newest version under the lock, compare the two hashes the page carried, and insert one row with `version_number = max + 1`. The partial unique index on `(decision_id, phase, version_number)` is the last guard.

```ts
export async function commitSectionChange(actor: Actor, decisionId: string, input: {
  phase: PhaseKey;
  content: SectionContent;
  instruction: string;
  expectedContentSha256: string;   // the section the planner was reading
  expectedOutputSha256: string;    // the engine output it was built on
  suggestionId: string;
}): Promise<SectionVersion>;
```

- The output must exist; a missing or changed output is a `ConflictError` naming the reason (R7).
- `contentSha256` must equal `expectedContentSha256`. The newest version's content hash is what the page showed; when there is no version, the analysis draft's hash is.
- The content is validated again at the commit: `headline` and `lines` are strings within the size caps; every `tables[].key` and `columnOrder` is a permutation of the canonical table's columns (no column may be dropped, because provenance columns are locked); the denylist runs over the text. The model's checks already did this, and this second pass means no code path can store a bad version.
- `source = 'ai'`, `outputSha256` is the current output's fingerprint, `suggestionId` and `instruction` are recorded.

```ts
export async function revertSection(actor: Actor, decisionId: string, input: {
  phase: PhaseKey; versionId: string;
  expectedContentSha256: string; expectedOutputSha256: string;
}): Promise<SectionVersion>;
```

- The target must belong to this project and phase. The new version copies its `content` and its `outputSha256` — the target's, not the current one — so a revert onto earlier figures leaves the section **Out of date** and blocks publishing until **Update to current analysis** (R9).
- `source = 'revert'`, `sourceVersionId` is the target, `instruction` is null. The version it replaced and every other version stay (R8).

```ts
export async function updateSectionToCurrent(actor: Actor, decisionId: string, input: {
  phase: PhaseKey; expectedContentSha256: string; expectedOutputSha256: string;
}): Promise<SectionVersion>;
```

- Requires a current output. Stores `draftContent(output)` with the current fingerprint, `source = 'analysis'`. This is the only path that turns an out-of-date section into a ready one without a chat change (R9).

**The warning before a revert** is the client's `ConfirmDialog`: "Revert to version {n}? This replaces the current wording with version {n}'s. Version {n} stays in the history." When the target's output is not current, it adds: "Version {n} was built on an earlier analysis. The report cannot be generated until you update this section to the current analysis." The cancel choice is focused first. The dialog is a confirmation, not a lock; the hashes and the transaction above are the authority.

## The section chat (R6, R7, R13; F24)

The chat is two Server Actions and no client-side model call.

- **Explain** (`explainSection`): builds a `section-explain` request from the section's content and the phase's measured facts, runs one model call through `assist`, stores an `ai_suggestion`, and returns it. It changes nothing. A prompt filler may select one of the phase's stronger kinds (Explain, Questions, Find, Compare); the filler sets the text and the hidden `assistId`, and the action runs that kind's builder.
- **Change** (`changeSection`): builds a `section-edit` request (the same input plus the planner's instruction), runs the model, validates `{ headline, lines, tables? }`, and then, in the transaction that finalizes the suggestion, calls `commitSectionChange`. If either hash moved, the transaction rolls back, the suggestion is marked `failed` with the conflict's message, and the chat shows it; no version is stored.

The page carries `expectedContentSha256` and `expectedOutputSha256`. The model never sees or returns a figure that is not in the request (`assist`'s K3), and the table formats are checked against the canonical columns (K9). The denylist applies before a version is stored (F24 R6).

**What is sent** extends F24's allow-list with two classes, both stored in the suggestion's `request`:

| Class | Examples | Sent? |
| --- | --- | --- |
| C5 Section text | The section's headline, narrative lines, table captions, and fixed notices; maps reduced to title and description; no coordinates | Yes |
| C6 Instruction | The planner's chat message, checked against the project's recorded identity and email addresses before sending | Yes |

**Prompt fillers.** `PHASE_PROMPTS` in `src/app/_lib/assist-view.ts` holds the phase assists from F24's table, strongest first, each with its text and kind. A filler fills the textarea and sets `assistId`; it never submits. Explain with no filler runs `section-explain`; Change always runs `section-edit`, because a change is the planner's instruction.

**Read-only.** Every action takes `lockEditableDecision`, so a completed or generating project refuses with F22's message (R13). The chat is hidden when the project is not in progress, and the section stays readable.

## Pages (R1, R16, R17, R19)

Six Server Components under `src/app/(app)/projects/[projectId]/`. Each calls `getWorkflow(actor, projectId)` (one read) and renders a `PhasePage` with the phase's `PhaseView`:

```
src/ui/phase/
  phase-page.tsx                  the section panel, then the accordions (R1, R17)
  report-section-panel.client.tsx the section and the chat, side by side or stacked (R16)
  section-chat.client.tsx         mode toggle, fillers, textarea, messages (R6)
  section-history.tsx             versions, diffs, Revert, Update to current (R8–R10)
  inputs-block.tsx                "Drafted from": the inputs, each with a link to where it changes (R11)
  accordion.tsx                   native <details>, closed by default (R17)
```

`PhasePage`'s order is the section panel, the inputs accordion, then the page's own data accordions. The separate `drafted-output.tsx` block is deleted; the section is the output. The page-specific detail (the per-resource evidence cards, the screening table, the impact cards, the map editors) stays in each route's own folder and sits in the accordions after the inputs.

**The panel** is `src/ui/phase/report-section-panel.client.tsx`. On the left, in the step's group color, the section as it will print: the route's `StepIntro` (a Server Component) loads `loadLiveReportContent` once with the run and geometry revisions the page already pinned, and `SectionPreview` renders the matching section from `reports/sections.tsx` inside a labelled, keyboard-scrollable `report-paper` region (the document's own stylesheet, `REPORT_CONTENT_STYLES`, scoped to that class). It is passed to the client panel as `children`, so the panel holds no module code. On the right, `SectionChat` with the two modes, the phase's fillers, a labelled textarea, and the messages. The two halves sit side by side at 48rem of the block's own width (a container query), stacked below. A short note beside the section says the maps, tables, figures, and quoted text are locked and the narrative can change through the chat (R16). The Overview renders its section read-only, with no chat and no history.

**The history** is a `<details>` inside the section panel: every version, newest first, with its number, source, who, when, the instruction, and "What changed" against the previous version. The current version has no Revert. **Revert** opens the warning dialog (R9); **Update to current analysis** appears when the state is Out of date.

**Accordions** are `src/ui/accordion.tsx`: a native `<details>` with a styled `<summary>` (title, one-line summary, status, a chevron), closed by default. The editors (`BoundaryPanel`) and the `MapWorkspace` panel stay `Panel`s (R17 exceptions). The chat and the section are controls, not data, and stay open.

**The Overview's "Project at a glance"** (R19) is a `Panel` in `overview/page.tsx`, read from `getWorkflow()`: the decision's recorded details, and every phase whose section state is not Ready, with its state and a link. When every phase is Ready it says so. It sits directly after the read-only section and is not an accordion.

**The rail** keeps `StageRail`'s props and takes each group's color from `src/ui/phase/group-tones.ts`, shared with the section panel. It is a CSS container (`@container`), not a viewport breakpoint. Below 56rem (`@4xl`) it is one column; from 56rem the four groups are columns left to right, each a stack of numbered stages. Each stage shows its state as words and a shape, never color alone: To do, Updating, Ready, Out of date (R18).

**Where inputs change (R11):**

| Phase | Inputs and where they change |
| --- | --- |
| Site | Study area: draw on the map, upload GeoJSON, or load sample data (this page) |
| Evidence | The study area (Site), the datasets, and the resolution notes (F19, on this page) |
| Screening | The study area (Site) and the profile (City profile) |
| Studies | The study area (Site) and the profile (City profile) |
| Footprint | Footprint: draw, upload, or load sample data (this page) |
| Impact | The footprint (Footprint), the study area (Site), and the profile |

## Boundary upload (R12)

```ts
// decisions/upload.ts
export function parseBoundaryUpload(text: string): MultiPolygon; // throws ValidationError
export async function saveGeometryFromUpload(actor, decisionId, kind, file: { name: string; text: string }, expectedRevision): Promise<DecisionGeometry>;
```

`parseBoundaryUpload` parses the JSON, unwraps a `Feature` or a one-feature `FeatureCollection`, and requires a `Polygon` or `MultiPolygon` (a `Polygon` is wrapped as a one-part `MultiPolygon`, which changes no coordinate). A `crs` member is rejected unless it names WGS 84 (`urn:ogc:def:crs:OGC:1.3:CRS84` or `EPSG:4326`). Every coordinate must fall within longitude ±180 and latitude ±90, which catches the common mistake of uploading a projected file with a "GeoJSON" name, with a message that says so. Zod validates the shape. It then calls `saveGeometry`, whose `ST_IsValid` check rejects a bad ring with PostGIS's reason, and never repairs it (F5 R7). The Server Function limits the file to 2 MB and to `.geojson` or `.json`, and stores the file's name in the revision's `source_note` ("Uploaded file: {name}").

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | Six phase routes and `PhasePage` | Section panel first, then inputs, then data |
| R2 | `derivePhaseOutputs`, `drafting.ts`, the locked-surface rule | Deterministic; no model writes the draft |
| R3 | Templates, `PhaseOutput`'s shape, the denylist test | No verdict field |
| R4 | `missingReason`, the `current` gate, the out-of-date label | Never an earlier section as current |
| R5 | `SectionState`, derived from the newest version and the fingerprint | No stored flag |
| R6 | `SectionChat`, `assist`'s `section-explain` and `section-edit` | Two modes; nothing automatic |
| R7 | `expectedContentSha256`, `expectedOutputSha256`, the decision lock | `ConflictError` on mismatch |
| R8 | Append-only table and trigger, `versions` newest first | Revert records its source |
| R9 | `ConfirmDialog`, `revertSection`, `updateSectionToCurrent` | Warning; stale figures flagged |
| R10 | `sectionDiff`, `section-history.tsx` | Sentences added and removed |
| R11 | The inputs table and `InputsBlock`; no silent rebase | Links to the editors |
| R12 | `parseBoundaryUpload`, `saveGeometryFromUpload`, F23's loader | Checked, never repaired |
| R13 | `lockEditableDecision` | Chat and actions hidden when read-only |
| R14 | `describeLimit`, the provenance formatter | One copy of each limit sentence |
| R15 | Responsive `PhasePage`; editors stay browser-only | Phone: read and explain |
| R16 | `reports/sections.tsx`, `live.ts`, `SectionPreview`, `ReportSectionPanel` | The real section; not AI-labeled |
| R17 | `Accordion`; map and editors stay `Panel`s | Native `<details>`, closed |
| R18 | `StageRail`, `group-tones.ts` | Four section states, words and shapes |
| R19 | `overview/page.tsx`, the read-only Overview section | Facts only; links to each phase |

## Risks and tradeoffs

- **A content hash on the whole section** catches any change to the text, and the engine fingerprint catches any change to the measurements. The two together are what a change is bound to, so a stale tab cannot overwrite a newer section.
- **A revert to earlier figures** is allowed but flagged, and publishing is blocked until the section is updated (R9). That is the honest choice: the planner can restore wording without UPlan pretending the figures match.
- **Stored narrative versions** cost a few kilobytes each and make the history readable after the templates change.
- **A model rewrite is bounded by the shape and checks.** The worst case is a rejected change, not a wrong number: the model cannot change a table value, and a figure it writes must appear in the section it was given.
- **An out-of-date section blocks publishing.** That is the requirement: the document is built from current analysis, so a section built on an earlier run cannot enter it. The remedy is one click (**Update to current analysis**) or a chat change.

## Verification

- Vitest unit tests: `derivePhaseOutputs` over a table of `PhaseFacts` (each phase present and absent per R4); fingerprint stability (same facts, same hash; each measured number changes it; reordering keys doesn't); the R3 denylist over every template with populated, empty, and gap-only fixtures; `buildSectionViews` over the state table (no version, matching version, stale version, absent output); `contentSha256` stability; `sectionDiff` (added, removed, unchanged, duplicates); table-format validation (a dropped provenance column fails, a reorder passes); `parseBoundaryUpload` accepts a Polygon, a MultiPolygon, a Feature, and a one-feature collection, and rejects two features, a Point, a projected-coordinate file, a `crs` other than WGS 84, and non-JSON (R12).
- Testcontainers integration tests: `commitSectionChange` stores version 1 and then 2 with the instruction and the fingerprint (R8); a stale content hash or a stale output fingerprint fails with `ConflictError` (R7); `revertSection` creates a new version with the target's content and output, leaves the target, and leaves the section out of date when the target is stale (R8, R9); `updateSectionToCurrent` creates a version from the draft and makes the section Ready (R9); updating or deleting a `report_section_version` row fails (R8); a completed or generating project fails with `ConflictError` (R13); **a race test** fires `commitSectionChange` and `saveGeometry` at once on separate connections and asserts the commit either matches the output it saw or fails with `ConflictError` (R7).
- Assist integration: a `section-edit` whose output invents a number, carries a verdict, or drops a table column is rejected and no version is stored; a ready change stores the suggestion and the version in one transaction; a stale hash rolls the transaction back and marks the suggestion failed.
- Playwright: read a section, ask an Explain question, send a Change and see version 2, open the history, revert to version 1 through the warning, change an input, see the section Out of date, and use Update to current analysis; axe at desktop and phone widths (R1–R10, R15).

## Open questions

- None.
