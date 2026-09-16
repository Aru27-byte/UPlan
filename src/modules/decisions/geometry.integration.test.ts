import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import type { Actor } from "@/modules/accounts";

import { getLatestGeometry, saveGeometry } from "./geometry";
import { createDecision } from "./decisions";

// TechDesign/decisions.md — Testcontainers integration tests: real PostgreSQL with PostGIS, per
// .claude/rules/testing-and-verification.md ("Never a mocked or in-memory database").
// NOTE: requires Docker. Run with `npm run test:integration`.

let container: StartedPostgreSqlContainer;
const actor: Actor = {
  userId: "planner-1",
  isStaff: false,
  memberships: [{ jurisdictionId: "j1", role: "planner" }],
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgis/postgis:18-3.6").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  // Migrations would run here in the real suite (drizzle-kit migrate against the container),
  // then seed one jurisdiction ("j1") and one decision for the fixtures below.
}, 60_000);

afterAll(async () => {
  await container.stop();
});

const validSquare = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-122.03, 47.6],
        [-122.02, 47.6],
        [-122.02, 47.61],
        [-122.03, 47.61],
        [-122.03, 47.6],
      ],
    ],
  ],
};

const selfIntersecting = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-122.03, 47.6],
        [-122.02, 47.61],
        [-122.02, 47.6],
        [-122.03, 47.61],
        [-122.03, 47.6],
      ],
    ],
  ],
};

describe("R5/R6/R7: geometry revisions", () => {
  it("R7: rejects a self-intersecting drawing with the specific reason, never repairing it", async () => {
    const decision = await createDecision(actor, {
      jurisdictionId: "j1",
      title: "Test",
      applicationType: "subdivision",
    });
    await expect(saveGeometry(actor, decision.id, "study_area", selfIntersecting, "test", 1)).rejects.toThrow(
      /drawn geometry is invalid/,
    );
  });

  it("R5/R6: two saves of the same revision — the second fails; the first is still readable", async () => {
    const decision = await createDecision(actor, {
      jurisdictionId: "j1",
      title: "Test",
      applicationType: "subdivision",
    });
    await saveGeometry(actor, decision.id, "study_area", validSquare, "first save", 1);
    await expect(
      saveGeometry(actor, decision.id, "study_area", validSquare, "second save", 1),
    ).rejects.toThrow(/already exists/);
    const latest = await getLatestGeometry(actor, decision.id, "study_area");
    expect(latest?.revision).toBe(1);
  });

  it("race test: two concurrent saves of the same revision — exactly one succeeds", async () => {
    const decision = await createDecision(actor, {
      jurisdictionId: "j1",
      title: "Test",
      applicationType: "subdivision",
    });
    const results = await Promise.allSettled([
      saveGeometry(actor, decision.id, "footprint", validSquare, "a", 1),
      saveGeometry(actor, decision.id, "footprint", validSquare, "b", 1),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
  });
});
