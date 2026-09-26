# Requirements — Study Scoping

**Feature:** F14 · `analysis` (extends F7's run) + the Screening and Studies pages
**Status:** Draft
**Serves:** I1, I4 · **Release:** 1 _(moved up from "later in v1" on 2026-09-26)_
**Derived from:** [charter.md](charter.md) (_Jobs: screening_, _Known limits of desk analysis_, P2), [features.md](features.md) (F14), [intents.md](intents.md) (I1, I4)
**Related design doc:** [TechDesign/study-scoping.md](../TechDesign/study-scoping.md)
**Builds on:** [evidence-base.md](evidence-base.md) (F7 — the run this feature shares), [jurisdiction-profile.md](jurisdiction-profile.md) (F1 — buffers and study triggers), [provenance.md](provenance.md) (F4)

## Why

Before an application is filed, the planner needs to know which regulated critical areas a site likely touches so the pre-application conference letter can name every study (I1). Once the applicant's studies arrive, the same answer says what those studies should have covered (I4). Today a profile's study triggers sit unused: no page tells a planner which of them the mapped data points to. This feature turns the study area's evidence into a screening register and a list of study flags, and says plainly what it cannot see.

Screening is not a finding (P2). Everything here flags a reason to look closer. It never clears land and never removes a study.

## Requirements

**R1. For the decision's study area, the screening register has one row per resource type and mapped dataset, stating how many mapped features intersect the study area and how much of them (area for polygons, length for lines).** A count of zero is stated as a measured zero.

**R2. The register also finds mapped features that lie outside the study area but whose applicable buffers reach onto it,** naming each buffer rule that reaches. Critical areas just off the site are part of the screen (I1).

**R3. Distance to the nearest mapped feature is stated only within a search distance the profile defines — the widest of that resource type's buffer widths and study trigger distances.** Beyond it the register says "none mapped within N ft", never "none". The search distance is shown with the result.

**R4. A buffer whose applicability depends on an attribute the evidence lacks is shown as "may apply — depends on <attribute>".** It is never assumed to apply and never assumed not to (the same range rule as F9 R3).

**R5. Each study trigger in the profile whose distance condition is met by mapped data produces a study flag** naming the study, the triggering resource type, the rule with its code section and effective date, and the nearest distance. A flag carries the provenance of the features behind it (F4).

**R6. A flag can add a study to the list. The absence of a flag never removes one and never reads as a waiver (P2).** The Studies page lists every study the profile names. For one with no flag it says "not flagged by mapped data", and that the city decides which studies an application needs.

**R7. A resource type with a gap (F7 R4) appears in the register as that gap,** not as an empty row and not as a row of zeros.

**R8. A row for a resource type the profile marks approximate says so, and says a site study sets the regulated boundary (F1).**

**R9. The Screening and Studies pages state what desk analysis cannot see:** every `Limit` the run recorded, and that a stream, wetland, or other feature that no dataset records will not appear. A clean screen is never presented as "no study needed".

**R10. Rows are shown in a fixed display order — largest measured overlap first, then nearest distance, then resource type key.** The order is a convenience. No row carries a priority, severity, or significance label.

**R11. Screening needs a study area but no footprint.** A decision at the pre-application stage has its register and flags before anything is traced.

**R12. A data-gaps list gathers what is missing:** F7's gaps, each pinned dataset with no publisher date (F3 R2), and each recorded limit. It states facts only and never proposes how to close a gap.

**R13. Every number is computed in PostGIS in the jurisdiction's analysis projection, and the same pinned inputs give byte-identical results (F7 R8).** The register's sentences are fixed templates over those numbers. No language model writes any of it.

**R14. A row links to the map with that resource type's layer turned on** (F6 R8), so the planner can see what the row describes.

## Out of scope for this feature

- Tracking a study's status, its responsible professional, or the applicant's study contents. The planner does the comparison (I4); UPlan does not ingest or grade applicant studies.
- Survey-season windows and schedule risk. They need field-survey data the profile doesn't hold, and field survey is out of v1.
- Ranking or prioritizing constraints by significance.
- Drafting study scopes or a study plan as prose.
- Comparing candidate sites (returns with capital projects).

## Open items

- **Staleness of data.** F14 states a dataset's publisher date and its age in years. Whether a city sets a threshold, in its profile settings, beyond which an age is called out is not decided, so no "old" label exists yet.
