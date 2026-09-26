# Requirements — Impact Analysis

**Feature:** F9 · `analysis` · _the pilot's edge_
**Status:** Draft
**Serves:** I3 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_The pilot's edge_, _Known limits of desk analysis_), [features.md](features.md) (F9), [intents.md](intents.md) (I3)
**Related design doc:** [TechDesign/impact-analysis.md](../TechDesign/impact-analysis.md)
**Builds on:** [evidence-base.md](evidence-base.md) (F7 — the run this feature shares), [jurisdiction-profile.md](jurisdiction-profile.md) (F1), [proposal-footprint.md](proposal-footprint.md) (F8)

## Why

Round 7 decided measuring the proposal's impact is what the pilot must do best — UPlan's case for being opened instead of the public maps planners already use. This feature is that measurement: what the footprint would remove or disturb, for every regulated resource and buffer, with no verdict attached.

## Requirements

**R1. For every resource type and buffer rule in the resolved profile, the engine measures the area or length of mapped features (and applicable buffers) that fall inside the footprint.** A resource type with nothing mapped inside the footprint still appears, with a measurement of zero — not an omission.

**R2. Every measurement carries the provenance of the evidence it measured and the rule it applied,** so `provenance.md`'s `DerivedProvenance` can be built directly from it.

**R3. When a rule depends on an attribute the evidence doesn't carry — such as a buffer width that varies with a wetland's rating — the engine computes every value the rule could produce and reports the range, plus what the range depends on.** It never assumes a middle value, a default, or the most common case (charter's _Known limits_, `.claude/rules/do-not.md`).

**R4. A measurement against a resource type the profile marks as approximate is flagged approximate wherever it appears** — the map, the tables, and the report all inherit the same flag from this one computed result (F1's `mapStatus`).

**R5. Significant trees are never counted.** Canopy area is measured and reported; the number of regulated trees a proposal would remove is explicitly stated as something desk analysis cannot determine, never estimated from canopy area (charter: "v1 cannot say how many regulated trees a proposal removes").

**R6. The engine never states or implies a verdict.** No result carries language like "acceptable," "significant," or "minor" — only a quantity, its unit, and what it's measured against.

**R7. Results are ordered deterministically, so identical inputs always produce identical output** (shared with F7's R8, one determinism requirement for the whole run).

**R8. All area, length, and buffer computation happens in PostGIS, after transforming to the jurisdiction's analysis projection.** No measurement is computed, rounded, or re-derived in JavaScript (`.claude/rules/do-not.md`: "Don't compute an area, length, or buffer in JavaScript").

**R9. A buffer applies only when its `appliesWhen` condition (if any) is met by the feature's recorded attributes,** read through F3's attribute map — never assumed to apply universally or never at all when the attribute is simply missing (in that case R3's range applies).

**R10. Every impact shown on screen names the rules it applied, each with its code section and effective date, and the evidence features it measured, each with its provenance.** They are the `ruleKeys` and `evidence` the run already stores (R2). Showing them is what lets a planner answer "what caused this number, and where did that come from?" without leaving the page.

**R11. Each impact reads as one fact in a fixed form: the proposal's footprint (by revision), the resource it overlaps, how much, and the evidence.** For example, "Footprint revision 3 overlaps 4,210 sq ft of mapped wetlands." The wording is a template over the stored numbers, and it carries no judgment word (R6).

**R12. The Impact page states which run it shows and whether that run is current** — its study area and footprint revisions, the profile version, and the date each rule set was resolved for (F18 R7). An out-of-date or failed run is stated as such, and the page never presents its numbers as current.

## Out of scope for this feature

- Tagging parts of the footprint as permanent or temporary. That needs more than one footprint layer, so it belongs to F8 and its own design if planners ask for it.
- Indirect and cumulative effects, which need modeling and professional judgment outside desk analysis. The Impact page says so in one plain sentence.
- Assembling the evidence itself (F7 — same run, other half of the results).
- Comparing the impact against alternatives, or any recommendation (explicitly never — Posture).
- Conditions tracing, which consumes `impactKey` values later in v1 (F13).

## Open items

None from round 10 directly names F9. R3's range mechanism is exactly what keeps a future field-rated-attribute question (e.g., wetland rating source) from requiring an engine change.
