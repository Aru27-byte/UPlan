import { sql } from "drizzle-orm";

import { db, type DbOrTx } from "./db";

// The one way any module enqueues a job: always inside the transaction that needs it, always with
// an explicit max_attempts, always on the aggregate's named queue (.claude/rules/best-practices.md,
// "Avoid race conditions at all costs"). graphile-worker's own `add_job` SQL function does the
// dedup/collapse behavior a job key needs — this is a thin, typed wrapper around it, not a second
// queue implementation.
export async function addJob(
  tx: DbOrTx,
  taskName: string,
  payload: Record<string, unknown>,
  opts: { queueName: string; maxAttempts: number; jobKey?: string },
): Promise<void> {
  // graphile-worker 0.18's add_job() takes `payload json`, not `jsonb` — a jsonb argument fails
  // Postgres's named-parameter overload resolution outright ("function ... does not exist"),
  // even though a bare value casts between the two fine; caught by actually running this against
  // a real local Postgres, not just typecheck/lint.
  await tx.execute(sql`
    select graphile_worker.add_job(
      ${taskName},
      payload := ${JSON.stringify(payload)}::json,
      queue_name := ${opts.queueName},
      max_attempts := ${opts.maxAttempts},
      job_key := ${opts.jobKey ?? null}
    )
  `);
}

/**
 * Enqueues a `run_analysis` job. Lives in platform, not the `analysis` module: `analysis`'s own
 * job body (run.ts) imports `profiles`, `decisions`, and `evidence` to actually compute a run, and
 * those same three modules are exactly the callers that need to enqueue one — putting this
 * function in `analysis`'s public API would make importing it a module import cycle
 * (.claude/rules/conventions.md: "No import cycles; lint enforces this"). This wrapper carries no
 * domain logic, only the fixed queue/job-key convention for this one task name.
 */
export async function enqueueAnalysisRun(
  decisionId: string,
  opts: { purpose: "current" } | { purpose: "preview"; profileChangeId: string },
  tx: DbOrTx = db,
): Promise<void> {
  await addJob(
    tx,
    "run_analysis",
    { decisionId, ...opts },
    {
      queueName: `decision:${decisionId}`,
      maxAttempts: 3,
      jobKey: opts.purpose === "current" ? `run_analysis:${decisionId}` : undefined,
    },
  );
}
