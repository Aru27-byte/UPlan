# Requirements — Locked Report

**Feature:** F10 · `reports`
**Status:** Draft — release without sign-off (F12 adds sign-off later in v1)
**Serves:** I6 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Output_, P1–P3), [features.md](features.md) (F10), [intents.md](intents.md) (I6)
**Related design doc:** [TechDesign/locked-report.md](../TechDesign/locked-report.md)
**Builds on:** [evidence-base.md](evidence-base.md) (F7), [impact-analysis.md](impact-analysis.md) (F9), [provenance.md](provenance.md) (F4)

## Why

The report is the product; the map is the instrument (P3). It's what gets forwarded, printed, and quoted out of context, so its integrity is never traded for anything else. This feature is what makes a report trustworthy once it leaves UPlan: locked, provenance-complete, and provably unaltered.

## Requirements

**R1. A report is built only from one pinned analysis run** — the decision's latest successful `current` run at the moment of release. It never blends numbers from two runs.

**R2. Once released, a report's bytes never change, for any reason** — not a profile change, not a dataset refresh, not a bug fix. A correction is a new decision revision and a new report, never an edit to a released one.

**R3. The report lays out the evidence, the impact, and what remains uncertain** — the evidence base's disagreements and gaps (F7), the impact measurements including any ranges (F9), and every `Limit` the run recorded (charter's _Known limits_).

**R4. Every figure in the report carries its source, date, and confidence, in print, exactly as the same figure would render on screen** (`provenance.md` R8).

**R5. The report states each critical area type's map status (regulatory or approximate) and how the profile treats vesting for this decision,** so a reader knows what kind of boundary and what date's rules they're looking at without having to ask.

**R6. The report never recommends developing, preserving, approving, denying, or conditioning.** No generated sentence in the report expresses a judgment — only facts, measurements, and their sources (Posture).

**R7. A screening or evidence result never reads as clearance.** "No mapped wetlands in the study area" is stated as exactly that fact, never as "no wetlands" or "clear to develop" (P2).

**R8. The released PDF is tagged, has a document outline, and meets WCAG 2.1 AA** — every map has a title and description, and every table has header cells.

**R9. The released PDF's hash is recorded, and the stored file can never be overwritten or deleted by UPlan's own systems.** The recorded hash is how anyone can later confirm a copy matches what UPlan actually released.

**R10. Releasing is atomic and safe against a concurrent profile or dataset change:** a release either commits against inputs that are still current, or fails cleanly and the planner sees why — it never silently reports on stale rules or evidence that changed moments earlier.

**R11. A failed release attempt is retried safely — retrying never produces two released PDFs for one sequence number**, and a retry after a partial failure (object stored, database not yet updated) finalizes from the stored object instead of rendering again.

**R12. Until F12 ships, releasing a report requires no sign-off — but the schema and release path must not need to change shape when sign-off is added,** only gain a precondition.

**R13. Before releasing, the planner sees what the release will check and what the report will state.** _Blocking_ items are exactly the conditions that make a release fail today: no successful analysis, an analysis that is out of date or failed (F18 R7), or a filing date that a vesting rule set needs and lacks. _Stated_ items are facts the report will carry, listed so nothing in it is a surprise: evidence gaps, source disagreements, approximate boundaries, and desk-analysis limits. Nothing on the list is a score or a verdict, and showing it adds no rule the release doesn't already enforce (R10).

**R14. The report includes a source register and the planner's recorded resolutions.** The register lists every dataset version and every rule that any figure in the report cites, each with its provenance (F4), so a reader can look up the same sources. Each recorded resolution of a source disagreement (F19 R12) appears with its rationale, who recorded it, and when.

**R15. The report includes the project's details, the screening register, and the study flags, worded as screening and never as clearance.** It states the parcel or address, applicant, and project manager where recorded (F5 R10); the register of critical areas the study area touches or is reached by (F14 R1–R2); and the studies the mapped data flags, with the statements of F14 R6 and R9: a missing flag never waives a study, and a stream or wetland that no dataset records will not appear (P2).

## Out of scope for this feature

- Review and sign-off itself (F12, later in v1).
- Conditions of approval, which join the report once F13 ships.
- Records retention/export of the report file (F16 — a released report is retained per the profile's settings; that lifecycle is F16's).

## Open items

None from round 10 directly.
