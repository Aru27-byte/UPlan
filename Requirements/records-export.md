# Requirements — Records Retention and Export

**Feature:** F16 · `records`
**Status:** Draft
**Serves:** the public records constraint in `intents.md` · **Release:** 1
**Derived from:** [charter.md](charter.md) (_v1 scope_), [features.md](features.md) (F16), [intents.md](intents.md) (_Across all intents_: RCW 42.56.010)
**Related design doc:** [TechDesign/records-export.md](../TechDesign/records-export.md)
**Builds on:** [jurisdiction-profile.md](jurisdiction-profile.md) (F1 — retention/export settings)

## Why

What planners create in UPlan is a public record under Washington's Public Records Act, reachable by a request — not only the released report. UPlan must be able to show what's eligible for disposal and produce an export, without ever deleting anything on its own authority.

## Requirements

**R1. Retention is tracked per record type, using the period the city's planners set in the profile** (F1's `settings.retention`), never a value UPlan assumes.

**R2. Retention starts counting from the first real application in a jurisdiction,** not from when UPlan itself was set up — an idle pilot city with no applications yet has nothing eligible for disposal.

**R3. UPlan never deletes a record when its retention period ends.** Reaching `eligible_on` only flags the record for the city's own records process to review — flagging is not disposal.

**R4. A flag review is recorded: who reviewed it, when, and the outcome (keep or dispose).** UPlan does not act on a `dispose` outcome by deleting anything itself — what happens next is outside this feature (see _Out of scope_).

**R5. A records export is built only in a format the jurisdiction's profile lists as available,** and it is scoped explicitly (which records, which date range) rather than "everything."

**R6. A records export is a durable, hashed artifact,** so its integrity can be checked later, the same way a released report's can (F10).

**R7. Building an export never modifies the records it exports** — reading for an export and disposing of a record are entirely separate operations; an export in progress blocks nothing else.

**R8. A failed export leaves no partial file and is clearly marked failed with its reason**, so a planner isn't left guessing whether a partial download is trustworthy.

## Out of scope for this feature

- What the city's records process actually does with a `dispose` outcome (shredding paper, purging a separate archive) — outside UPlan entirely; this feature's own database rows for a decision, run, or report are never deleted by this feature either way, since `.claude/rules/do-not.md` forbids deleting evidence features, geometry revisions, finished runs, and released reports regardless of any retention outcome.
- Setting the retention periods and export formats themselves (F1's profile settings).

## Open items

None from round 10 directly.
