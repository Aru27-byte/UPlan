# TechDesign — Impact Analysis

**Feature:** F9 · `analysis` · _the pilot's edge_
**Status:** Draft
**Requirements:** [Requirements/impact-analysis.md](../Requirements/impact-analysis.md) (R1–R12)
**Builds on:** [evidence-base.md](evidence-base.md) (F7 — `runAnalysis`, pinning, `results.ts`), [system-architecture.md](system-architecture.md) (_Impact engine_, D9)
**Release:** 1

## Where this lives

`src/modules/analysis/impact.ts`, called by `run.ts`'s `runAnalysis` (see `evidence-base.md`) as `computeImpacts(rules, mappings, footprintGeom)` when a footprint revision is pinned.

## Measuring mapped features (R1, R2, R8)

```ts
export async function computeImpacts(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  footprintGeom: Geometry,
  srid: number,
): Promise<Impact[]> {
  const impacts: Impact[] = [];
  for (const resourceType of rules.resourceTypes) {
    for (const m of mappings.filter((x) => x.resourceTypeKey === resourceType.key)) {
      const rows = await sql`
        select source_feature_id, ST_GeometryType(geom) as geom_type, attributes,
          ST_Area(ST_Transform(ST_Intersection(geom, ${footprintGeom}), ${srid})) as area,
          ST_Length(ST_Transform(ST_Intersection(geom, ${footprintGeom}), ${srid})) as length
        from evidence_feature
        where dataset_version_id = ${m.dataset.currentVersionId} and ST_Intersects(geom, ${footprintGeom})`; // R8: PostGIS only

      for (const r of rows) {
        const measure = isLineType(r.geom_type) ? "feature-length-in-footprint" : "feature-area-in-footprint";
        const value = measure === "feature-length-in-footprint" ? r.length : r.area;
        impacts.push({
          impactKey: `${resourceType.key}:${m.dataset.key}:${r.source_feature_id}:${measure}`,
          resourceType: resourceType.key,
          measure,
          unit: measure === "feature-length-in-footprint" ? "us-survey-ft" : "us-survey-sq-ft",
          min: value,
          max: value,
          dependsOn: null, // no rule condition on a raw feature measurement
          approximate: resourceType.mapStatus === "approximate", // R4
          ruleKeys: [],
          evidence: [{ datasetVersionId: m.dataset.currentVersionId, sourceFeatureId: r.source_feature_id }],
        });
      }
    }
  }
  return impacts.concat(await computeBufferImpacts(rules, mappings, footprintGeom, srid));
}
```

