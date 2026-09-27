import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import { Pool } from "pg";

// Vitest global setup for the "integration" project (.claude/rules/testing-and-verification.md:
// "A real PostgreSQL with PostGIS at production's major versions. Never a mocked or in-memory
// database"). One container serves every integration test file. It starts once, gets every
// migration applied exactly as production does (drizzle's migrator over migrations/, then
// graphile-worker's own schema, which `graphile_worker.add_job()` needs), and is stopped when the
// run ends.
//
// DATABASE_URL is set on this process before any test worker starts, so each worker inherits it and
// src/platform/env.ts, which reads it at import time, sees the container. tests/setup/dummy-env.ts
// only fills variables that are still unset, so it doesn't override this one.
//
// Tests share the database and never depend on each other: each creates its own people, city, and
// projects with unique names (tests/support/factories.ts), and no test counts rows it didn't create.
let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer("postgis/postgis:18-3.6").withStartupTimeout(120_000).start();
  const connectionString = container.getConnectionUri();
  process.env.DATABASE_URL = connectionString;

  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
  await runMigrations({ connectionString });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
