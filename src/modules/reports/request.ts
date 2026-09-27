import { sql } from "drizzle-orm";

import type { Actor } from "@/modules/accounts";
import type { DbOrTx } from "@/platform/db";
import { addJob } from "@/platform/jobs";

import { CURRENT_TEMPLATE_VERSION } from "./constants";
import { ReportSnapshotSchema, type ReportSnapshot } from "./snapshot";
import { report } from "./tables";

// TechDesign/locked-report.md, "Publishing". Always called inside workflow's finishResearch transaction,
// which holds the decision's row lock and has just moved the decision to `finishing`. It inserts the
// `releasing` row and enqueues the job in that same transaction, on the decision's own queue with an
// explicit max_attempts (concurrency rules), so there is never a releasing row without a job behind it.
export async function requestFinalDocument(
  tx: DbOrTx,
  input: {
    decisionId: string;
    actor: Actor;
    runId: string;
    snapshot: ReportSnapshot;
    changeNote: string | null;
  },
): Promise<{ reportId: string }> {
  const [row] = await tx
    .insert(report)
    .values({
      decisionId: input.decisionId,
      // Numbers attempts, so a failed attempt and its retry never collide. Version numbers are separate
      // and assigned at release (render-and-store.ts).
      sequenceNumber: sql`(select coalesce(max(sequence_number), 0) + 1 from report where decision_id = ${input.decisionId})`,
      analysisRunId: input.runId,
      templateVersion: CURRENT_TEMPLATE_VERSION,
      status: "releasing",
      snapshot: ReportSnapshotSchema.parse(input.snapshot),
      changeNote: input.changeNote,
      requestedBy: input.actor.userId,
    })
    .returning({ id: report.id });
  if (!row) throw new Error("insert into report unexpectedly returned no row");
  await addJob(tx, "release_report", { reportId: row.id }, { queueName: `decision:${input.decisionId}`, maxAttempts: 3 });
  return { reportId: row.id };
}
