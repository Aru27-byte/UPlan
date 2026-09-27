# Requirements — Decision Overview and Stage Rail

**Feature:** F18 · `workflow` + the Overview page and the stage rail
**Status:** Draft — revised 2026-09-27: the rail now shows F21's review states, and routes say "project"
**Serves:** every intent · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Spine_, _Posture_, P1–P3), [features.md](features.md) (F18), [intents.md](intents.md) (_Across all intents_)
**Related design doc:** [TechDesign/decision-overview.md](../TechDesign/decision-overview.md)
**Builds on:** [decisions.md](decisions.md) (F5), [evidence-base.md](evidence-base.md) (F7), [study-scoping.md](study-scoping.md) (F14), [impact-analysis.md](impact-analysis.md) (F9), [locked-report.md](locked-report.md) (F10), [jurisdiction-profile.md](jurisdiction-profile.md) (F1)

## Why

A decision today is five tabs with no order and no summary. A planner opening one can't tell what has been done, what is missing, or what to do next, and can't see that an analysis is out of date after the study area changed. The ecological workflow the product follows moves from project details, through the site and its evidence, to screening, studies, impact, and the report. This feature makes that order visible and answers the planner's five questions from the decision's own records.

It structures the work. It never decides anything: no score, no verdict, and no advice about the development.

## Requirements

**R1. Every decision page shows a stage rail: Overview, Site, Evidence, Screening, Studies, Footprint, Impact, Report, grouped as Set up, Assemble, Analyze, Report.** The rail marks the page the planner is on.

**R2. Each stage shows a state, derived only from the decision's own records.** For the six phases (F21 R5) it is _To do_, _Updating_, _Needs review_, _Reviewed_, or _Revision requested_. For Overview it is _Needs attention_ (a filing date that a vesting rule set needs is missing) or _Recorded_. For Report it is _Not ready_, _Ready to finish_, _Generating_, or _Version N published_ (F22). A phase whose analysis failed shows _Needs attention_ with the error's presence stated. None of these words means approved, verified, or clear, and a review is the planner's own record, not sign-off (F21 R6). The state is words plus a shape, never color alone (R12).

**R3. The rail orders the work but doesn't block it.** A planner can open any stage at any time. The one gate that exists stays: the Footprint stage needs a study area first (F8), and it says so.

**R4. The Overview answers the planner's five questions, each from records:**

- **What do we know?** Which profile resource types have mapped evidence over the study area, and from which datasets.
- **What don't we know?** The evidence gaps (F7), the source disagreements not yet recorded as relied on (F19), and the limits desk analysis carries.
- **What could delay this?** An analysis that is out of date or failed, a filing date that a vesting rule set needs and lacks, the target decision date when one is recorded, and a report not yet released.
- **What can desk analysis not settle?** The study flags (F14) and the resource types with approximate boundaries whose overlap or reach is nonzero. It doesn't say who settles them.
- **What next?** The next actions (R6).

**R5. The Overview shows counts and lists, never a percentage, completeness score, risk rating, or ranking of issues.** A composite number would be an invented judgment, and it would read as one when quoted.

**R6. Next actions come from a fixed, ordered rule table over the decision's records and name a workflow step, never a judgment.** Examples: draw the study area, record the filing date, review the failed analysis, review N source disagreements, review N flagged studies, trace the footprint, review the impact, release the report. Each links to its stage. No action proposes approving, denying, conditioning, or clearing land, and none is generated text.

**R7. The Overview and the rail show the analysis status: current, running, out of date, failed, or none.** When it is out of date, it says what changed since the last run: the study area, the footprint, the profile version, the set of rules in force (a rule took effect or was repealed), or a dataset version. A failed run shows its error. The passing of a day alone never makes an analysis out of date.

**R8. The Overview lists the rules that apply to this decision, as resolved for it:** each resource type with its map status, its buffers and study triggers, and how the profile treats vesting for the decision. Each rule cites its code section and effective date (P1), and the list links to the city's profile.

**R9. The Overview lists the assumptions the analysis made,** so none is buried in a run: the date each rule set was resolved for and why (vesting or today), resource types treated as approximate, and that no footprint has been traced when none has.

**R10. The Overview is where a planner records and edits the decision's project details** (F5 R10–R12): title, parcel or address, applicant, project manager, filing date, and target decision date. A detail not yet recorded shows as "Not yet recorded". An edit that is based on an out-of-date view is rejected with a conflict, never overwritten. A completed decision's details are read-only until a research change starts.

**R11. A completed decision's Overview shows its latest document version** (number and publication date, with a link to download it) and that the analysis it was published against is fixed. It offers **Start a research change** (F22), and for an open research change it shows what changed so far.

**R12. The status of a decision (in progress, generating a document, completed) and the analysis status are told apart by text and shape, not by color alone.**

**R13. The rail and the Overview meet WCAG 2.1 AA and work at phone width for looking up.** Editing project details on a phone is not required in release 1 (F15).

## Out of scope for this feature

- Any stage the charter excludes for v1: comparing alternatives, capturing field data, mitigation and compliance tracking.
- Editing what the stages themselves hold: the study area (F5, F6), the footprint (F8), the evidence (F3, F7).
- An AI copilot or chat. Every sentence on the Overview is a fixed template over records.
- Schedule risk from survey seasons (see F14's out of scope).

## Open items

None from round 10.
