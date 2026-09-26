# Requirements — Proposal Footprint

**Feature:** F8 · `decisions` (UI) + `decisions` module
**Status:** Draft
**Serves:** I3 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_What UPlan evaluates_), [features.md](features.md) (F8), [intents.md](intents.md) (I3)
**Related design doc:** [TechDesign/proposal-footprint.md](../TechDesign/proposal-footprint.md)
**Builds on:** [decisions.md](decisions.md) (F5 — `saveGeometry` with `kind = "footprint"`)

## Why

I3 is the pilot's edge: what the proposal would clear, grade, or build, set against the evidence. The footprint has to be the planner's own traced judgment of the application's site plan — never ingested applicant data — so the evidence stays independent (charter, I3's guardrails).

## Requirements

**R1. The footprint is traced by the planner in the browser; it is never parsed or imported from an applicant's file as data.** _This doc answers the open UI-design question from `features.md`:_ a planner may optionally load an image of the site plan as an on-screen tracing aid, positioned by the planner placing at least two ground-control points — the image is never read as data (no OCR, matching `tech-stack.md`'s deliberate exclusion), and the footprint that gets analyzed is always the vector the planner traced, not anything extracted from the image.

**R2. The footprint is saved as a new geometry revision through F5's `saveGeometry`, never a special-cased write path.** This feature is a tracing workflow on top of F5's storage, not a second way to store geometry.

**R3. Placing, moving, and finishing a footprint vertex is fully operable by keyboard**, per WCAG 2.1.1 — pointer dragging is never the only way to place a vertex (`system-architecture.md`'s _Accessibility_).

**R4. The current footprint (if any) and the study area are both visible while tracing,** so a planner can see the footprint stays inside — or deliberately extends beyond — the study area they drew.

**R5. An invalid trace (self-intersecting, unclosed, or otherwise not a valid polygon) is rejected with a specific, readable reason before it reaches the server,** and again by the server's own check (F5 R7) — client-side feedback is a convenience, never the only guard.

**R6. A footprint can be redrawn at any time by saving a new revision; the previous footprint stays exactly as it was, for any analysis run that pinned it.**

**R7. Tracing a footprint never runs an impact analysis itself.** Saving a revision only makes the new revision available; `analysis` (F9) decides when to compute against it (a saved revision enqueues a run — see `decisions.md`'s save flow and `impact-analysis.md`).

## Out of scope for this feature

- Storing the geometry (F5).
- Computing what the footprint impacts (F9).
- Any parsing of a site plan file as data — explicitly excluded by R1, not deferred.

## Open items

None from round 10. R1 above closes the "open for UI design" item `features.md` listed for F8.

**Not decided:** whether planners can tag parts of the footprint as permanent or temporary (building, road, or grading versus staging or temporary access). The ecological workflow distinguishes them, and the Impact page would then report them separately. It needs more than one footprint layer per decision, so it is not in release 1. It should return only if planners ask for it.