- **R1:** the query runs for every resource type × mapping, so a resource type with zero intersecting rows simply contributes zero `Impact` entries for that resource type — the results document still names the resource type in its inputs (via `evidence.jurisdiction_dataset`, checkable from the run's pinned mappings), so "nothing here" is distinguishable from "not evaluated," matching R7's _evidence base_ Gap concept for the resource-type level and R1's "still appears, at zero" for the feature level: the impact table (F10, F6) renders one row per resource type regardless of whether any `Impact` entries exist for it, showing an explicit zero when none do.
- **R2:** `evidence` on each `Impact` is exactly the `{datasetVersionId, sourceFeatureId}` pairs `provenance.md`'s `DerivedProvenance.evidence` expects; `ruleKeys` (filled in by the buffer path below, and by rule-only impacts such as study triggers in later features) is what resolves to `DerivedProvenance.rules`.
- **R8:** every number here is a PostGIS `ST_Area`/`ST_Length` result after `ST_Transform` to `srid` (the jurisdiction's `analysis_srid`, EPSG:2926 for Sammamish, in US survey feet per `tech-stack.md`). No JavaScript arithmetic touches a coordinate.

## Buffers, and the attribute-dependent range (R3, R9)

```ts
async function computeBufferImpacts(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  footprintGeom: Geometry,
  srid: number,
): Promise<Impact[]> {
  const impacts: Impact[] = [];
  for (const buffer of rules.bufferRules) {
    const resourceType = rules.resourceTypes.find((r) => r.key === buffer.resourceType)!;
    for (const m of mappings.filter((x) => x.resourceTypeKey === buffer.resourceType)) {
      const rows = await sql`
        select source_feature_id, attributes,
          ST_Area(ST_Transform(ST_Intersection(
            ST_Buffer(ST_Transform(geom, ${srid}), ${buffer.widthFt}), ST_Transform(${footprintGeom}, ${srid})
          ), ${srid})) as buffered_area
        from evidence_feature
        where dataset_version_id = ${m.dataset.currentVersionId}
          and ST_DWithin(ST_Transform(geom, ${srid}), ST_Transform(${footprintGeom}, ${srid}), ${buffer.widthFt})`; // R8

      for (const r of rows) {
        if (r.buffered_area === 0) continue; // an honest zero — nothing to report (best-practices: true empty state)
        const applicability = buffer.appliesWhen
          ? evaluateAppliesWhen(buffer.appliesWhen, r.attributes, m.attributeMap)
          : "always";
        // applicability: "yes" | "no" | "unknown" (attribute missing from this feature's evidence)

        if (applicability === "no") continue;
        const [min, max, dependsOn] =
          applicability === "unknown"
            ? [0, r.buffered_area, buffer.appliesWhen!.attribute] // R3: the rule might not apply — range brackets both
            : [r.buffered_area, r.buffered_area, null];

        impacts.push({
          impactKey: `${resourceType.key}:${m.dataset.key}:${r.source_feature_id}:buffer-area-in-footprint:${buffer.key}`,
          resourceType: resourceType.key,
          measure: "buffer-area-in-footprint",
          unit: "us-survey-sq-ft",
          min,
          max,
          dependsOn,
          approximate: resourceType.mapStatus === "approximate",
          ruleKeys: [buffer.key],
          evidence: [{ datasetVersionId: m.dataset.currentVersionId, sourceFeatureId: r.source_feature_id }],
        });
      }
    }
  }
  return impacts;
}
```

- **R9:** `evaluateAppliesWhen` reads the feature's `attributes` through `m.attributeMap` (F3) for `appliesWhen.attribute`; when the mapped attribute name is present and equals `appliesWhen.equals`, the buffer applies (`"yes"`); present and different, it doesn't (`"no"`, skipped); **absent entirely**, applicability is `"unknown"` and R3's range applies — the buffer is never assumed to apply universally, and never assumed absent, when the evidence simply lacks the attribute.
- **R3:** the only place a range (`min !== max`) is produced is exactly this "unknown" branch. `dependsOn` names the missing attribute so the impact table and report can state _what_ would resolve the range (charter: "compute the range rather than assuming a value").
- **R8:** `ST_DWithin` (in the analysis SRID, so `widthFt` is literal feet) finds candidate features whose buffer could reach the footprint even if the feature itself doesn't intersect it — a stream well outside the footprint whose 100 ft buffer clips a corner is exactly the case this is for.

## Significant trees and canopy (R5)

`forest-canopy` is measured like any other resource type by `computeImpacts` above (a `feature-area-in-footprint` impact) — canopy extent is legitimate desk-analysis evidence. `treeRules` (`significant-tree`, `removal-cap`) are **never read by this engine**: there is no code path from a `TreeRule` entry to an `Impact` value, because DBH and individual-tree counts aren't in any evidence dataset (charter, _Known limits_). `run.ts`'s `collectLimits` (see `evidence-base.md`) always adds `{ key: "significant-trees-not-countable", resourceType: "forest-canopy" }` to every run whose jurisdiction has tree rules, regardless of the footprint — R5 is a structural omission, not a runtime check that could be bypassed.

## No verdict (R6)

`Impact`'s type (`data-model.md`) has no field for a judgment — only `measure`, `unit`, `min`/`max`, `dependsOn`, `approximate`, `ruleKeys`, `evidence`. There is no severity, threshold-comparison, or pass/fail anywhere in `impact.ts`, and no free-text field a future change could quietly repurpose for one (R6; enforced by the type shape itself, the same technique `code-tracking`'s JSON-Schema-grammar design later uses for the same reason).

## Showing an impact (R10, R11, R12)

`impact/page.tsx` stays a Server Component and reads the run for the project's current inputs from `getWorkflow` (`facts.run`, present only when the analysis status is current; see `decision-overview.md` and `research-phases.md`), so it never shows results for inputs the project no longer holds. Each impact card is built from data the run already stores:

- **R10:** `ruleKeys` resolve against the profile version the run pinned, so the card lists each rule's code section and effective date through the provenance formatter, even if the profile has changed since. `evidence` resolves through `formatDerivedProvenance` (F4) to the datasets and the feature ids behind the number. Both lists sit under the quantity on the card, collapsed by default, and are also present as text for a screen reader. Nothing new is stored.
- **R11:** `describeImpact(impact, footprintRevision)` in `analysis` is a fixed template with numbers passed through the display formatter: "Footprint revision {n} overlaps {quantity} of {resource}." A range reads "between {min} and {max}, depending on {attribute}". The function's input type has no free text, and a denylist test covers its output like the report's (R6).
- **R12:** the page header states the run's study area and footprint revisions, its profile version, and each `rules_resolved_for` date, then the `AnalysisStatus`. For `out-of-date` or `failed` it says so above the cards and lists what changed. The cards remain visible because they describe the older run, and they are labelled with it. This is the "stale data shown beside its failure" case the rules allow, never a silent swap.
- The one sentence about indirect and cumulative effects is a fixed string, not generated text.

## Determinism (R7)

`results.ts` (shared with F7) sorts `impacts` by `impactKey` before storing — a stable, content-derived key, not insertion order — so two runs against identical pinned inputs produce byte-identical arrays regardless of how PostGIS orders rows internally.

## Verification

- Golden fixture tests (Testcontainers, hand-checked geometries per the testing rules): a footprint fully containing a mapped polygon feature yields its exact known area; a footprint clipping a mapped line feature yields the exact known length; a buffer-only case (feature outside the footprint, buffer reaching in) yields the exact known buffered-and-clipped area; a buffer with `appliesWhen` against a feature missing that attribute yields `min = 0` and `max` equal to the fixture's hand-computed buffer area, with `dependsOn` set (R3); a buffer with the attribute present and non-matching yields no impact row at all.
- A determinism test runs the same fixture inputs twice and asserts byte-identical `impacts` arrays (R7).
- Unit tests for `describeImpact`: a single value, a range with `dependsOn`, and a zero, each asserting the exact sentence, and a denylist check for verdict words (R6, R11). Playwright: the Impact page shows each card's rule citations and evidence provenance, states the run it shows, and shows the out-of-date note after a study area edit (R10, R12), with an axe check.
- A unit test enumerates every field of `Impact` and asserts none of them is free text a caller could put a verdict into (R6, a static shape-level guard alongside code review).
- An integration test asserts `treeRules` never appear in any SQL executed by `impact.ts` (grep-based, as a canary) and that `collectLimits` always includes `significant-trees-not-countable` when the profile has any `treeRules` (R5).
