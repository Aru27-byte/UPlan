import { pgTable, boolean, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// TechDesign/data-model.md ("Operations").
export const workerHeartbeat = pgTable("worker_heartbeat", {
  singleton: boolean("singleton").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const backupRun = pgTable(
  "backup_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    errorDetail: text("error_detail"),
  },
  (t) => [
    check("backup_run_kind_check", sql`${t.kind} in ('full', 'diff')`),
    check("backup_run_status_check", sql`${t.status} in ('succeeded', 'failed')`),
    check("backup_run_failed_shape", sql`${t.status} <> 'failed' or ${t.errorDetail} is not null`),
  ],
);
