# Requirements — Evidence Layers

**Feature:** F3 · `evidence`
**Status:** Draft
**Serves:** I1–I4 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Ecological dimensions_, _Known limits of desk analysis_), [features.md](features.md) (F3), [system-architecture.md](../TechDesign/system-architecture.md) (_Key flows: Dataset refresh_, D10, D11)
**Related design doc:** [TechDesign/evidence-layers.md](../TechDesign/evidence-layers.md)

## Why

Evidence assembly (I2) and screening (I1) both depend on having the public datasets behind every profile dimension already gathered, current, and provenance-complete — not fetched ad hoc per decision. This feature is the pipeline that keeps that shared pool of evidence current; `evidence-base.md` (F7) is what a single decision does with it.

## Requirements

**R1. A dataset is only ingested from a free public source, with its license recorded.** A dataset with no free public license is never stored as evidence (charter, round 9).

**R2. Every dataset version records the publisher's own date, or an explicit note when the publisher gives none, separately from when UPlan retrieved it.** These feed `provenance.md`'s `EvidenceProvenance` directly — this feature produces the values that formatter renders, and never formats them itself.

**R3. Every dataset version records a confidence level and the reasoning behind it.** Confidence describes the data's fitness as desk-analysis evidence (resolution, currency, methodology), decided when the dataset is set up, not computed from the features themselves.

**R4. A dataset refresh that finds no change in the source file stops without creating a new version.** Re-ingesting identical data never produces a duplicate version or a wasted analysis run.

**R5. A dataset refresh that finds changed data creates a new, immutable version; the previous version is never edited or replaced in place.** Once a version is marked ready, its features don't change underneath any analysis run that pinned it.

**R6. Invalid geometry in a source is repaired during ingestion, and the repair is recorded.** This is the one place UPlan repairs geometry — a source publisher's data, not a planner's drawing (`.claude/rules/best-practices.md`: repairing input a person drew is a forbidden fallback; repairing ingested source data is not the same thing and is explicitly allowed here).

**R7. A failed refresh leaves the previous version current, and shows the failure plainly beside it.** A stale-but-good dataset is never presented as if nothing happened; the failed attempt and its reason are visible wherever that dataset appears.

**R8. Each dataset maps to the resource type(s) it serves, per jurisdiction, with an explicit attribute map from the source's field names to the rule's attribute names.** A dataset can serve more than one jurisdiction; the mapping — not the dataset — is where a jurisdiction's resource type meets a specific public source.

**R9. Evidence layers are served to the map as versioned vector tiles that never change once published.** A tile URL names the dataset version it came from, so it can be cached indefinitely and a planner is never shown a mix of two versions on one map.

**R10. What a dataset cannot show is recorded as a fact about the dataset, not inferred per decision.** For example, that canopy data shows extent but not individual trunk diameters is recorded once, on the dataset, and every feature that uses it inherits that limit (feeds F9's `Limit` type and the charter's _Known limits of desk analysis_).

**R11. A dataset's spatial coverage is explicit, so screening and evidence assembly can tell "no data here" from "nothing found."** A study area outside a dataset's recorded coverage is a gap (F7's `Gap`), never silently treated the same as an empty result inside coverage.

**R12. Every dataset records its source authority (federal, state, regional, county, or local) and its spatial precision (site, parcel, regional, or coarse) when it is set up, and a dataset without both is never registered.** Like confidence (R3), they describe the data's fitness as desk-analysis evidence, are decided by a person, and are never inferred from the features. F19 (`evidence-review.md`) shows them beside each evidence item.

## Out of scope for this feature

- Reconciling disagreements between datasets and stating gaps for one decision's study area — that comparison is F7's job, built on the versions this feature produces.
- The impact engine reading these features against a footprint (F9).
- Licensed, applicant, or consultant data — never in scope, at any release (charter, do-not rules).

## Open items

None from round 10 directly. If v1 opens to cities beyond Sammamish, `jurisdiction_dataset` already separates "the dataset" from "which city uses it for what," so a second city adds mappings, not a new ingestion design.
