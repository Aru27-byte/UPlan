import { z } from "zod";
import type { JobHelpers, Task } from "graphile-worker";

import { applyEffectiveDates, listJurisdictionIds } from "@/modules/profiles";
import { ingestDataset } from "@/modules/evidence";
import { runAnalysis } from "@/modules/analysis";
// Deep import, not the module's index.ts: this function is deliberately excluded from that barrel
// because it pulls in `react-dom/server`, which Next.js 16 refuses anywhere in the app router's
// build graph — see reports/index.ts's and render-and-store.ts's comments. The worker is a
// separate esbuild bundle Next never traces into, so this is safe here specifically; eslint.config.js
// has a matching, narrowly-scoped exception for this one file and this one deep-import path.
import { markReportFailed, renderAndStoreReport } from "@/modules/reports/render-and-store";
import { buildExport, flagRetention } from "@/modules/records";
import { recordHeartbeat } from "@/modules/operations";

// TechDesign/system-architecture.md's job table (J1–J10). Task name -> module function. Routes and
// job handlers stay thin: this file itself does no domain logic, only translates a job's payload
// into a call to the one module function that owns it (.claude/rules/file-structure-and-imports.md).
//
// graphile-worker delivers every payload as `unknown` (its own `Task<any>` type), so each payload
// is parsed with Zod at this boundary before it reaches a module function — the same "validate at
// every boundary" rule that governs form data and uploads (.claude/rules/conventions.md).

/** J3 + J6, run daily by graphile-worker's crontab (deploy/crontab): a per-jurisdiction sweep, since neither cron task takes a per-jurisdiction payload. */
async function dailyJurisdictionMaintenance(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // each function resolves its own zone-aware "today" internally where it matters
  for (const jurisdictionId of await listJurisdictionIds()) {
    await applyEffectiveDates(jurisdictionId, today);
    await flagRetention(jurisdictionId);
  }
}

// `Task`'s own generic parameter names a *task name* (looked up against a global
// `GraphileWorker.Tasks` interface we don't declare), not the payload type — so this just uses
// `Task`'s default, under which `payload` is `unknown`, exactly what schema.parse expects.
function task<Schema extends z.ZodType>(
  schema: Schema,
  handler: (payload: z.infer<Schema>, helpers: JobHelpers) => Promise<void>,
): Task {
  return (rawPayload, helpers) => handler(schema.parse(rawPayload), helpers);
}

// F22 R8: the document job retries up to its max_attempts. On the last attempt the failure is recorded on
// the report and the project returns to in progress, so it is shown to the planner; the error is then
// rethrown so the job still fails and the health check and alarm see it (no fallback).
async function releaseReport(reportId: string, helpers: JobHelpers): Promise<void> {
  try {
    await renderAndStoreReport(reportId);
  } catch (err) {
    if (helpers.job.attempts >= helpers.job.max_attempts) {
      await markReportFailed(reportId, err instanceof Error ? err.message : String(err));
    }
    throw err;
  }
}

const RunAnalysisPayload = z.object({
  decisionId: z.string(),
  purpose: z.enum(["current", "preview"]),
  profileChangeId: z.string().optional(),
});
const IngestDatasetPayload = z.object({ datasetId: z.string() });
const ReleaseReportPayload = z.object({ reportId: z.string() });
const BuildRecordsExportPayload = z.object({ exportId: z.string() });

export const taskList = {
  run_analysis: task(RunAnalysisPayload, (p) => runAnalysis(p.decisionId, p.purpose, p.profileChangeId)),
  ingest_dataset: task(IngestDatasetPayload, (p) => ingestDataset(p.datasetId)),
  release_report: task(ReleaseReportPayload, (p, helpers) => releaseReport(p.reportId, helpers)),
  build_records_export: task(BuildRecordsExportPayload, (p) => buildExport(p.exportId)),
  record_heartbeat: () => recordHeartbeat(),
  daily_jurisdiction_maintenance: () => dailyJurisdictionMaintenance(),
};

export type TaskName = keyof typeof taskList;
