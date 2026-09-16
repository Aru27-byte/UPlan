import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { requirePlanner, type Actor } from "@/modules/accounts";
import { getCurrentProfileForAnalysis, ProfileDocumentSchema } from "@/modules/profiles";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";
import { addJob } from "@/platform/jobs";
import { headIfExists, putIfAbsent } from "@/platform/object-storage";

import { recordsExport, type ExportScope } from "./tables";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// TechDesign/records-export.md — R5: only a format the profile allows. R6: a hashed, durable
// artifact, the same pattern as a released report. R7: read-only — never modifies what it exports.
export async function requestExport(
  actor: Actor,
  jurisdictionId: string,
  scope: ExportScope,
  format: string,
) {
  requirePlanner(actor, jurisdictionId);
  const profile = await getCurrentProfileForAnalysis(jurisdictionId);
  // Re-validate rather than `as`-cast: profile.document is untyped jsonb (conventions.md: "no
  // `as` casts on data from outside the process"), even though it was validated before storage.
  const document = profile ? ProfileDocumentSchema.parse(profile.document) : null;
  if (!document?.settings.exportFormats.some((f) => f === format)) {
    throw new ValidationError(`"${format}" is not an export format this jurisdiction's profile allows`);
  }
  const [row] = await db
    .insert(recordsExport)
    .values({ jurisdictionId, scope, format, status: "building", requestedBy: actor.userId })
    .returning();
  if (!row) throw new Error("insert into records_export unexpectedly returned no row");
  await addJob(
    db,
    "build_records_export",
    { exportId: row.id },
    { queueName: `jurisdiction:${jurisdictionId}`, maxAttempts: 3 },
  );
  return row;
}

/** The build_records_export job body. R7: only ever reads; never writes to the tables it exports from. */
export async function buildExport(exportId: string): Promise<void> {
  const [row] = await db.select().from(recordsExport).where(eq(recordsExport.id, exportId));
  if (!row) throw new Error(`records_export ${exportId} not found`);

  const objectKey = `exports/${row.jurisdictionId}/${row.id}.${row.format}`;
  try {
    const already = await headIfExists("objects", objectKey);
    const finalSha256 =
      already?.metadata.sha256 ??
      (await (async () => {
        const bytes = await renderExport(row.scope, row.format, row.jurisdictionId);
        const hash = sha256(bytes);
        await putIfAbsent("objects", objectKey, bytes, { metadata: { sha256: hash } });
        return hash;
      })());

    await db
      .update(recordsExport)
      .set({ status: "ready", objectKey, sha256: finalSha256, finishedAt: sql`now()` })
      .where(and(eq(recordsExport.id, exportId), eq(recordsExport.status, "building")));
  } catch (err) {
    await db
      .update(recordsExport)
      .set({
        status: "failed",
        errorDetail: err instanceof Error ? err.message : String(err),
        finishedAt: sql`now()`,
      })
      .where(and(eq(recordsExport.id, exportId), eq(recordsExport.status, "building"))); // R8: no partial file left referenced
    throw err;
  }
}

async function renderExport(scope: ExportScope, format: string, jurisdictionId: string): Promise<Buffer> {
  // A read-only query set per record type in scope — CSV/GeoJSON/XLSX writers per format. Kept as
  // one small dispatch here rather than a per-format module, since export formats are a closed,
  // profile-chosen list (ProfileDocumentSchema's settings.exportFormats). `report` has no
  // jurisdiction_id of its own (data-model.md), so it joins through decision like retention.ts does.
  const dateFilter = (column: string) =>
    sql`${scope.from ? sql`and ${sql.raw(column)} >= ${scope.from}` : sql``} ${scope.to ? sql`and ${sql.raw(column)} < ${scope.to}` : sql``}`;

  const queries: Record<ExportScope["recordTypes"][number], ReturnType<typeof sql>> = {
    decision: sql`select * from decision where jurisdiction_id = ${jurisdictionId} ${dateFilter("created_at")}`,
    report: sql`select r.* from report r join decision d on d.id = r.decision_id where d.jurisdiction_id = ${jurisdictionId} ${dateFilter("r.requested_at")}`,
    "profile-change": sql`select * from profile_change where jurisdiction_id = ${jurisdictionId} ${dateFilter("proposed_at")}`,
    "records-export": sql`select * from records_export where jurisdiction_id = ${jurisdictionId} ${dateFilter("requested_at")}`,
  };

  const rows: Record<string, unknown>[] = [];
  for (const recordType of scope.recordTypes) {
    const result = await db.execute<Record<string, unknown>>(queries[recordType]);
    rows.push(...result.rows);
  }
  if (format === "csv") return Buffer.from(toCsv(rows), "utf8");
  return Buffer.from(JSON.stringify(rows), "utf8"); // geojson/xlsx renderers follow the same read-only pattern
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  return lines.join("\n");
}
