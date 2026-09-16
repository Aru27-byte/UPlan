# Requirements — Evidence Base

**Feature:** F7 · `analysis`
**Status:** Draft
**Serves:** I2 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Jobs: evidence assembly_), [features.md](features.md) (F7), [intents.md](intents.md) (I2)
**Related design doc:** [TechDesign/evidence-base.md](../TechDesign/evidence-base.md)
**Builds on:** [evidence-layers.md](evidence-layers.md) (F3), [jurisdiction-profile.md](jurisdiction-profile.md) (F1), [provenance.md](provenance.md) (F4)

## Why

I2 is "stop rebuilding the evidence by hand for every decision." This feature is the reconciliation step: for one decision's study area, gather what every mapped, current dataset says about every profile dimension, and be explicit — not smoothed over — about where sources disagree or data is simply missing.

## Requirements

**R1. The evidence base covers every resource type in the jurisdiction's current (or resolved-for-date) profile,** not just the ones a planner happens to look at.

**R2. Every evidence item carries its full provenance,** via F4's formatter — the evidence base is exactly the kind of figure R1–R9 of `provenance.md` govern.

**R3. When two mapped datasets disagree about whether a resource is present in an area, both are shown as a disagreement — neither is picked as the "right" one.** UPlan states the conflict; it never resolves it on the planner's behalf.

**R4. When no dataset is mapped for a resource type, or a mapped dataset's coverage excludes the study area, that is shown as a gap, not silently absent.** A gap is a distinct fact from "checked, and none found."

**R5. The evidence base is built only from datasets currently mapped to the jurisdiction, using each dataset's current ready version at the time the run pins its inputs.** It never reads a dataset version that wasn't current when the run started, and never re-reads mid-computation (pinned inputs, per the architecture's concurrency rules).

**R6. The evidence base is independent of the applicant.** No applicant-submitted study, file, or attribute ever contributes to it — only free public data ingested by F3.

**R7. The evidence base is desk analysis only, and states what it can't see.** Where a dataset (F3) records a known limitation — for example, that canopy data can't show individual trunk diameters — the evidence base surfaces that limitation plainly wherever the affected resource type appears, never leaving a planner to assume completeness.

**R8. Rebuilding the evidence base for the same pinned inputs produces byte-identical results.** Two runs with the same study area revision, profile version, and set of dataset versions never differ.

## Out of scope for this feature

- Measuring the proposal's impact against this evidence (F9 — same analysis run, different half of the results document).
- Ingesting or versioning the datasets themselves (F3).
- What triggers a run (F1, F3, F5 each enqueue `run_analysis`; this doc only describes what the run computes once triggered).

## Open items

None from round 10 directly.
