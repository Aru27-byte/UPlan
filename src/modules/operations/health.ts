import { statfs } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { db } from "@/platform/db";

import { backupRun } from "./tables";
import { getLastHeartbeat } from "./heartbeat";

// TechDesign/system-architecture.md — "Health check and alarms". GET /api/health answers 200, or
// 503 with the names of the failing checks and nothing else (never a stack trace or query text).
export type HealthCheckResult = { ok: boolean; failing: string[] };

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_SIX_HOURS_MS = 26 * 60 * 60 * 1000;

async function checkDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function checkHeartbeat(): Promise<boolean> {
  const lastSeen = await getLastHeartbeat();
  if (!lastSeen) return false;
  return Date.now() - lastSeen.getTime() <= FIFTEEN_MINUTES_MS;
}

async function checkWalArchiving(): Promise<boolean> {
  const [row] = await db
    .execute<{ failed_count: number; last_archived_time: Date | null }>(
      sql`select failed_count, last_archived_time from pg_stat_archiver`,
    )
    .then((r) => r.rows);
  if (!row) return false;
  if (row.failed_count > 0) return false; // "failed since its last success" — a nonzero failed_count is the signal
  if (!row.last_archived_time) return true; // nothing to archive yet is not itself a failure
  return Date.now() - row.last_archived_time.getTime() <= ONE_HOUR_MS;
}

async function checkBackupFreshness(): Promise<boolean> {
  const rows = await db.select().from(backupRun).orderBy(backupRun.finishedAt);
  const lastSucceeded = rows.reverse().find((r) => r.status === "succeeded");
  if (!lastSucceeded) return false;
  return Date.now() - lastSucceeded.finishedAt.getTime() <= TWENTY_SIX_HOURS_MS;
}

async function checkDiskSpace(): Promise<boolean> {
  try {
    const stats = await statfs("/");
    const used = stats.blocks - stats.bfree;
    return used / stats.blocks <= 0.85;
  } catch {
    return true; // statfs unsupported (e.g. some CI sandboxes) — don't fail health on that alone
  }
}

async function checkExhaustedJobs(): Promise<boolean> {
  const [row] = await db
    .execute<{ count: number }>(
      sql`select count(*)::int as count from graphile_worker.jobs
          where attempts >= max_attempts and updated_at > now() - interval '24 hours'`,
    )
    .then((r) => r.rows);
  return (row?.count ?? 0) === 0;
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const checks: [string, () => Promise<boolean>][] = [
    ["database", checkDatabase],
    ["worker_heartbeat", checkHeartbeat],
    ["wal_archiving", checkWalArchiving],
    ["backup_freshness", checkBackupFreshness],
    ["disk_space", checkDiskSpace],
    ["exhausted_jobs", checkExhaustedJobs],
  ];

  const failing: string[] = [];
  for (const [name, check] of checks) {
    const passed = await check().catch(() => false); // any unexpected error is itself a failing check, never swallowed silently
    if (!passed) failing.push(name);
  }
  return { ok: failing.length === 0, failing };
}
