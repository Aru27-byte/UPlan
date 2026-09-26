import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appUser } from "@/platform/auth-tables";
import type { Db } from "@/platform/db";
import { ConflictError } from "@/platform/errors";

import { getActor } from "./actor";
import { staffMember } from "./tables";
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

// Supabase user ids are uuids; each test uses its own so none depends on another's rows.
const AUTH_IDS = {
  first: "11111111-1111-4111-8111-111111111111",
  racer: "22222222-2222-4222-8222-222222222222",
  changing: "33333333-3333-4333-8333-333333333333",
  holder: "44444444-4444-4444-8444-444444444444",
  intruder: "55555555-5555-4555-8555-555555555555",
  legacy: "66666666-6666-4666-8666-666666666666",
};

async function rowsFor(authId: string) {
  return db.select().from(appUser).where(eq(appUser.authId, authId));
}

describe("R2: registering creates an identity, never access", () => {
  it("R2: a provisioned person has no membership and no staff rights", async () => {
    const userId = await provisionUser(db, { authId: AUTH_IDS.first, email: "planner@example.test", name: "Pat Planner" });

    expect(await rowsFor(AUTH_IDS.first)).toMatchObject([{ id: userId, email: "planner@example.test" }]);
    expect(await getActor(db, userId)).toEqual({ userId, isStaff: false, memberships: [] });
  });

  it("R2: two requests provisioning the same person at once both succeed and get the same id", async () => {
    const person = { authId: AUTH_IDS.racer, email: "racer@example.test", name: "Riley Racer" };

    const [a, b] = await Promise.all([provisionUser(db, person), provisionUser(db, person)]);

    expect(a).toBe(b);
    expect(await rowsFor(AUTH_IDS.racer)).toHaveLength(1);
  });

  it("R2: an unchanged person is provisioned again without changing their id", async () => {
    const person = { authId: AUTH_IDS.first, email: "planner@example.test", name: "Pat Planner" };

    const [row] = await rowsFor(AUTH_IDS.first);
    expect(await provisionUser(db, person)).toBe(row?.id);
  });

  it("R2: a changed name or email in Supabase is reflected on the next request", async () => {
    const userId = await provisionUser(db, { authId: AUTH_IDS.changing, email: "old@example.test", name: "Old Name" });
    const again = await provisionUser(db, { authId: AUTH_IDS.changing, email: "new@example.test", name: "New Name" });

    expect(again).toBe(userId);
    expect(await rowsFor(AUTH_IDS.changing)).toMatchObject([{ email: "new@example.test", name: "New Name" }]);
  });

  it("R2: an email already held by a different Supabase identity is refused, never merged", async () => {
    await provisionUser(db, { authId: AUTH_IDS.holder, email: "shared@example.test", name: "First" });

    await expect(
      provisionUser(db, { authId: AUTH_IDS.intruder, email: "shared@example.test", name: "Second" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await rowsFor(AUTH_IDS.intruder)).toHaveLength(0);
  });
});

describe("R4: a person from before the move to Supabase keeps their id and access once an operator links them", () => {
  it("R4: is refused until linked, then signs in as the same person with their staff rights", async () => {
    await db.execute(sql`insert into app_user (id, name, email) values ('legacy-user', 'Lee Legacy', 'legacy@example.test')`);
    await db.insert(staffMember).values({ userId: "legacy-user", grantedBy: "legacy-user" });
    const identity = { authId: AUTH_IDS.legacy, email: "legacy@example.test", name: "Lee Legacy" };

    // Registering with the old email is not enough: a matching address doesn't prove it's them.
    await expect(provisionUser(db, identity)).rejects.toBeInstanceOf(ConflictError);

    // The operator's one-line link (deployment-guide.md), run deliberately for a trusted email.
    await db.execute(
      sql`update app_user set auth_id = ${AUTH_IDS.legacy}::uuid where email = 'legacy@example.test' and auth_id is null`,
    );

    const userId = await provisionUser(db, identity);
    expect(userId).toBe("legacy-user");
    expect((await getActor(db, userId)).isStaff).toBe(true);
  });
});
