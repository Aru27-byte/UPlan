import { and, desc, eq, sql } from "drizzle-orm";

import { requireMembership, requirePlanner, type Actor } from "@/modules/accounts";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, NotFoundError } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { decision } from "./tables";

export type NewDecision = {
  jurisdictionId: string;
  title: string;
  applicationType: "subdivision" | "short_subdivision" | "clearing_grading";
};

export async function createDecision(actor: Actor, input: NewDecision) {
  requirePlanner(actor, input.jurisdictionId);
  const [row] = await db
    .insert(decision)
    .values({ ...input, status: "in_progress", createdBy: actor.userId })
    .returning();
  if (!row) throw new Error("insert into decision unexpectedly returned no row");
  return row;
}

export async function getDecision(actor: Actor, decisionId: string) {
  const [row] = await db.select().from(decision).where(eq(decision.id, decisionId));
  if (!row) throw new NotFoundError("decision");
  requireMembership(actor, row.jurisdictionId); // R1 of decisions.md
  return row;
}

// system-architecture.md's "Analysis run" flow: a run is triggered by, among other things, "a
// saved study area, footprint, or filing date" — see the matching comment on
// decisions/geometry.ts's saveGeometry. The enqueue rides in the same transaction as the
// compare-and-set update, per the concurrency rule.
export async function setFilingDate(
  actor: Actor,
  decisionId: string,
  filedOn: string,
  expectedRowVersion: number,
) {
  const d = await getDecision(actor, decisionId);
  requirePlanner(actor, d.jurisdictionId);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(decision)
      .set({ applicationFiledOn: filedOn, rowVersion: sql`row_version + 1` })
      .where(and(eq(decision.id, decisionId), eq(decision.rowVersion, expectedRowVersion)))
      .returning();
    const [row] = updated;
    if (!row) throw new ConflictError("decision changed since you loaded it");
    await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx);
    return row;
  });
}

export async function reopen(actor: Actor, decisionId: string, expectedRowVersion: number) {
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
  const [row] = updated;
  if (!row) throw new ConflictError("decision is not report_released, or changed since you loaded it");
  return row;
}

/** For internal (system-authority) callers, such as run_analysis, which run with no actor. */
export async function getDecisionForAnalysis(decisionId: string) {
  const [row] = await db.select().from(decision).where(eq(decision.id, decisionId));
  if (!row) throw new NotFoundError("decision");
  return row;
}

export async function listOpenDecisions(jurisdictionId: string, tx: DbOrTx = db) {
  return tx
    .select()
    .from(decision)
    .where(and(eq(decision.jurisdictionId, jurisdictionId), eq(decision.status, "in_progress")));
}

/** For the dashboard (UIDesign/Dashboard.png): every decision in the jurisdiction, any status, newest first. */
export async function listDecisions(actor: Actor, jurisdictionId: string) {
  requireMembership(actor, jurisdictionId);
  return db
    .select()
    .from(decision)
    .where(eq(decision.jurisdictionId, jurisdictionId))
    .orderBy(desc(decision.createdAt));
}

/**
 * Called by reports' release job when a report finishes releasing — the one place `decision.status`
 * becomes `report_released` (locked-report.md's release flow reaches a terminal state here; nothing
 * previously set it, which would have left every released decision looking `in_progress` forever).
 */
export async function markReportReleased(decisionId: string, tx: DbOrTx = db): Promise<void> {
  await tx
    .update(decision)
    .set({ status: "report_released", rowVersion: sql`row_version + 1` })
    .where(eq(decision.id, decisionId));
}

/** Used by evidence's dataset-refresh flow: only decisions whose study area intersects the refreshed dataset's coverage. */
export async function listOpenDecisionsIntersecting(tx: DbOrTx, coverage: GeoJSON.Geometry) {
  const rows = await tx.execute<{ id: string; jurisdiction_id: string }>(sql`
    select distinct d.id, d.jurisdiction_id
    from decision d
    join decision_geometry g on g.decision_id = d.id and g.kind = 'study_area'
    where d.status = 'in_progress'
      and ST_Intersects(g.geom, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(coverage)}), 4326))
  `);
  return rows.rows.map((r) => ({ id: r.id, jurisdictionId: r.jurisdiction_id }));
}
