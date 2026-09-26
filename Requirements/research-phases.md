# Requirements — Research Phases and Review

**Feature:** F21 · `workflow` (phases, drafting, reviews) + the six phase pages
**Status:** Draft
**Serves:** I1, I2, I3, I6 · **Release:** 1 _(added 2026-09-27)_
**Derived from:** [charter.md](charter.md) (P1–P3, _Posture_), [features.md](features.md) (F21), [intents.md](intents.md)
**Related design doc:** [TechDesign/research-phases.md](../TechDesign/research-phases.md)
**Builds on:** [decision-overview.md](decision-overview.md) (F18 — the stage rail), [evidence-base.md](evidence-base.md) (F7), [study-scoping.md](study-scoping.md) (F14), [impact-analysis.md](impact-analysis.md) (F9), [evidence-review.md](evidence-review.md) (F19)

## Why

A planner's research is a sequence of questions: where is the site, what does the record show, what does the screen flag, what studies follow, what would the proposal remove, and what is the impact. UPlan already answers each one. What is missing is the working loop around the answer: read what UPlan drafted, decide whether it is right, change an input if it is not, and read the new draft. Without that loop a planner can't say which outputs they have checked, and a final document can't say so either.

## Words

A **phase** is one step of the research that produces an output: **Site, Evidence, Screening, Studies, Footprint, Impact**. **Overview** and **Report** frame them and are not phases. A phase's **output** is what UPlan drafts for it. A **review** is the planner's recorded response to one output.

## Requirements

**R1. A project has six phases, in a fixed order, and each has its own page.** Every phase page shows, in this order: what the output is drafted from (its inputs); the output; the review; and the history of earlier outputs and reviews.

**R2. A phase's output is drafted by UPlan's analysis engine, deterministically, from the phase's pinned inputs.** The same inputs give the same output, byte for byte. Measurements come from PostGIS. The sentences that describe them are fixed templates over those measurements. No language model writes any of it, and the page says so beside every drafted summary (P2, _Posture_; decided 2026-09-26).

**R3. A drafted summary states measurements and gaps and never a verdict.** It never says an impact is acceptable, that land is clear, that a study isn't needed, or what the planner should decide. It never ranks or scores (P2, F18 R5, F9 R6). A denylist test enforces this on every template.

**R4. A phase has an output only when its inputs exist and, for the analysis phases, the analysis for the current inputs has finished.**
- Site needs a study area. Footprint needs a footprint.
- Evidence, Screening, and Studies need a finished analysis of the current inputs.
- Impact needs that and a footprint.
Until then the phase says exactly what is missing or that the analysis is running, out of date, or failed (F18 R7). It never shows an earlier output as if it were current. An earlier output may be shown, labeled as out of date, beside the reason.

**R5. Each phase is in exactly one review state, and the state is derived from records, not from a flag someone sets.**
- **To do** — a required input is missing.
- **Updating** — the inputs exist and the analysis is not finished.
- **Needs review** — there is an output that has not been reviewed. When the phase was reviewed before and the output has since changed, it says so, and shows what changed.
- **Reviewed** — the planner recorded a review of this exact output.
- **Revision requested** — the planner recorded that this exact output needs work.

**R6. A planner records a review of a phase's output as either _Reviewed_ or _Revision requested_.** A revision request requires a note. A review may carry a note. A review says the planner read this output. It is not sign-off (F12), not approval, and not a statement about the development.

**R7. A review belongs to the exact output it was made on.** The page a planner reads carries the output's fingerprint, and the review is refused with a clear message if the output has changed since the page was loaded. A review is never carried onto a different output.

**R8. Reviews are never edited or deleted.** Changing a mind records a new review. The phase shows the latest review for the current output, and its history shows every earlier one, with who made it, when, the verdict, the note, and the summary it was made on.

**R9. To iterate, the planner changes an input and reads the new output.** Each phase names what feeds it and links to where that input is changed: Site and Footprint have their own editors; Evidence has the resolution notes (F19) and links to Site; Screening and Studies link to Site; Impact links to Footprint. A change to an input starts a new analysis. When it finishes, the output changes, the phase asks for review again, and it shows what changed since the last review (R5).

**R10. "What changed" is stated as the sentences added and the sentences removed since the last reviewed output.** It is a comparison of two drafted summaries, and adds no judgment.

**R11. The Site and Footprint phases accept a boundary three ways: drawn on the map, uploaded as a GeoJSON file, or loaded from sample data (F23).** An upload is checked, never repaired: it must be valid GeoJSON in WGS 84 holding exactly one Polygon or MultiPolygon, and a geometry that isn't valid is rejected with the reason (F5 R7). Each way saves a new numbered revision (F5 R5, R6).

**R12. Reviewing and changing inputs are allowed only while the project's research is in progress.** A completed project's phases are read-only until the planner starts a research change (F22).

**R13. Every phase page states what desk analysis can't see for its phase,** from the run's recorded limits and the phase's fixed text (F14 R9), and shows the provenance of everything it displays through the one formatter (P1).

**R14. Each phase page works on a phone for looking things up,** and building a footprint or drawing a site stays a browser task (charter).

## Out of scope for this feature

- Sign-off by a second person, and comments from reviewers (F12).
- Editing a drafted summary. The summary is derived, so an edit would be a claim that isn't backed by a measurement. A planner who disagrees requests a revision and changes an input, or records the reasoning in a note.
- Drafting with a language model, in any phase.
- Conditions of approval (F13).
- Field verification, applicant studies, and licensed data as inputs (charter).

## Open items

- Whether a planner may attach a note to a phase without a verdict. The review note covers the need for release 1.
