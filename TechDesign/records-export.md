# TechDesign — Records Retention and Export

**Feature:** F16 · `records`
**Status:** Draft
**Requirements:** [Requirements/records-export.md](../Requirements/records-export.md) (R1–R8)
**Builds on:** [data-model.md](data-model.md) (`retention_flag`, `records_export`), [system-architecture.md](system-architecture.md) (J6)
**Release:** 1

## Module

```
src/modules/records/
  index.ts        public API
  tables.ts         retention_flag, records_export
  retention.ts       flagRetention (job J6a), reviewFlag
  export.ts          requestExport, buildExport (job J6b)
  *.test.ts
```

## Flagging (R1, R2, R3, R4)

```ts
// retention.ts — flag_retention job, daily per jurisdiction
export async function flagRetention(jurisdictionId: string): Promise<void> {
  const hasRealApplication = await anyDecisionWithFilingDate(jurisdictionId); // R2
  if (!hasRealApplication) return; // nothing to flag until a real application exists

  const profile = await getCurrentProfile(jurisdictionId);
  if (!profile) return;

  for (const setting of profile.document.settings.retention) {
    // R1: the city's own setting, never assumed
    for (const record of await listRecordsOfType(jurisdictionId, setting.recordType)) {
      const baseDate = setting.countFrom === "created" ? record.createdAt : record.reportReleasedAt;
      if (!baseDate) continue; // e.g. countFrom = report-released, but no report yet — not eligible to flag
      await db
        .insert(retentionFlag)
        .values({
          jurisdictionId,
          recordType: setting.recordType,
          recordId: record.id,
          eligibleOn: addYears(baseDate, setting.retainYears),
        })
        .onConflictDoNothing(); // unique (record_type, record_id): flagging is idempotent, R3-safe to rerun daily
    }
  }
}

export async function reviewFlag(actor: Actor, flagId: string, outcome: "keep" | "dispose", note: string) {
  const flag = await getFlag(flagId);
  requireReviewer(actor, flag.jurisdictionId); // a compliance judgment, not a routine planner action
  const updated = await db
    .update(retentionFlag)
    .set({ reviewedBy: actor.userId, reviewedAt: sql`now()`, outcome })
    .where(and(eq(retentionFlag.id, flagId), isNull(retentionFlag.reviewedAt))) // compare-and-set: reviewed once
    .returning();
  if (updated.length === 0) throw new ConflictError("this flag was already reviewed");
  return updated[0];
  // R3, R4: this function only ever writes reviewedBy/reviewedAt/outcome. Nothing here deletes a
  // decision, report, profile_change, or export row — a "dispose" outcome records a decision for the
  // city's own records process; it is explicitly out of scope for UPlan to act on (see the Requirements doc).
}
```

## Building an export (R5, R6, R7, R8)

```ts
// export.ts
export async function requestExport(
  actor: Actor,
  jurisdictionId: string,
  scope: ExportScope,
  format: string,
) {
  requirePlanner(actor, jurisdictionId);
  const profile = await getCurrentProfile(jurisdictionId);
  if (!profile?.document.settings.exportFormats.includes(format)) {
    throw new ValidationError(`"${format}" is not an export format this jurisdiction's profile allows`); // R5
  }
  const [row] = await db
    .insert(recordsExport)
    .values({
      jurisdictionId,
      scope,
      format,
      status: "building",
      requestedBy: actor.userId,
    })
    .returning();
  await addJob(
    db,
    "build_records_export",
    { exportId: row.id },
    { queueName: `jurisdiction:${jurisdictionId}`, maxAttempts: 3 },
  );
  return row;
}

export async function buildExport(exportId: string): Promise<void> {
  const row = await getExportForBuild(exportId); // status must be 'building'
  const objectKey = `exports/${row.jurisdictionId}/${row.id}.${row.format}`;
  try {
    const already = await objectStorage.headIfExists(objectKey); // idempotent retry, same pattern as reports
    const sha256 =
      already?.metadata.sha256 ??
      (await (async () => {
        const bytes = await renderExport(row.scope, row.format); // R7: a read-only query set, no writes to source data
        await objectStorage.putIfAbsent(objectKey, bytes, { metadata: { sha256: sha256Of(bytes) } });
        return sha256Of(bytes);
      })());
    await db
      .update(recordsExport)
      .set({ status: "ready", objectKey, sha256, finishedAt: sql`now()` })
      .where(and(eq(recordsExport.id, exportId), eq(recordsExport.status, "building")));
  } catch (err) {
    await db
      .update(recordsExport)
      .set({ status: "failed", errorDetail: String(err), finishedAt: sql`now()` })
      .where(and(eq(recordsExport.id, exportId), eq(recordsExport.status, "building"))); // R8: no partial file left referenced
    throw err;
  }
}
```

- **R5:** `requestExport` checks the format against the profile's `exportFormats` before anything is inserted; `renderExport` dispatches to a CSV/GeoJSON/XLSX writer per format, scoped by `scope` (jurisdiction + record types + date range) rather than an unscoped dump.
- **R6:** the export object's key is content-addressed by export id, and its SHA-256 is stored both in `records_export.sha256` and the object's own metadata — identical in shape to F10's report hash, so an export's integrity can be checked the same way (R6 explicitly parallels R9 of `locked-report.md`).
- **R7:** `renderExport` only reads (`select`) from `decision`, `analysis_run`, `report`, `profile_version`, etc. — it has no write access to any of those tables, so an export in progress can never block or interfere with ordinary work, and building one can never modify a record.
- **R8:** the row only reaches `status = 'ready'` after the object is confirmed written with its hash recorded; any exception before that leaves the row `failed` with `error_detail`, and `object_key`/`sha256` stay null (the `check` constraint in `data-model.md` enforces this) — there is never a `ready` row pointing at a file that doesn't exist or doesn't match its hash.

## Verification

- Unit tests: `flagRetention`'s `countFrom` date selection (created vs. report-released, including the "no report yet" skip); export format validation against a fixture profile's `exportFormats`.
- Testcontainers integration tests: `flagRetention` produces no flags for a jurisdiction with no filed application (R2); flagging twice is a no-op via the unique constraint (idempotent daily job); `reviewFlag` compare-and-set rejects a second review of the same flag, with a **race test** firing two reviews at once and asserting exactly one succeeds; `buildExport` produces a `ready` row with a hash matching the stored object's content for each allowed format, and a forced failure mid-render leaves the row `failed` with no `object_key` (R8); a retried `buildExport` after a simulated crash (object written, row not yet updated) finalizes from the existing object rather than rendering twice, mirroring `locked-report.md`'s R11 pattern.
