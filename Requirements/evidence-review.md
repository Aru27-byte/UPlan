# Requirements — Evidence Review

**Feature:** F19 · `analysis` (resolutions) + `evidence` (dataset attributes) + the Evidence page
**Status:** Draft
**Serves:** I2, I6 · **Release:** 1
**Derived from:** [charter.md](charter.md) (P1, P2, _Posture_), [features.md](features.md) (F19), [intents.md](intents.md) (I2, I6)
**Related design doc:** [TechDesign/evidence-review.md](../TechDesign/evidence-review.md)
**Builds on:** [evidence-layers.md](evidence-layers.md) (F3), [provenance.md](provenance.md) (F4), [evidence-base.md](evidence-base.md) (F7)

## Why

The Evidence page shows a single high, moderate, or low badge per resource type. That is the label P1 requires, but it hides what a planner needs to defend it: who published the data, how old it is, how precise it is, and whether anyone has verified it in the field. A commissioner, an opponent, or an attorney asks those questions one at a time. And where two datasets disagree, F7 shows both and stops there. The planner has to say, somewhere, which source they are relying on and why. Today that reasoning lives in their head or in an email.

This feature breaks the label into the facts behind it, and lets a planner record their reasoning about a disagreement without changing any number.

## Requirements

**R1. Each evidence item shows seven attributes beside its confidence label:** source authority, data age, spatial precision, verification, boundary status, consistency, and professional review. Each is stated in words a commissioner can read.

**R2. Source authority is one of federal, state, regional, county, or local, and spatial precision is one of site, parcel, regional, or coarse.** Both are recorded on the dataset when it is set up (F3), never inferred from its features, and a dataset can't be registered without them.

**R3. Data age is stated as the publisher's date and the number of years since it, or the note the dataset carries when the publisher gives no date.** No "current", "recent", or "old" label is applied, because no threshold for one is decided (see F14's open item). `retrieved_at` is never presented as the publisher's date (F4).

**R4. Verification is stated as "mapped, remote — not field verified" for every item in release 1, and professional review as "none".** They are shown, not omitted, so a reader sees that the evidence is desk analysis (charter, _Known limits_).

**R5. Boundary status comes from the profile: a regulatory boundary, or an approximate one that a site study sets (F1).** Consistency is "sources agree" or "sources disagree" from F7's disagreements, and "single source" when only one dataset maps the resource type.

**R6. A data-quality panel shows, for each dataset version behind an item: its version, retrieval date, publisher date or note, coverage relative to the study area, spatial precision, known limitations (F3 R10), and the count of geometry repairs made at ingestion (F3 R6).**

**R7. Where two sources disagree, the planner may record which source they rely on, or that they rely on neither, with a required rationale.** Recording it never changes a measurement, an impact, a screening row, or what is displayed. Both sources stay shown (F7 R3).

**R8. A recorded resolution names the resource type and the exact pair of dataset versions it is about, and records who made it and when.** It is never edited or deleted. Changing your mind saves a new revision, and the latest revision is the one shown, with the earlier ones one step away.

**R9. When either dataset version in a pair is replaced, the resolution is shown as "recorded for earlier data" and the disagreement shows as not yet recorded for the current data.** A resolution is never carried across to different data.

**R10. Saving the same revision of a resolution twice fails instead of racing.** Two near-simultaneous saves must not both succeed.

**R11. A resolution is offered only for a disagreement F7 actually reports.** A resource type with a gap, or one with a single mapped source, has nothing to resolve.

**R12. The report states each recorded resolution, with its rationale, who recorded it, and when** (F10 R14), so a reader sees the planner's stated reasoning next to the disagreement.

## Out of scope for this feature

- Picking a source automatically or ranking sources by authority. UPlan states the conflict and never resolves it (F7 R3).
- Letting a resolution exclude a source from the analysis. That would make the planner's note change the numbers.
- Recording professional review, field verification, or agency determinations. There is no field data or professional sign-off in v1.
- A composite confidence score.

## Open items

- Whether F12's reviewers can comment on a resolution when review ships. Not needed for release 1.
