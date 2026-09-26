# TechDesign — Decisions

**Feature:** F5 · `decisions`
**Status:** Draft
**Requirements:** [Requirements/decisions.md](../Requirements/decisions.md) (R1–R12)
**Builds on:** [data-model.md](data-model.md) (`decision`, `decision_geometry`), [system-architecture.md](system-architecture.md) (_Concurrency and consistency_)
**Shared module with:** [proposal-footprint.md](proposal-footprint.md) (F8 — the footprint-tracing workflow built on `saveGeometry`)
**Release:** 1

## Module

```
src/modules/decisions/
  index.ts        public API
  tables.ts         decision, decision_geometry
  decisions.ts      createDecision, getDecision, listOpenDecisions, updateDecisionDetails, reopen
  geometry.ts        saveGeometry, getLatestGeometry, getGeometryRevision
  *.test.ts
```

## Decisions (R1, R3, R4, R9, R10, R11, R12)

```ts
// decisions.ts
export async function createDecision(actor: Actor, input: NewDecision): Promise<Decision> {
  requirePlanner(actor, input.jurisdictionId);
  return db
    .insert(decision)
    .values({ ...input, status: "in_progress", createdBy: actor.userId })
    .returning();
}

export async function getDecision(actor: Actor, decisionId: string): Promise<Decision> {
  const row = await db.query.decision.findFirst({ where: eq(decision.id, decisionId) });
  if (!row) throw new NotFoundError("decision");
  requireMembership(actor, row.jurisdictionId); // R1
  return row;
}

// R10–R12: replaces setFilingDate. One function edits every project detail, so there is one
// compare-and-set and one place that decides whether an edit needs a new analysis run.
export type DecisionDetailsPatch = {
  parcelOrAddress?: string | null; // null clears a detail; absent leaves it alone
  applicant?: string | null;
  projectManagerId?: string | null;
  targetDecisionOn?: string | null; // YYYY-MM-DD
  applicationFiledOn?: string | null; // YYYY-MM-DD
};

export async function updateDecisionDetails(
  actor: Actor,
  decisionId: string,
  patch: DecisionDetailsPatch,
  expectedRowVersion: number,
): Promise<Decision> {
  const d = await getDecision(actor, decisionId);
  requirePlanner(actor, d.jurisdictionId);
  if (patch.projectManagerId && !(await isPlannerOf(patch.projectManagerId, d.jurisdictionId))) {
    throw new ValidationError("the project manager must be a planner in this jurisdiction"); // R10
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(decision)
      .set({ ...patch, rowVersion: sql`row_version + 1` })
      .where(and(eq(decision.id, decisionId), eq(decision.rowVersion, expectedRowVersion))) // R11: compare-and-set
      .returning();
    if (updated.length === 0) throw new ConflictError("decision changed since you loaded it");
    if (patch.applicationFiledOn !== undefined && patch.applicationFiledOn !== d.applicationFiledOn) {
      await addJob(tx, "run_analysis", { decisionId, purpose: "current" }, {
        queueName: `decision:${decisionId}`,
        jobKey: `run_analysis:${decisionId}`,
        maxAttempts: 3,
      }); // R12: the change and its job commit together
    }
    return updated[0];
  });
}

export async function listOpenDecisions(jurisdictionId: string, tx = db): Promise<Decision[]> {
  return tx
    .select()
    .from(decision)
    .where(and(eq(decision.jurisdictionId, jurisdictionId), eq(decision.status, "in_progress"))); // R4
}
```

- **R1:** every read function loads the row, then calls `requireMembership`/`requirePlanner` with the row's own `jurisdiction_id` — never a jurisdiction id supplied by the caller alone, so a mismatched id can't be used to probe another city's decision.
- **R3:** `application_filed_on` is a nullable `date` column; F1's `resolveRulesInForce`/`ruleSetResolutionDate` is what actually enforces "required before a vesting run," not this module — `decisions` only stores the date.
- **R10:** `parcel_or_address`, `applicant`, `project_manager_id`, and `target_decision_on` are nullable columns (see `data-model.md`), the same "a fact that may not exist yet" case as `permit_number`. The UI shows null as "Not yet recorded". `project_manager_id` references `app_user`, and the function checks that user holds a planner membership in the decision's jurisdiction before it is stored. `createDecision`'s `NewDecision` accepts the same optional fields.
- **R11, R12:** one function, one `row_version` compare-and-set, and the enqueue inside the same transaction, as the concurrency rules require (transactional enqueue, explicit `max_attempts`). It enqueues only when the filing date actually changed, because no other detail is an analysis input. The `run_analysis` job key collapses a duplicate that is still pending.
- **R9:** `created_by`/`created_at` are set once at insert; `row_version` (see R6 below) plus `decision`'s own audit columns record every status and filing-date change without a separate history table, since the row itself is small and mutable by design (unlike geometry, which is append-only).

