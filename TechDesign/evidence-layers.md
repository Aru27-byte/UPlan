# TechDesign — Evidence Layers

**Feature:** F3 · `evidence`
**Status:** Draft
**Requirements:** [Requirements/evidence-layers.md](../Requirements/evidence-layers.md) (R1–R12)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Dataset refresh_, D10, D11), [data-model.md](data-model.md) (`dataset`, `dataset_version`, `evidence_feature`, `jurisdiction_dataset`)
**Release:** 1

## Module

```
src/modules/evidence/
  index.ts        public API
  tables.ts        dataset, dataset_version, evidence_feature, jurisdiction_dataset
  datasets.ts       createDataset, getDataset, mapToJurisdiction
  ingest.ts         ingestDataset (the ingest_dataset job body)
  tiles.ts          mvtTile(datasetVersionId, z, x, y) -> bytes, for the route handler
  *.test.ts
```

## Registering a dataset and mapping it (R1, R8)

```ts
// datasets.ts
export async function createDataset(actor: Actor, input: NewDataset): Promise<Dataset> {
  requireStaff(actor);
  if (!FREE_PUBLIC_LICENSES.has(input.license)) {
    throw new ValidationError(`"${input.license}" is not a recognized free public license`); // R1
  }
  return db.insert(dataset).values(input).returning();
}

export async function mapToJurisdiction(
  actor: Actor,
  jurisdictionId: string,
  datasetId: string,
  resourceTypeKey: string,
  attributeMap: Record<string, string>,
): Promise<void> {
  requireStaff(actor);
  await db
    .insert(jurisdictionDataset)
    .values({ jurisdictionId, datasetId, resourceTypeKey, attributeMap })
    .onConflictDoUpdate({
      target: [jurisdictionDataset.jurisdictionId, jurisdictionDataset.datasetId],
      set: { resourceTypeKey, attributeMap },
    });
}
```

`FREE_PUBLIC_LICENSES` is a short allow-list (e.g., public domain, CC0, CC-BY, ODbL) checked at registration time, not re-validated per feature — R1 is enforced once, where the dataset enters the system.

**R12:** `NewDataset` is a Zod schema whose `authority` and `spatialPrecision` are required literal unions, matching the `check` lists on the two `dataset` columns (see `evidence-review.md` for the columns and the migration that fills them for existing datasets). Omitting either fails validation at registration, and the columns are `not null` with no default.

**R13:** `dataset.is_sample boolean not null default false`. `NewDataset` gains an optional `isSample` that is `true` only when `installSampleEvidence` (F23) creates the dataset, and `false` for everything `ingestDataset` and staff registration produce. `EvidenceProvenance` carries `isSample`, and `formatEvidenceProvenance` prefixes the source line with `Sample data (illustrative) — ` when it is true, so no page or export decides this on its own (`provenance.md` R6). The default is `false` because that is the truth for every dataset that isn't sample data, not a stand-in for missing information.

## Ingestion (`ingest_dataset`, R4, R5, R6, R7)

```ts
// ingest.ts
export async function ingestDataset(datasetId: string): Promise<void> {
  const ds = await getDataset(datasetId);
  const raw = await fetchSource(ds.sourceUrl); // network fetch; max_attempts 5, per architecture
  const rawSha256 = sha256(raw);

  if (await hasVersion(datasetId, rawSha256)) {
    await touchLastChecked(datasetId); // R4: unchanged — stop, no new version
    return;
  }

  const rawObjectKey = `evidence-raw/${ds.key}/${rawSha256}/${sourceFileName(ds.sourceUrl)}`;
  await objectStorage.putIfAbsent(rawObjectKey, raw);

  const versionId = await db.transaction((tx) =>
    tx
      .insert(datasetVersion)
      .values({
        datasetId,
        status: "ingesting",
        rawObjectKey,
        rawSha256,
        retrievedAt: sql`now()`,
        sourceAsOf: ds.publisherDateField ? extractPublisherDate(raw) : null,
        sourceAsOfNote: ds.publisherDateField ? null : ds.noDateNote, // R2
        processingSteps: [],
      })
      .returning({ id: datasetVersion.id }),
  );

  try {
    const staged = await loadWithOgr2ogr(rawObjectKey, ds.sourceFormat); // GDAL, in the worker image
    const { repairedCount, features } = await repairAndValidate(staged); // R6: repair source geometry only
    await db.transaction(async (tx) => {
      for (const f of features) {
        await tx.insert(evidenceFeature).values({
          datasetVersionId: versionId,
          sourceFeatureId: f.id,
          geom: f.geom,
          attributes: f.attributes,
        });
      }
      await tx
        .update(datasetVersion)
        .set({
          status: "ready",
          confidence: ds.confidence,
          confidenceRationale: ds.confidenceRationale, // R3
          processingSteps: [{ step: "ogr2ogr" }, { step: "repair", repairedCount }],
          featureCount: features.length,
        })
        .where(and(eq(datasetVersion.id, versionId), eq(datasetVersion.status, "ingesting")));
      await db
        .update(dataset)
        .set({ currentVersionId: versionId }) // moves under the same transaction
        .where(eq(dataset.id, datasetId));
      const affected = await listOpenDecisionsIntersecting(tx, ds.coverage); // decisions module
      for (const d of affected) await enqueueAnalysisRun(d.id, { purpose: "current" }, tx);
    });
  } catch (err) {
    await db
      .update(datasetVersion)
      .set({ status: "failed", errorDetail: String(err) }) // R7
      .where(and(eq(datasetVersion.id, versionId), eq(datasetVersion.status, "ingesting")));
    throw err; // still a job failure — the health check and the alarm see it (no fallback)
  }
}
```

