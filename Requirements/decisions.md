# Requirements — Decisions

**Feature:** F5 · `decisions`
**Status:** Draft
**Serves:** every intent · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Core object_), [features.md](features.md) (F5), [data-model.md](../TechDesign/data-model.md) (`decision`, `decision_geometry`)
**Related design doc:** [TechDesign/decisions.md](../TechDesign/decisions.md)

## Why

The decision is the spine's core object: everything else (evidence, footprint, impact, report) hangs off one decision. This feature is only what a decision _is_ and how its identity, status, and drawn geometry are recorded — not the map UI (F6), the footprint-tracing workflow (F8), or what gets computed from it (F7, F9).

## Requirements

**R1. A decision belongs to exactly one jurisdiction, and every read or write of it is scoped to that jurisdiction.** A planner without membership in a decision's jurisdiction cannot see it exists (ties to `accounts-roles.md` R6, R7).

**R2. A decision's study area is a drawn boundary that can cross parcel lines,** because habitat does not follow them (charter, _Core object_).

**R3. A decision records the date its application was filed, as a plain date, not a timestamp,** so vesting settings (F1) can resolve rules against it. It is not required at creation — a decision may exist before an application is filed — but a run against a vesting rule set fails validation without it (F1 R3).

**R4. A decision shows where it stands: in progress, or report released.** This status gates whether a new profile version or dataset version requeues its analysis (F1, F3) — only an in-progress decision is requeued.

**R5. Saving a study area or footprint never overwrites a previous drawing — each save is a new, numbered revision.** A revision, once saved, is never edited or deleted; an analysis run pins the exact revision number it read.

**R6. Saving the same revision number twice fails instead of racing.** Two near-simultaneous saves of what the client believed was "the next revision" must not both succeed and silently pick a winner.

**R7. A drawn geometry that isn't valid is rejected outright, with the specific problem, and never repaired.** Repairing what a planner drew would substitute UPlan's guess for their intent (`.claude/rules/do-not.md`); only source data ingested by F3 is ever repaired.

**R8. Reopening a decision after its report released sets it back to in progress,** for preparing a revised report — but never changes the released report itself (F10 owns that immutability; this feature only flips the status).

**R9. Every geometry revision and every status change records who made it and when.**

## Out of scope for this feature

- Tracing a footprint from a site plan, and any footprint-specific UI (F8).
- The map workspace that displays a decision's geometry (F6).
- Computing anything from the geometry (F7, F9).

## Open items

None from round 10 name F5 directly, beyond R3's dependence on F1's vesting assumption.
