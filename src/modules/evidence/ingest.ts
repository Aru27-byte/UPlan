import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { listOpenDecisionsIntersecting } from "@/modules/decisions";
import { db, type DbOrTx } from "@/platform/db";
import { enqueueAnalysisRun } from "@/platform/jobs";
import { putIfAbsent } from "@/platform/object-storage";

import { getDataset } from "./datasets";
import { loadWithOgr2ogr, repairAndValidate } from "./gdal";
import { dataset, datasetVersion, evidenceFeature } from "./tables";

// TechDesign/evidence-layers.md — the ingest_dataset job body (J4).

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function hasExistingVersion(datasetId: string, rawSha256: string): Promise<boolean> {
  const rows = await db
    .select({ id: datasetVersion.id })
    .from(datasetVersion)
    .where(and(eq(datasetVersion.datasetId, datasetId), eq(datasetVersion.rawSha256, rawSha256)));
  return rows.length > 0; // dataset_version_one_per_file (partial, status <> 'failed') is the real guard against a race
}

async function fetchSource(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetching ${url} failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function sourceFileName(url: string): string {
  // An empty trailing segment (a URL ending in "/") should fall back too, not just a missing one —
  // written as an explicit check rather than `||` so it doesn't read as a nullish-coalescing bug.
  const last = new URL(url).pathname.split("/").pop();
  return last && last.length > 0 ? last : "source";
}

export async function ingestDataset(datasetId: string): Promise<void> {
  const ds = await getDataset(datasetId);
  if (!ds) throw new Error(`dataset ${datasetId} not found`);

  const raw = await fetchSource(ds.sourceUrl);
  const rawSha256 = sha256(raw);

  if (await hasExistingVersion(datasetId, rawSha256)) {
    await db.update(dataset).set({ lastCheckedAt: new Date() }).where(eq(dataset.id, datasetId)); // R4: unchanged, stop
    return;
  }

  const rawObjectKey = `evidence-raw/${ds.key}/${rawSha256}/${sourceFileName(ds.sourceUrl)}`;
  await putIfAbsent("objects", rawObjectKey, raw);

  // Staged before the version row is inserted, so sourceAsOf/sourceAsOfNote is already known and
  // valid against dataset_version_date_or_note at insert time (R2 of evidence-layers.md).
  const staged = await loadWithOgr2ogr(rawObjectKey, raw);
  const sourceAsOf = ds.publisherDateAttribute
    ? staged.extractPublisherDate(ds.publisherDateAttribute)
    : null;

  const [insertedVersion] = await db
    .insert(datasetVersion)
    .values({
      datasetId,
      status: "ingesting",
      rawObjectKey,
      rawSha256,
      retrievedAt: new Date(),
      sourceAsOf,
      sourceAsOfNote: sourceAsOf ? null : ds.sourceAsOfNoteDefault,
      processingSteps: [],
    })
    .returning({ id: datasetVersion.id });
  if (!insertedVersion) throw new Error("insert into dataset_version unexpectedly returned no row");
  const versionId = insertedVersion.id;

  try {
    const { repairedCount, features } = await repairAndValidate(staged); // R6: source data only, never a planner's drawing

    await db.transaction(async (tx: DbOrTx) => {
      if (features.length > 0) {
        await tx.insert(evidenceFeature).values(
          features.map((f) => ({
            datasetVersionId: versionId,
            sourceFeatureId: f.id,
            geom: f.geom,
            attributes: f.attributes,
          })),
        );
      }
      const updated = await tx
        .update(datasetVersion)
        .set({
          status: "ready",
          confidence: ds.confidenceDefault,
          confidenceRationale: ds.confidenceRationaleDefault,
          processingSteps: [{ step: "ogr2ogr" }, { step: "repair", repairedCount }],
          featureCount: features.length,
        })
        .where(and(eq(datasetVersion.id, versionId), eq(datasetVersion.status, "ingesting")))
        .returning();
      if (updated.length === 0) return; // already finalized by a previous attempt of this same job

      await tx.update(dataset).set({ currentVersionId: versionId }).where(eq(dataset.id, datasetId));

      const affected = await listOpenDecisionsIntersecting(tx, ds.coverage);
      for (const d of affected) {
        await enqueueAnalysisRun(d.id, { purpose: "current" }, tx);
      }
    });
  } catch (err) {
    await db
      .update(datasetVersion)
      .set({ status: "failed", errorDetail: err instanceof Error ? err.message : String(err) })
      .where(and(eq(datasetVersion.id, versionId), eq(datasetVersion.status, "ingesting"))); // R7: previous ready version stays current
    throw err; // still a job failure — the health check and alarm see it (no fallback)
  }
}
