# Requirements — Locked Report

**Feature:** F10 · `reports`
**Status:** Draft — publish without sign-off (F12 adds sign-off later in v1); revised 2026-09-27: documents are stored in the database and numbered as versions (F22)
**Serves:** I6 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Output_, P1–P3), [features.md](features.md) (F10), [intents.md](intents.md) (I6)
**Related design doc:** [TechDesign/locked-report.md](../TechDesign/locked-report.md)
**Builds on:** [evidence-base.md](evidence-base.md) (F7), [impact-analysis.md](impact-analysis.md) (F9), [provenance.md](provenance.md) (F4), [research-changes.md](research-changes.md) (F22 — versions and the publishing flow)

## Why

The report is the product; the map is the instrument (P3). It's what gets forwarded, printed, and quoted out of context, so its integrity is never traded for anything else. This feature is what makes a report trustworthy once it leaves UPlan: locked, provenance-complete, and provably unaltered.

Words: the product's word for a released report is the **final document**. A project has one final document at a time, published as numbered versions (F22). "Released" and "published" mean the same thing here.

## Requirements

**R1. A document is built only from one pinned analysis run** — the run for the decision's current inputs, read while the decision is locked for finishing. It never blends numbers from two runs.

**R2. Once published, a document's bytes never change, for any reason** — not a profile change, not a dataset refresh, not a bug fix. A correction is a research change and a new version (F22), never an edit to a published one.

**R3. The document lays out the evidence, the impact, and what remains uncertain** — the evidence base's disagreements and gaps (F7), the impact measurements including any ranges (F9), and every `Limit` the run recorded (charter's _Known limits_).

**R4. Every figure in the document carries its source, date, and confidence, in print, exactly as the same figure would render on screen** (`provenance.md` R8).

**R5. The document states each critical area type's map status (regulatory or approximate) and how the profile treats vesting for this decision,** so a reader knows what kind of boundary and what date's rules they're looking at without having to ask.

**R6. The document never recommends developing, preserving, approving, denying, or conditioning.** No generated sentence in it expresses a judgment — only facts, measurements, and their sources (Posture).

**R7. A screening or evidence result never reads as clearance.** "No mapped wetlands in the study area" is stated as exactly that fact, never as "no wetlands" or "clear to develop" (P2).

**R8. The published PDF is tagged, has a document outline, and meets WCAG 2.1 AA** — every map has a title and description, and every table has header cells.

**R9. The published PDF's hash is recorded, and the stored file can never be overwritten or deleted by UPlan's own systems.** The file and its SHA-256 hash are kept in UPlan's database, and a database rule rejects any change to a published row. The recorded hash is how anyone can later confirm a copy matches what UPlan actually published. _(Changed 2026-09-27: the file was kept in object storage.)_

**R10. Publishing is atomic and safe against a concurrent change:** a document is either built from the inputs that were current and reviewed when finishing began, or the attempt fails cleanly and the planner sees why. While it is generated, the project accepts no change (F22 R8).

**R11. A failed attempt is retried safely — retrying never produces two published documents for one finish,** and a retry after the file was rendered but before it was recorded renders again from the same pinned records and stores one. After the last retry, the failure is recorded and shown, and no version number is used.

**R12. Until F12 ships, publishing requires no second person's sign-off — but the schema and the publishing path must not need to change shape when sign-off is added,** only gain a precondition. The planner's own phase reviews (F21) are not sign-off and don't stand in for it.

**R13. Before finishing, the planner sees what publishing will check and what the document will state.** _Blocking_ items are exactly the conditions that make finishing fail: a phase not yet reviewed, no finished analysis of the current inputs or one that is out of date or failed (F18 R7), a filing date that a vesting rule set needs and lacks, and, for a research change, nothing having changed. _Stated_ items are facts the document will carry, listed so nothing in it is a surprise: evidence gaps, source disagreements, approximate boundaries, and desk-analysis limits. Nothing on the list is a score or a verdict, and showing it adds no rule that finishing doesn't already enforce (R10).

**R14. The document includes a source register and the planner's recorded resolutions.** The register lists every dataset version and every rule that any figure in the document cites, each with its provenance (F4), so a reader can look up the same sources. Each recorded resolution of a source disagreement (F19 R12) appears with its rationale, who recorded it, and when.

**R15. The document includes the project's details, the screening register, and the study flags, worded as screening and never as clearance.** It states the parcel or address, applicant, and project manager where recorded (F5 R10); the register of critical areas the study area touches or is reached by (F14 R1–R2); and the studies the mapped data flags, with the statements of F14 R6 and R9: a missing flag never waives a study, and a stream or wetland that no dataset records will not appear (P2).

**R16. The document records its own version and history.** It shows its version number, when it was published, the profile version it was built under, each phase's review, and, after the first version, the reason and what changed (F22 R10). A document built with sample data says so on its first page (F23 R6).

**R17. The document is built only from pinned records:** the run, the geometry revisions the run recorded, the profile version the run used, and the snapshot taken when finishing began. It reads nothing "current" at render time (F22 R11).

## Out of scope for this feature

- Review and sign-off itself (F12, later in v1).
- Conditions of approval, which join the document once F13 ships.
- Records retention and export of the document (F16 — a published document is retained per the profile's settings; that lifecycle is F16's).

## Open items

None from round 10 directly.
