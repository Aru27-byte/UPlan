import { desc, eq, sql } from "drizzle-orm";

import { requireMembership, requirePlanner, type Actor } from "@/modules/accounts";
import { getLatestRun } from "@/modules/analysis";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";
import { addJob } from "@/platform/jobs";
import { getObject } from "@/platform/object-storage";

import { CURRENT_TEMPLATE_VERSION } from "./constants";
import { report } from "./tables";

// This file is safe for Next.js pages to import through index.ts: nothing here touches render.ts
// or `react-dom/server` (see render-and-store.ts's comment for why that split exists).

// TechDesign/locked-report.md — R1: only the latest successful `current` run. R10: safe against a
// concurrent profile approval or dataset refresh via FOR UPDATE / FOR SHARE and a recheck. R11:
// one release in flight per decision (report_one_releasing), enforced by the database.
export async function releaseReport(
  actor: Actor,
  decisionId: string,
  jurisdictionId: string,
): Promise<{ id: string }> {
  requirePlanner(actor, jurisdictionId);

  return db.transaction(async (tx) => {
    // Locks the decision row for the duration of this transaction, so a concurrent profile
    // approval or dataset refresh that also locks it (system-architecture.md's Concurrency rules)
    // can't interleave — one commits first, and the other observes it below.
    await tx.execute(sql`select id from decision where id = ${decisionId} for update`);

    const run = await getLatestRun(decisionId, "current", tx);
    if (!run) throw new ValidationError("no successful analysis run to release");

    const stillCurrent = await isStillCurrentInput(tx, run.id);
    if (!stillCurrent) {
      throw new ConflictError(
        "the rules or evidence changed since this run — refresh and re-run before releasing",
      );
    }

    const maxSeqRows = await tx
      .execute<{ maxSeq: number }>(
        sql`select coalesce(max(sequence_number), 0) as "maxSeq" from report where decision_id = ${decisionId}`,
      )
      .then((r) => r.rows);
    const maxSeq = maxSeqRows[0]?.maxSeq ?? 0;

    let inserted;
    try {
      [inserted] = await tx
        .insert(report)
        .values({
          decisionId,
          sequenceNumber: maxSeq + 1,
          analysisRunId: run.id,
          templateVersion: CURRENT_TEMPLATE_VERSION,
          status: "releasing",
          objectKey: `${jurisdictionId}/${decisionId}/`, // finalized to include the report id, in render-and-store.ts
          requestedBy: actor.userId,
        })
        .returning();
    } catch {
      // report_one_releasing (partial unique index): a release is already in flight (R11)
      throw new ConflictError("a release is already in progress for this decision");
    }
    if (!inserted) throw new Error("insert into report unexpectedly returned no row");

    await addJob(
      tx,
      "release_report",
      { reportId: inserted.id },
      { queueName: `decision:${decisionId}`, maxAttempts: 3 },
    );
    return { id: inserted.id };
  });
}

async function isStillCurrentInput(tx: DbOrTx, runId: string): Promise<boolean> {
  // Re-derives "is this run's pinned profile version still current, and are its pinned dataset
  // versions still current" inside the same transaction that holds the decision's lock — a
  // concurrent approval/refresh's own FOR UPDATE has either already committed (and this returns
  // false) or is still waiting behind this transaction's lock.
  const [row] = await tx
    .execute<{ still_current: boolean }>(
      sql`
        select not exists (
          select 1 from analysis_run_dataset ard
          join dataset d on d.current_version_id <> ard.dataset_version_id
          where ard.analysis_run_id = ${runId}
        ) and not exists (
          select 1 from analysis_run ar
          join jurisdiction j on j.current_profile_version_id <> ar.profile_version_id
          where ar.id = ${runId} and ar.profile_version_id is not null
        ) as still_current
      `,
    )
    .then((r) => r.rows);
  return row?.still_current ?? false;
}

/** For the dashboard and Report tab (UIDesign/Dashboard.png, Project_View_Report.png): the highest-sequence report for a decision, or null if none has ever been requested. */
export async function getLatestReportForDecision(actor: Actor, jurisdictionId: string, decisionId: string) {
  requireMembership(actor, jurisdictionId);
  const [row] = await db
    .select()
    .from(report)
    .where(eq(report.decisionId, decisionId))
    .orderBy(desc(report.sequenceNumber))
    .limit(1);
  return row ?? null;
}

export async function downloadReport(
  actor: Actor,
  jurisdictionId: string,
  reportId: string,
): Promise<Buffer> {
  requirePlanner(actor, jurisdictionId);
  const [row] = await db.select().from(report).where(eq(report.id, reportId));
  if (row?.status !== "released" || !row.pdfSha256) throw new ValidationError("report is not released");
  return getObject("reports", row.objectKey);
}
