import { run as runWorker } from "graphile-worker";

import { env } from "@/platform/env";
import { logger } from "@/platform/logger";

import { taskList } from "./tasks";

// TechDesign/system-architecture.md — V4 (worker): graphile-worker, at most two jobs at once,
// serving no HTTP. Scheduled tasks (record_heartbeat every 5 minutes, daily_jurisdiction_maintenance
// once a day) are driven by graphile-worker's own crontab file (deploy/crontab), not by timers held
// in this process's memory (.claude/rules/best-practices.md: "No... setTimeout sequencing").
async function main(): Promise<void> {
  const runner = await runWorker({
    connectionString: env.DATABASE_URL,
    concurrency: 2,
    taskList,
    crontab: undefined, // graphile-worker reads deploy/crontab via the --crontab CLI flag in production; see deploy/compose.yaml
  });

  logger.info("worker started");
  await runner.promise;
}

main().catch((err: unknown) => {
  logger.error({ err }, "worker crashed");
  process.exitCode = 1;
});
