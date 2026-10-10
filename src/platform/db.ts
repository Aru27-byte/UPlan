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
//
// The pool is small on purpose. A hosted database's pooler allows few client connections in all (Supabase's
// session mode: 15 on the free plan), and every process holds its own pool: each `next dev` server, the
// worker, and each Vercel instance. At node-postgres's default of 10, two processes already exceed 15 and
// requests fail with EMAXCONNSESSION (the map's parallel tile requests are the first to show it). Five is
// enough for a page's overlapping reads, and a request waits for a free connection instead of failing.
// Production should also use the pooler's transaction mode (port 6543), which shares server connections
// between clients; nothing here depends on session state (advisory locks and `set local` are per transaction).
const POOL_MAX = 5;

// In development Next.js re-evaluates this module on every change, which would leave each earlier pool holding
// its connections until they idle out. One pool per process, kept on the global object, ends that. Production
// evaluates the module once, so this changes nothing there.
const POOL_KEY = Symbol.for("uplan.db.pool");
type PoolHolder = typeof globalThis & { [POOL_KEY]?: Pool };

function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: POOL_MAX,
    idleTimeoutMillis: 120_000,
    keepAlive: true,
  });
}

const holder: PoolHolder = globalThis;
const pool = env.NODE_ENV === "production" ? createPool() : (holder[POOL_KEY] ??= createPool());

export const db = drizzle(pool);

export type Db = typeof db;
// A Drizzle transaction callback's own type, for module functions that accept either the pool-backed
// `db` or a transaction handle interchangeably (e.g. `listOpenDecisions(jurisdictionId, tx = db)`).
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb(): Promise<void> {
  await pool.end();
}
