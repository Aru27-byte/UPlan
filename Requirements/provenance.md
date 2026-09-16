# Requirements — Provenance

**Feature:** F4 · `provenance`
**Status:** Draft
**Serves:** every intent (I1–I6, I8, I9) · **Release:** 1
**Derived from:** [charter.md](charter.md) (P1), [features.md](features.md) (F4), [intents.md](intents.md)
**Related design doc:** [TechDesign/provenance.md](../TechDesign/provenance.md)

## Why

P1 makes provenance the substrate: every figure UPlan shows must carry its source, its date, and its confidence, because "when was this surveyed?" is the first question any finding faces (charter, _Principles_). Provenance is not a feature planners open on its own — it is what every other release-1 feature attaches to every number, rule, and flag it shows. This doc defines what a unit of provenance must contain and guarantee, so `evidence` (F3), `profiles` (F1), `analysis` (F7, F9), `reports` (F10), and the map workspace (F6) can all build on one shape and one formatter instead of inventing their own.

## Scope

In scope: the provenance a **measured figure** (an evidence feature, and anything derived from it) and a **legal figure** (a rule) each carry; how they combine when a result is derived from both; and the one formatter that renders provenance for the screen, the map, the report, and exports. Out of scope: the datasets and rules themselves (F3, F1), and where provenance is displayed on any particular page (F6, F9, F10 each cite this doc for how, not whether).

## Requirements

**R1. Every evidence-derived figure carries a publisher, a license, a source URL, a source date (or an explicit note that the publisher gives none), a retrieval date, and a confidence level.** These six fields are mandatory on every `Provenance` value the `provenance` module accepts; a caller cannot construct one with a field missing (Zod-validated).

**R2. The source date and the retrieval date are never conflated.** A figure's provenance must expose the publisher's own date (`sourceAsOf`) separately from the date UPlan fetched it (`retrievedAt`). When a source states no date, `sourceAsOfNote` explains that in words a planner can read; the formatter never substitutes `retrievedAt` for a missing `sourceAsOf`.

**R3. Every rule-derived figure carries its code section, its ordinance (or an explicit statement that the code section is the only reference), its source URL, and the date it took effect.** This applies whether the rule is currently in force or was in force on a vesting date in the past — the effective date shown is the one the figure actually used (see `rulesInForce` in `system-architecture.md`).

**R4. A figure derived from more than one source states every source it came from, not a summary.** An impact measurement that combines a rule and one or more evidence features lists the rule's citation and every evidence feature's dataset provenance; it never collapses them into a single blended citation.

**R5. Confidence on a derived figure is never invented.** A figure derived from evidence carries the confidence of the evidence it used; when evidence at more than one confidence level contributed, the figure shows the lowest of them and identifies which input carries it. A figure derived only from rules (no evidence) carries no confidence level — confidence describes measured data, not legal text — and the formatter renders that as an explicit "not applicable," never as blank space that could read as an omission.

**R6. One formatter renders every provenance value everywhere it appears.** The map workspace, the evidence and impact tables, the report, and every export call the same function to render a provenance value. No other code in the repository formats a date, a citation, or a confidence level for display (P1; enforced by `.claude/rules/conventions.md`'s "round only in the display formatter").

**R7. A confidence level is stated in terms a commissioner can read, not a score.** `high`, `moderate`, and `low` each render with a plain-language description of what that level means for the figure it's attached to (charter, F4: "Confidence is stated in terms a commissioner can read").

**R8. Provenance renders identically on screen and in print.** The same formatter output (source, date, confidence, and citations) that appears in the map workspace and evidence tables appears in the locked report, so the printed figure a commissioner reads matches what the planner saw on screen (P1, P3).

**R9. A figure with no provenance cannot be displayed.** Any code path that would render a number, a flag, or a rule reference without a complete `Provenance` or rule-citation value fails a type check or a runtime validation — there is no "provenance optional" state for anything UPlan shows (P1; `.claude/rules/do-not.md`: "Don't display a figure without its provenance").

## Out of scope for this feature

- Which figures exist and what they measure (F3, F7, F9).
- Where on a page provenance is shown, and how much detail is inline versus one step away (F6, F9, F10 each design their own layout against R1–R9).
- Confidence _methodology_ — how a dataset earns `high`/`moderate`/`low` — which is set per dataset in F3, not decided here.

## Open items

None carried from round 10. This feature has no dependency on the round 10 questions (vesting, approval, cities, F2 timing); it defines a shape those features fill in.
