# TechDesign — Map Workspace

**Feature:** F6
**Status:** Draft
**Requirements:** [Requirements/map-workspace.md](../Requirements/map-workspace.md) (R1–R7)
**Builds on:** [system-architecture.md](system-architecture.md) (W4, D10), [evidence-layers.md](evidence-layers.md) (F3 tiles), [provenance.md](provenance.md) (F4)
**Release:** 1

## Where this lives

UI only — no module. Routes and components on top of `evidence`, `decisions`, and `provenance`:

```
src/app/decisions/[decisionId]/map/page.tsx     Server Component: loads decision, jurisdiction's current
                                                 profile (for layer definitions and mapStatus), the latest
                                                 study area/footprint, and — per evidence layer — the
                                                 dataset version id and its formatted provenance (F4, called
                                                 server-side per provenance.md's boundary note)
src/ui/map-workspace.client.tsx                  MapLibre GL map: basemap + evidence tiles + study area/footprint
src/ui/layer-panel.client.tsx                     layer toggle list, each entry showing mapStatus styling and a
                                                  "view provenance" affordance
src/ui/evidence-text-view.tsx                      the R4 text equivalent — a plain table, not a client component,
                                                  so it needs no JavaScript to be readable
```

## Layers and provenance (R1, R5)

The Server Component resolves, for the jurisdiction's current profile, one MapLibre vector source per resource type mapped by `evidence.jurisdiction_dataset` (F3), pointed at `/api/tiles/{datasetVersionId}/{z}/{x}/{y}` (F3's immutable tile route). It also fetches each dataset version's `EvidenceProvenance` fields and calls `formatEvidenceProvenance` (F4) once per layer, passing the plain `FormattedProvenance` strings as props into `layer-panel.client.tsx` — the client component never imports `@/modules/provenance` itself (per the import boundary; see `provenance.md`).

- **R1:** clicking a rendered feature opens a popup keyed by the feature's `dataset_version_id` + `source_feature_id`, showing that layer's already-formatted provenance strings (passed down, not re-fetched) — one step from map to source, never more.
- **R5:** the same page renders the study area and footprint (F5/F8) as additional MapLibre layers, sourced from the Server Component's props (already-fetched GeoJSON), alongside every mapped evidence layer for the jurisdiction — one workspace, not a page per layer.

## Approximate boundaries and precision (R2, R3)

`layer-panel.client.tsx` reads each resource type's `mapStatus` (`"regulatory" | "approximate"`, from the current profile document, F1) and maps it to a fixed MapLibre paint style pair defined once in `src/ui/map-styles.ts`:

```ts
export const RESOURCE_TYPE_PAINT = {
  regulatory: { "fill-opacity": 0.35, "fill-color": REGULATORY_COLOR },
  approximate: {
    "fill-opacity": 0.35,
    "fill-color": APPROXIMATE_COLOR,
    "fill-pattern": "hatch-diagonal", // a small pattern sprite, loaded once at map init
  },
} as const;
```

- **R2:** `approximate` always renders with the hatch pattern _and_ a distinct color — never color alone, so it survives grayscale printing/color-vision differences too, and the pairing is fixed in one file so no layer can be wired up without it.
- **R3:** every evidence layer's line/fill uses MapLibre's anti-aliased default rendering (no `raster-resampling: nearest` or pixel-snapping); no styling rule sharpens a line beyond what `ST_AsMVT`'s tile resolution actually carries. Zoom levels beyond a dataset's practical resolution show a fixed "zoomed past source resolution" badge (a static threshold per dataset, set alongside its confidence at registration in F3) rather than letting the vector tile appear falsely crisp.

## Text equivalent (R4)

`evidence-text-view.tsx` is a plain server-rendered table (no client JavaScript) on the same page, listing every layer's features intersecting the study area (attributes + the same formatted provenance), the study area's and footprint's vertex-count/area summary, and a link-anchor per map layer so a screen-reader or keyboard user can jump straight to that layer's text form. It is not a fallback for a broken map — it is always present, alongside the map, per WCAG.

## Basemap (R6, R7)

The basemap is the Protomaps `pmtiles` extract Caddy serves from the VM's disk (D10); `map-workspace.client.tsx` points MapLibre's `raster`/`vector` basemap source at that one static URL and nothing else. There is no second basemap source configured anywhere, so there is nothing to "fall back" to — a missing basemap tile renders as empty map background, which is visible and honest rather than silently substituted (R6; no-fallback rule).

Release 1 ships one responsive layout that works down to phone width, but F6's _workflows_ (tracing, editing) require the full editor components, which are not rendered on the phone breakpoint in release 1 — F15 (later) is what turns this into a deliberate look-up-only phone mode. R7 just states that no phone-specific reduced view is required yet.

## Verification

- Playwright end-to-end (`tests/e2e/`): load the map workspace, confirm every toggled layer's tile requests succeed, click an approximate-boundary feature and assert the popup's provenance text matches the text view's row for the same feature (R1); toggle every layer and assert `layer-panel` styling classes match `RESOURCE_TYPE_PAINT` for its `mapStatus` (R2); run `@axe-core/playwright` against the page including the text view (R4), and at a phone-width viewport (R7).
- No unit or integration tests beyond `map-styles.ts`'s pure style-lookup function, since this feature holds no domain logic of its own.
