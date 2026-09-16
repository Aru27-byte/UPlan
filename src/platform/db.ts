import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "./env";

// The one database client, shared by every module and by graphile-worker (TechDesign/tech-stack.md,
// D5/D8). No module-level mutable state beyond this pool itself — every invariant is enforced by the
// database (constraints, row locks, triggers), never by anything held in this process's memory
// (.claude/rules/best-practices.md, "Avoid race conditions at all costs").
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool);

export type Db = typeof db;
// A Drizzle transaction callback's own type, for module functions that accept either the pool-backed
// `db` or a transaction handle interchangeably (e.g. `listOpenDecisions(jurisdictionId, tx = db)`).
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb(): Promise<void> {
  await pool.end();
}
