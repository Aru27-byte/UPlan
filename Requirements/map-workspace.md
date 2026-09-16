# Requirements — Map Workspace

**Feature:** F6
**Status:** Draft
**Serves:** I1–I5 · **Release:** 1
**Derived from:** [charter.md](charter.md) (_Output_, P1, P3), [features.md](features.md) (F6), [intents.md](intents.md) (_Across all intents_)
**Related design doc:** [TechDesign/map-workspace.md](../TechDesign/map-workspace.md)
**Builds on:** [evidence-layers.md](evidence-layers.md) (F3), [provenance.md](provenance.md) (F4), [decisions.md](decisions.md) (F5)

## Why

The map is the instrument, not the product (P3) — planners explore a decision here, but every finding that matters ends up in the report (F10). This feature is the browser workspace itself: how evidence, study area, and footprint are shown together, and how a planner gets from any layer to its provenance.

## Requirements

**R1. Every evidence layer shown on the map traces back to its provenance in one step.** Selecting or hovering a feature shows (or leads directly to) the same source, date, and confidence the provenance formatter (F4) would render elsewhere for that feature.

**R2. A boundary the profile marks as approximate is visually distinguishable from one marked regulatory,** at every zoom level it's visible — never rendered identically (P2: an approximate boundary must never _look_ like a confirmed one).

**R3. The map never implies more precision than its data has.** Rendering never adds visual crispness (e.g., pixel-snapped edges suggesting a surveyed line) beyond what the underlying feature's confidence supports.

**R4. Everything the map shows is also available as text.** Every layer, the study area, and the footprint have an accessible tabular or list equivalent on the same page — the map is one way to see the data, never the only way (WCAG; `system-architecture.md`'s _Accessibility_).

**R5. The workspace shows the decision's study area and footprint (when traced) together with every evidence layer relevant to the jurisdiction's profile,** so a planner can see all of I1–I5's inputs in one place without leaving the page.

**R6. The basemap is a static extract the operator refreshes on purpose; the workspace never silently falls back to a different basemap source when it's stale or missing.** A missing basemap tile is visibly empty, never replaced by a live third-party map (no fallback; also keeps the zero-external-service posture).

**R7. The workspace is browser-only in release 1.** Phone look-up (F15) is explicitly later; this feature does not need to support building or editing on a phone.

## Out of scope for this feature

- Ingesting or versioning the evidence itself (F3).
- Tracing the footprint (F8) and drawing the study area (F5) — this feature displays them and hosts those editors, but doesn't own their storage.
- The impact and evidence-base tables' own content (F7, F9) — F6 is where they're shown, not what they compute.

## Open items

None from round 10.
