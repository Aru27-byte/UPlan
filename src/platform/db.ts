import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "./env";

// The one database client, shared by every module and by graphile-worker (TechDesign/tech-stack.md,
// D5/D8). No module-level mutable state beyond this pool itself — every invariant is enforced by the
// database (constraints, row locks, triggers), never by anything held in this process's memory
// (.claude/rules/best-practices.md, "Avoid race conditions at all costs").
//
// Connections stay open. node-postgres closes an idle connection after 10 s by default, and opening one to
// a hosted database costs a TCP + TLS + auth handshake (~800 ms measured against Supabase's pooler, versus
// ~90 ms for a query on an open one) — so any pause of more than ten seconds between clicks made the next
// page pay it. Five minutes outlasts a planner's reading time, and `keepAlive` has the OS probe the socket
// so a connection the network silently dropped is discovered and replaced instead of hanging a request.
// A genuinely broken connection still fails loudly: the pool discards it and the query's error reaches the log.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idleTimeoutMillis: 300_000,
  keepAlive: true,
});

export const db = drizzle(pool);

export type Db = typeof db;
// A Drizzle transaction callback's own type, for module functions that accept either the pool-backed
// `db` or a transaction handle interchangeably (e.g. `listOpenDecisions(jurisdictionId, tx = db)`).
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb(): Promise<void> {
  await pool.end();
}
