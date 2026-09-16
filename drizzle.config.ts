import { defineConfig } from "drizzle-kit";

// One PostgreSQL database (PostGIS + pgvector) holds every module's tables — see
// TechDesign/system-architecture.md's module map. drizzle-kit generates migrations from each
// module's tables.ts; PostGIS/pgvector-typed columns are declared with custom column types since
// Drizzle has no built-in geometry/vector type (TechDesign/alternatives-and-tradeoffs.md, D5).
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/modules/*/tables.ts", "./src/platform/auth-tables.ts"],
  out: "./migrations",
  dbCredentials: {
    // No fallback: a missing DATABASE_URL must fail loudly, not silently point at a guessed
    // local database (.claude/rules/do-not.md — no default in place of missing required data).
    url: requireEnv("DATABASE_URL"),
  },
  strict: true,
  verbose: true,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run drizzle-kit`);
  return value;
}
