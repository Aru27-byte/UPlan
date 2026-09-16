# Requirements — Jurisdiction Profile

**Feature:** F1 · `profiles`
**Status:** Draft
**Serves:** I1–I6, I9 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Ecological dimensions — v1_), [features.md](features.md) (F1), [system-architecture.md](../TechDesign/system-architecture.md) (_Assumptions for open product questions_, _Rules in force_)
**Related design doc:** [TechDesign/jurisdiction-profile.md](../TechDesign/jurisdiction-profile.md)

## Why

Every decision is analyzed under a city's rules, and the charter decided those rules are configuration, not code, so a second city is a new profile, not a rewrite. This doc defines what a profile must hold, what it must never let a planner do to the rules, and how rules resolve for a given date. `profile-upload-edit.md` (F17) covers how the document gets in and how planners change it; this doc covers what the document is and how it's used.

## Requirements

**R1. Every rule in a profile cites the code section it comes from, and the ordinance or an explicit statement that the code section is the only reference, and a source URL.** No rule can be stored without a citation (P1).

**R2. Every rule carries the date it took effect, and — once superseded — the date it was repealed.** A rule in force has `repealedOn = null`; amending it never edits the old entry, it adds a new one with the same rule key and sets the old entry's `repealedOn` (charter: "Rules are always current"). History is never deleted.

**R3. A decision not marked as vesting is analyzed under the rules in force today, in the jurisdiction's time zone.** _Assumed per `system-architecture.md`'s round-10 table:_ a rule set marked as vesting is analyzed under the rules in force on the decision's filing date instead. If round 10 answers this differently, only the resolution function this doc names changes — not the schema. When a vesting rule set has no filing date to resolve against, the analysis fails with a `ValidationError` naming the missing date; it is never silently treated as non-vesting.

**R4. Planners choose three kinds of settings per profile, instead of UPlan assuming them:** which rule sets vest to the filing date; for each critical area type, whether its mapped boundary is regulatory or approximate; and, per record type, how long it's kept and which formats it exports in (F16). A profile document that leaves any of these unset is invalid — nothing is implied by omission.

**R5. One function resolves which rules apply, for any rule set and any date, and every part of the system that needs "the rules" calls it.** No module re-derives rule applicability by its own date logic.

**R6. The rules a resource type, buffer, or tree rule expresses are configuration; the _kinds_ of rule UPlan can express are code.** A second city can add, remove, or reprice any resource type, buffer, study trigger, or tree rule without a code change. Introducing a genuinely new _kind_ of rule (one that doesn't fit `ResourceType`, `BufferRule`, `StudyTrigger`, or `TreeRule`'s shapes) is a schema change, not a configuration change, and this doc's design must say so plainly rather than imply infinite flexibility.

**R7. An approved profile becomes a new immutable version; nothing already approved is ever edited.** The city's "current" profile is a pointer that moves to a new version only when a change is approved (see `profile-upload-edit.md` for how a change is proposed and approved).

**R8. A profile document is only ever replaced as a whole, validated document — never patched field by field in the database.** Every write goes through the one schema that also drives the Excel template and the editor (F17), so the template, the editor, and stored data can never drift from each other.

**R9. Approving a profile version that would drop a resource type still mapped by an evidence dataset fails.** A city cannot lose the resource type an active `jurisdiction_dataset` mapping depends on out from under evidence ingestion (F3).

**R10. When a rule's effective or repeal date arrives, every open decision under that jurisdiction is scheduled for re-analysis on that date** — results never silently lag a rule taking effect (charter, F2 default carried into F1's daily job).

**R11. A profile document is self-consistent: no duplicate resource type key, no rule referencing a resource type that doesn't exist, and no two entries for the same rule key in force on the same day.** These are checked on every write, not just on upload.

## Out of scope for this feature

- How a document reaches the system — upload from Excel, or an edit in UPlan's editor (F17).
- Automatic tracking of code changes from the city's website (F2, later in v1).
- The impact engine that reads `rulesInForce` output to compute measurements (F9).

## Open items

- **Round 10 — vesting:** R3's "warn only" fallback (`rulesInForce` running for both today and the filing date, flagging differences, rather than changing which rules apply) is the alternative `system-architecture.md` names if round 10 answers differently. This doc's design isolates that choice to the resolution function.
- **Round 10 — cities beyond Sammamish:** every table here is already keyed by `jurisdiction_id`; a second city needs evidence coverage and a second profile document, not a schema change.