- **R4:** `dataset_version_one_per_file` (unique on `(dataset_id, raw_sha256)` where `status <> 'failed'`) makes a duplicate hash a database-enforced no-op path, not just an application check — `hasVersion` is a plain existence read before the insert, and the partial unique index is the actual guard against a race between two scheduled refreshes.
- **R5:** the new version is inserted `ingesting` and only ever transitions to `ready` or `failed`; nothing updates a `ready` version (the `dataset_version_final` trigger in `data-model.md` blocks it at the database level too).
- **R6:** `repairAndValidate` runs `ST_MakeValid` (or GDAL's equivalent) only on freshly staged source rows, before they become `evidence_feature` rows, and records how many were repaired in `processing_steps`. This is a source-ingestion step, never applied to a planner's drawn geometry (`decisions` module rejects invalid drawings outright, per `decisions.md`).
- **R7:** the failed branch never touches `dataset.current_version_id` — the previous ready version stays current, and the failed row (with `error_detail`) is queried alongside it by every view that shows the dataset's status (R7's "shown plainly beside it").
- **R8:** `mapToJurisdiction`'s `attributeMap` is the only place a source's field names (e.g., `WETLAND_TY`) become a rule's attribute names (e.g., `wetlandRating`) — `analysis` reads `attributes` through this map, never assuming a source's raw field name.

## What a dataset can't show (R10)

`dataset.known_limitation` is a nullable text column set at registration, for example "canopy extent only; individual trunk diameters can't be determined". It is a fact about the dataset, recorded once. `collectLimits` in the run (F7 R7) reads it and adds one `Limit` per affected resource type, and it appears in the data-quality panel (F19 R6) and the document. No per-decision inference is involved.

## Coverage and gaps (R11)

`dataset.coverage` is a `MultiPolygon` set at registration time from the publisher's own stated extent (e.g., a county boundary), not derived from the features ingested. `evidence-base.md` (F7) intersects a decision's study area against `coverage` to produce a `Gap` with reason `"coverage-excludes-study-area"` when it falls outside, versus `"no-dataset-mapped"` when no dataset maps to that resource type at all — this feature only guarantees `coverage` is present and accurate so F7 can tell the two apart (R11).

## Tiles (R9)

```ts
// tiles.ts — called by a route handler in src/app/, e.g. /api/tiles/[datasetVersionId]/[z]/[x]/[y]
export async function mvtTile(datasetVersionId: string, z: number, x: number, y: number): Promise<Buffer> {
  const [{ mvt }] = await db.execute(sql`
    select ST_AsMVT(tile, 'layer', 4096, 'geom') as mvt from (
      select ST_AsMVTGeom(geom, ST_TileEnvelope(${z}, ${x}, ${y}), 4096, 64, true) as geom, attributes
      from evidence_feature where dataset_version_id = ${datasetVersionId}
        and geom && ST_TileEnvelope(${z}, ${x}, ${y})
    ) as tile`);
  return mvt;
}
```

The route sets a long, immutable `Cache-Control` header because the URL already names the dataset version (R9) — this is the one cached response in the whole system, matching `tech-stack.md`'s "version-addressed tiles are the one cached response, because they never change."

## Verification

- Unit tests: license allow-list rejection (R1); a `NewDataset` missing `authority` or `spatialPrecision`, or with a value outside the lists, is rejected (R12); `attributeMap` application logic; coverage-vs-gap classification logic used by F7 (a pure function here, consumed there).
- Testcontainers integration tests: a second ingest of byte-identical content creates no new version (R4, with a race test — two concurrent refreshes of the same source, asserting one `ready` version); a failing ingest (a fixture that fails `ST_IsValid` even after repair, or a corrupt file) leaves the previous version current and records `error_detail` (R7); `mvtTile` against fixture features returns valid MVT bytes for a tile that intersects them and empty bytes for one that doesn't; `ingestDataset` enqueues `run_analysis` only for open decisions whose study area intersects `coverage`.
- Golden fixtures: a small hand-built shapefile/GeoJSON with one intentionally invalid polygon exercises the repair path end to end, asserting the exact `repairedCount`.
