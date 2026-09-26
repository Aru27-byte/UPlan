# TechDesign — Proposal Footprint

**Feature:** F8
**Status:** Draft
**Requirements:** [Requirements/proposal-footprint.md](../Requirements/proposal-footprint.md) (R1–R7)
**Builds on:** [decisions.md](decisions.md) (`saveGeometry`), [map-workspace.md](map-workspace.md) (F6 — the map this tracing UI runs inside), [tech-stack.md](tech-stack.md) (D10)
**Release:** 1

## Where this lives

No new module. This is a route + client component built entirely on `decisions.saveGeometry(kind: "footprint")` (F5):

```
src/app/(app)/projects/[projectId]/footprint/page.tsx        Server Component: loads decision, study area,
                                                          latest footprint revision; renders the client editor
src/ui/footprint-editor.client.tsx                        MapLibre + Terra Draw + keyboard tracing (R3)
src/ui/reference-overlay.client.tsx                        optional site-plan image overlay (R1)
```

## Tracing (R2, R4, R5, R6, R7)

`footprint-editor.client.tsx` renders the study area (read-only, from the Server Component's props — already-fetched GeoJSON, never re-fetched by the client component itself, per R4) beneath an editable Terra Draw polygon layer for the footprint. "Save" calls a Server Function that invokes `decisions.saveGeometry(actor, decisionId, "footprint", geojson, sourceNote, expectedRevision)` (F5) directly — there is no separate footprint table or write path (R2).

- **R5:** before the Save Server Function is even called, the client runs a lightweight self-intersection/closure check (a small pure function shared as a `import type`-safe utility, not a `@/modules` import — see _Boundary_ below) and disables Save with an inline reason until the trace is valid. The server's own `ST_IsValid` check (F5 R7) still runs and is the actual guard; the client check only saves a round trip.
- **R6:** every Save is a new revision (F5's compare-and-set); there is no "edit in place" — Undo/Redo inside one tracing session only manipulates the in-progress, unsaved shape.
- **R7:** saving calls only `saveGeometry`. Enqueuing `run_analysis` happens inside `decisions`' save path when a footprint revision is saved for a decision that already has a study area (see `impact-analysis.md`'s run triggers) — this route never calls `analysis` directly, keeping F8 a thin tracing workflow.

## Keyboard operability (R3)

Terra Draw's pointer-drag mode is the primary interaction, but placing a vertex must not _require_ a pointer. `footprint-editor.client.tsx` adds a keyboard mode alongside it:

- Tab into the map focuses a visible crosshair over the map's current center.
- Arrow keys move the crosshair by one map pixel; Shift+Arrow moves it by 10.
- Enter places a vertex at the crosshair's map coordinate and starts/extends the in-progress polygon.
- Backspace removes the last placed vertex.
- A visible, keyboard-reachable "Finish shape" button (not a keyboard shortcut alone, so it's discoverable) closes the polygon, equivalent to double-click in pointer mode.
- Escape cancels the in-progress trace.

This is a small custom keyboard handler layered on Terra Draw's feature collection state, not a Terra Draw built-in — Terra Draw's pointer modes stay as the primary experience, and the keyboard path is the accessible equivalent WCAG 2.1.1 requires, exercised by its own end-to-end test (see _Verification_).

## Reference image overlay (R1)

A planner may pick a local image file (the site plan). It is:

- Rendered client-side only, as a MapLibre `ImageSource` the planner positions by dragging two labeled control-point handles onto known ground locations (or typing coordinates) — a simple affine fit, computed in the browser.
- **Never uploaded to the server, never stored, never parsed.** It exists only in that browser tab for that tracing session. This is a deliberate scope cut (not a deferral): persisting it would need an upload endpoint, an object-storage key, a table row, and validation for a file that is explicitly not evidence and not required for any requirement above — "less code" (`.claude/rules/best-practices.md`) favors the client-only convenience over building server-side plumbing for a file nothing analyzes. If planners need it to persist across sessions, that is a future decision documented as a revisit, not built now.
- The overlay is visual only; R1 is satisfied structurally because there is no code path anywhere that reads pixels from this image into a geometry or an attribute.

## Boundary note

`reference-overlay.client.tsx` and `footprint-editor.client.tsx` are `*.client.tsx` files: per `.claude/rules/file-structure-and-imports.md`, they import no runtime code from `@/modules` or `@/platform`. The client-side validity pre-check (R5) is a small, self-contained geometry function (e.g., a shoelace/self-intersection check) that lives in `src/ui/` as plain TypeScript with no module dependency — it duplicates a cheap check for UX only; the authoritative check stays server-side in `decisions.saveGeometry` (F5 R7), so the two can never disagree in a way that matters.

## Verification

- Unit test (in `src/ui/`, no DOM): the shoelace/self-intersection pre-check function against fixture rings (valid, self-intersecting, unclosed).
- Playwright end-to-end test (`tests/e2e/`): trace a footprint entirely by keyboard (Tab, Arrow, Enter, Finish shape, Save) and assert the saved revision matches the traced coordinates; trace and save a second revision and assert the first is still readable at its own revision number (R6); attempt to save a self-intersecting shape and assert the inline reason appears and Save stays disabled (R5) — this spec runs `@axe-core/playwright` against the tracing page per the testing rules, at a phone-width viewport as well as desktop.
- No integration test is needed here beyond F5's own (`decisions.test.ts`), since this feature adds no server-side logic.
