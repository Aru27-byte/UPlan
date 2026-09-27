# Requirements — Decisions

**Feature:** F5 · `decisions`
**Status:** Draft
**Serves:** every intent · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Core object_), [features.md](features.md) (F5), [data-model.md](../TechDesign/data-model.md) (`decision`, `decision_geometry`)
**Related design doc:** [TechDesign/decisions.md](../TechDesign/decisions.md)

## Why

The decision is the spine's core object: everything else (evidence, footprint, impact, report) hangs off one decision. This feature is only what a decision _is_ and how its identity, status, and drawn geometry are recorded — not the map UI (F6), the footprint-tracing workflow (F8), or what gets computed from it (F7, F9).

## Requirements

**R1. A decision belongs to exactly one jurisdiction and to the person who created it, and every read or write of it is scoped to that person.** Nobody else can see it exists: a decision that isn't theirs, that was deleted, or that never existed all read as "not found" (`accounts-roles.md` R3, R6, R7). _(Changed 2026-09-27: it was scoped by jurisdiction membership.)_

**R2. A decision's study area is a drawn boundary that can cross parcel lines,** because habitat does not follow them (charter, _Core object_).

**R3. A decision records the date its application was filed, as a plain date, not a timestamp,** so vesting settings (F1) can resolve rules against it. It is not required at creation — a decision may exist before an application is filed — but a run against a vesting rule set fails validation without it (F1 R3).

**R4. A decision shows where it stands: in progress, generating its document, or completed (its document is released).** This status gates whether a new profile version or dataset version requeues its analysis (F1, F3) — only an in-progress decision is requeued. It also gates every change: only an in-progress decision can be edited (R13).

**R5. Saving a study area or footprint never overwrites a previous drawing — each save is a new, numbered revision.** A revision, once saved, is never edited or deleted; an analysis run pins the exact revision number it read.

**R6. Saving the same revision number twice fails instead of racing.** Two near-simultaneous saves of what the client believed was "the next revision" must not both succeed and silently pick a winner.

**R7. A drawn geometry that isn't valid is rejected outright, with the specific problem, and never repaired.** Repairing what a planner drew would substitute UPlan's guess for their intent (`.claude/rules/do-not.md`); only source data ingested by F3 is ever repaired.

**R8. Reopening a completed decision sets it back to in progress,** to start a research change (F22) — but never changes a released document itself (F10 owns that immutability; this feature only flips the status, and does so as one compare-and-set that also queues a fresh analysis).

**R9. Every geometry revision and every status change records who made it and when.**

**R10. A decision can record its project details: parcel or address, applicant, project manager, and target decision date.** None is required at creation, because a decision may start before they are known, and an unrecorded one is shown as "Not yet recorded", never a placeholder value. The project manager is a name, entered as text. With membership gone there is no list of planners to choose from. _(Changed 2026-09-27.)_

**R11. Editing project details, including the filing date (R3), is one compare-and-set on the decision's row version.** An edit based on an out-of-date view fails with a conflict instead of overwriting a newer edit (ties to R6's honesty rule for browsers).

**R12. Changing the filing date makes the decision's analysis run again, in the same transaction as the change,** so the analysis never quietly lags the date that selects its rules (F1 R3).

**R13. Only an in-progress decision can be changed.** Saving a boundary, editing project details, recording a resolution note, recording a phase review, and finishing research all fail with a clear message when the decision is completed ("start a research change first") or generating its document ("wait for it to finish"). Each of those functions takes one lock on the decision row and checks the status under it, so a change and a finish can't interleave (F21 R12, F22 R3, R8).

**R14. A decision can be deleted from view, and deleting keeps every record.** A deleted decision disappears from every list and read and is never shown again, but nothing in its history is removed: its geometry revisions, analysis runs, reviews, and documents stay, because working data may be public record (F16). Deleting is one compare-and-set on the row version, it records who deleted it and when, and it is refused while a document is being generated.

**R15. A decision can be created with its optional details filled in,** and with sample data (F23), in one step. Creating with sample data either completes fully or leaves nothing behind.

## Out of scope for this feature

- Restoring a deleted decision, and purging one (F16).

- Tracing a footprint from a site plan, and any footprint-specific UI (F8).
- The map workspace that displays a decision's geometry (F6).
- Computing anything from the geometry (F7, F9).

## Open items

None from round 10 name F5 directly, beyond R3's dependence on F1's vesting assumption.
