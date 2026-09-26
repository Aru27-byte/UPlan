import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appUser } from "@/platform/auth-tables";
import type { Db } from "@/platform/db";

import { getActor } from "./actor";
import { provisionUser } from "./users";

// TechDesign/accounts-roles.md — Testcontainers integration tests: a real PostgreSQL with PostGIS,
// with the repository's real migrations applied (never a mocked or in-memory database). Requires
// Docker. Run with `npm run test:integration`.

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: Db;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgis/postgis:18-3.6").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query("create extension if not exists postgis");
  db = drizzle(pool);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../migrations", import.meta.url)) });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

async function rowsFor(id: string) {
  return db.select().from(appUser).where(eq(appUser.id, id));
}

describe("R2: registering creates an identity, never access", () => {
  it("R2: a provisioned person has no membership and no staff rights", async () => {
    await provisionUser(db, { id: "supabase-user-1", email: "planner@example.test", name: "Pat Planner" });

    expect(await rowsFor("supabase-user-1")).toHaveLength(1);
    expect(await getActor(db, "supabase-user-1")).toEqual({
      userId: "supabase-user-1",
      isStaff: false,
      memberships: [],
    });
  });

  it("R2: two requests provisioning the same person at once both succeed and leave one row", async () => {
    const person = { id: "supabase-user-2", email: "racer@example.test", name: "Riley Racer" };

    await Promise.all([provisionUser(db, person), provisionUser(db, person)]);

    expect(await rowsFor(person.id)).toHaveLength(1);
  });

  it("R2: a changed name or email in Supabase is reflected on the next request", async () => {
    await provisionUser(db, { id: "supabase-user-3", email: "old@example.test", name: "Old Name" });
    await provisionUser(db, { id: "supabase-user-3", email: "new@example.test", name: "New Name" });

    expect(await rowsFor("supabase-user-3")).toMatchObject([{ email: "new@example.test", name: "New Name" }]);
  });

  it("R2: an email already held by a different Supabase id is refused, never merged", async () => {
    await provisionUser(db, { id: "supabase-user-4", email: "shared@example.test", name: "First" });

    await expect(
      provisionUser(db, { id: "supabase-user-5", email: "shared@example.test", name: "Second" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await rowsFor("supabase-user-5")).toHaveLength(0);
  });
});