## Reopening (R8)

```ts
export async function reopen(
  actor: Actor,
  decisionId: string,
  expectedRowVersion: number,
): Promise<Decision> {
  const d = await getDecision(actor, decisionId);
  requirePlanner(actor, d.jurisdictionId);
  const updated = await db
    .update(decision)
    .set({ status: "in_progress", rowVersion: sql`row_version + 1` })
    .where(
      and(
        eq(decision.id, decisionId),
        eq(decision.rowVersion, expectedRowVersion),
        eq(decision.status, "report_released"),
      ),
    )
    .returning();
  if (updated.length === 0)
    throw new ConflictError("decision is not currently report_released, or changed since you loaded it");
  return updated[0];
}
```

`reports.md` (F10) owns what a released report _is_ and guarantees it never changes; `reopen` only flips `decision.status`, which is what makes the decision eligible for a new analysis run and, eventually, a new report sequence number (R8).

## Geometry revisions (R2, R5, R6, R7)

```ts
// geometry.ts
export async function saveGeometry(
  actor: Actor,
  decisionId: string,
  kind: "study_area" | "footprint",
  geojson: unknown,
  sourceNote: string,
  expectedRevision: number,
): Promise<DecisionGeometry> {
  const d = await getDecision(actor, decisionId);
  requirePlanner(actor, d.jurisdictionId);

  const geom = MultiPolygonSchema.parse(geojson); // Zod boundary validation (R2: no parcel-line constraint)
  const validity =
    await db.execute(sql`select ST_IsValid(ST_GeomFromGeoJSON(${JSON.stringify(geom)})) as valid,
    ST_IsValidReason(ST_GeomFromGeoJSON(${JSON.stringify(geom)})) as reason`);
  if (!validity[0].valid) {
    throw new ValidationError(`drawn geometry is invalid: ${validity[0].reason}`); // R7: rejected, never repaired
  }

  try {
    return await db
      .insert(decisionGeometry)
      .values({
        decisionId,
        kind,
        revision: expectedRevision,
        geom,
        sourceNote,
        createdBy: actor.userId,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ConflictError(`revision ${expectedRevision} already exists for this ${kind}`); // R6
    throw err;
  }
}

export async function getLatestGeometry(actor: Actor, decisionId: string, kind: "study_area" | "footprint") {
  const d = await getDecision(actor, decisionId);
  requireMembership(actor, d.jurisdictionId);
  return db.query.decisionGeometry.findFirst({
    where: and(eq(decisionGeometry.decisionId, decisionId), eq(decisionGeometry.kind, kind)),
    orderBy: desc(decisionGeometry.revision),
  });
}
```

- **R2:** validation checks only that the input is a valid `MultiPolygon` — there is no parcel-boundary constraint anywhere in this path.
- **R5, R6:** the primary key `(decision_id, kind, revision)` is the actual guard (per `data-model.md`); `saveGeometry` never reads "the current max revision" and computes the next one itself — the client sends the revision it believes is next (having read the latest one), and a collision surfaces as `ConflictError`, matching the browser-honesty rule ("send the revision an edit was based on").
- **R7:** `ST_IsValid`/`ST_IsValidReason` run before insert and a failure is a `ValidationError` naming the actual problem (self-intersection, etc.) — there is no repair call anywhere in this file, unlike `evidence.ts`'s `repairAndValidate`, which only ever touches ingested source data.

## Verification

- Unit tests: `MultiPolygonSchema` boundary parsing rejects malformed GeoJSON before it reaches SQL.
- Testcontainers integration tests: `createDecision`/`getDecision` jurisdiction scoping (R1, with a cross-jurisdiction fetch asserted to `NotFoundError`-shape rather than leak); `updateDecisionDetails`/`reopen` compare-and-set conflict path, plus **a race test** — two `updateDecisionDetails` calls on one `row_version` fired at once on separate connections, asserting exactly one succeeds (R11); changing the filing date leaves one pending `run_analysis` job and changing only the applicant leaves none (R12); a `projectManagerId` who isn't a planner in the jurisdiction is rejected (R10); `saveGeometry` invalid-geometry rejection with the real `ST_IsValidReason` text; **a race test** — two `saveGeometry` calls for the same `(decisionId, kind, revision)` fired at once on separate connections, asserting exactly one succeeds with `ConflictError` on the other (concurrency rule: "a guard isn't done until its race test passes"); `listOpenDecisions` excludes `report_released` rows.
