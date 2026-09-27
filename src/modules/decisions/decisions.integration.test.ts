import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";

import { expectDbError } from "../../../tests/support/db-errors";
import { createPerson, createReadyCity, type City, type Person } from "../../../tests/support/factories";

import {
  createDecision,
  deleteDecision,
  getDecision,
  listDecisions,
  listOpenDecisions,
  lockEditableDecision,
  reopen,
  updateDecisionDetails,
} from "./decisions";
import { getLatestGeometry, saveGeometry } from "./geometry";

// TechDesign/decisions.md — integration tests against the real PostgreSQL with PostGIS that
// tests/setup/integration-db.ts starts, with every migration applied (never a mocked database). Requires
// Docker. Run with `npm run test:integration`.

let city: City;
beforeAll(async () => {
  city = await createReadyCity();
});

const square = (west: number) => ({
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [west, 47.6],
        [west + 0.01, 47.6],
        [west + 0.01, 47.61],
        [west, 47.61],
        [west, 47.6],
      ],
    ],
  ],
});

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

async function newProject(owner: Person, title = "Test project") {
  return createDecision(owner.actor, { jurisdictionId: city.id, title, applicationType: "subdivision" });
}

async function pendingJobs(decisionId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from graphile_worker.jobs where key = ${`run_analysis:${decisionId}`}`,
  );
  return rows.rows[0]?.n ?? 0;
}

async function forceStatus(decisionId: string, status: string) {
  await db.execute(sql`update decision set status = ${status} where id = ${decisionId}`);
}

describe("R1: a decision belongs to the person who created it", () => {
  it("R1: another planner and a staff member both get 'not found' for someone else's project", async () => {
    const owner = await createPerson();
    const other = await createPerson();
    const staff = await createPerson({ staff: true });
    const project = await newProject(owner);

    await expect(getDecision(other.actor, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDecision(staff.actor, project.id)).rejects.toBeInstanceOf(NotFoundError); // R9: staff rights open no project
    await expect(saveGeometry(other.actor, project.id, "study_area", square(-122.03), "x", 1)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listDecisions(other.actor)).map((d) => d.id)).not.toContain(project.id);
    expect((await listDecisions(owner.actor)).map((d) => d.id)).toContain(project.id);
  });

  it("R1: a project that doesn't exist reads exactly like one that isn't yours", async () => {
    const person = await createPerson();
    await expect(getDecision(person.actor, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("project not found");
  });

  it("R15: a project can't be created under a city that doesn't exist", async () => {
    const person = await createPerson();
    await expect(
      createDecision(person.actor, {
        jurisdictionId: "00000000-0000-4000-8000-000000000000",
        title: "x",
        applicationType: "subdivision",
      }),
    ).rejects.toThrow(/isn't set up/);
  });

  it("R15: a blank optional detail is stored as 'not recorded' (null), never as a placeholder", async () => {
    const person = await createPerson();
    const project = await createDecision(person.actor, {
      jurisdictionId: city.id,
      title: "  Blank details  ",
      applicationType: "short_subdivision",
      parcelOrAddress: "",
      applicant: "   ",
      targetDecisionOn: "",
    });
    expect(project.title).toBe("Blank details");
    expect(project.parcelOrAddress).toBeNull();
    expect(project.applicant).toBeNull();
    expect(project.targetDecisionOn).toBeNull();
  });
});

describe("R10–R12: project details are one compare-and-set, and only the filing date queues an analysis", () => {
  it("R11: an edit based on a stale row version fails with a conflict", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await updateDecisionDetails(owner.actor, project.id, { applicant: "First" }, project.rowVersion);
    await expect(
      updateDecisionDetails(owner.actor, project.id, { applicant: "Second" }, project.rowVersion),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("race: two edits of one row version fired at once — exactly one succeeds", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    const results = await Promise.allSettled([
      updateDecisionDetails(owner.actor, project.id, { applicant: "A" }, project.rowVersion),
      updateDecisionDetails(owner.actor, project.id, { applicant: "B" }, project.rowVersion),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("R12: changing the filing date queues one analysis run; changing only the applicant queues none", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    const afterApplicant = await updateDecisionDetails(owner.actor, project.id, { applicant: "Someone" }, project.rowVersion);
    expect(await pendingJobs(project.id)).toBe(0);
    await updateDecisionDetails(owner.actor, project.id, { applicationFiledOn: "2026-08-01" }, afterApplicant.rowVersion);
    expect(await pendingJobs(project.id)).toBe(1);
  });

  it("R11: a malformed filing date is rejected with a message, not stored", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await expect(
      updateDecisionDetails(owner.actor, project.id, { applicationFiledOn: "08/01/2026" }, project.rowVersion),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("R5–R7: geometry revisions", () => {
  it("R7: rejects a self-intersecting drawing with the specific reason, never repairing it", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await expect(saveGeometry(owner.actor, project.id, "study_area", selfIntersecting, "test", 1)).rejects.toThrow(
      /isn't valid: Self-intersection/,
    );
    expect(await getLatestGeometry(owner.actor, project.id, "study_area")).toBeNull();
  });

  it("R7: rejects an unclosed ring and a point, before any SQL", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    const unclosed = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1]]]] };
    await expect(saveGeometry(owner.actor, project.id, "study_area", unclosed, "x", 1)).rejects.toThrow(/must end where it starts/);
    await expect(saveGeometry(owner.actor, project.id, "study_area", { type: "Point", coordinates: [0, 0] }, "x", 1)).rejects.toBeInstanceOf(ValidationError);
  });

  it("R5/R6: two saves of the same revision — the second fails; the first is still readable", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "first save", 1);
    await expect(saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "second save", 1)).rejects.toBeInstanceOf(ConflictError);
    const latest = await getLatestGeometry(owner.actor, project.id, "study_area");
    expect(latest?.revision).toBe(1);
    expect(latest?.sourceNote).toBe("first save");
  });

  it("R5: a later save is a new revision, and the earlier one is kept", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "v1", 1);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.02), "v2", 2);
    expect((await getLatestGeometry(owner.actor, project.id, "study_area"))?.revision).toBe(2);
    const kept = await db.execute<{ n: number }>(sql`select count(*)::int as n from decision_geometry where decision_id = ${project.id}`);
    expect(kept.rows[0]?.n).toBe(2);
  });

  it("R5: a saved geometry revision can't be updated or deleted, even by SQL", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "v1", 1);
    await expectDbError(db.execute(sql`update decision_geometry set source_note = 'changed' where decision_id = ${project.id}`), /append-only/);
    await expectDbError(db.execute(sql`delete from decision_geometry where decision_id = ${project.id}`), /append-only/);
  });

  it("race test: two concurrent saves of the same revision — exactly one succeeds", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    const results = await Promise.allSettled([
      saveGeometry(owner.actor, project.id, "footprint", square(-122.03), "a", 1),
      saveGeometry(owner.actor, project.id, "footprint", square(-122.02), "b", 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("R5: saving a boundary queues an analysis in the same transaction, and does not change the row version", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "v1", 1);
    expect(await pendingJobs(project.id)).toBe(1);
    expect((await getDecision(owner.actor, project.id)).rowVersion).toBe(project.rowVersion);
  });
});

describe("R13: only an in-progress decision can be changed", () => {
  it("R13: every writer refuses a completed project, and says to start a research change", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await forceStatus(project.id, "report_released");
    await expect(saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "x", 1)).rejects.toThrow(/Start a research change/);
    await expect(updateDecisionDetails(owner.actor, project.id, { applicant: "x" }, project.rowVersion)).rejects.toThrow(/Start a research change/);
    await expect(db.transaction((tx) => lockEditableDecision(tx, owner.actor, project.id))).rejects.toBeInstanceOf(ConflictError);
  });

  it("R13: every writer refuses a project whose document is being generated", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await forceStatus(project.id, "finishing");
    await expect(saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "x", 1)).rejects.toThrow(/being generated/);
    await expect(updateDecisionDetails(owner.actor, project.id, { applicant: "x" }, project.rowVersion)).rejects.toThrow(/being generated/);
  });

  it("R8: reopening a completed project sets it back to in progress and queues a fresh analysis, once", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await forceStatus(project.id, "report_released");
    const before = await getDecision(owner.actor, project.id);
    const reopened = await reopen(owner.actor, project.id, before.rowVersion);
    expect(reopened.status).toBe("in_progress");
    expect(await pendingJobs(project.id)).toBe(1);
    await expect(reopen(owner.actor, project.id, reopened.rowVersion)).rejects.toBeInstanceOf(ConflictError);
  });

  it("race test: two reopens of one completed project — exactly one succeeds", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await forceStatus(project.id, "report_released");
    const current = await getDecision(owner.actor, project.id);
    const results = await Promise.allSettled([
      reopen(owner.actor, project.id, current.rowVersion),
      reopen(owner.actor, project.id, current.rowVersion),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("R14: deleting hides a project and keeps every record", () => {
  it("R14: the project disappears from reads, and its geometry stays in the database", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    await saveGeometry(owner.actor, project.id, "study_area", square(-122.03), "v1", 1);
    await deleteDecision(owner.actor, project.id, project.rowVersion);

    await expect(getDecision(owner.actor, project.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listDecisions(owner.actor)).map((d) => d.id)).not.toContain(project.id);
    const kept = await db.execute<{ n: number }>(sql`select count(*)::int as n from decision_geometry where decision_id = ${project.id}`);
    expect(kept.rows[0]?.n).toBe(1);
    const row = await db.execute<{ deleted_by: string }>(sql`select deleted_by from decision where id = ${project.id}`);
    expect(row.rows[0]?.deleted_by).toBe(owner.userId);
  });

  it("R14: a stale row version, and a project whose document is being generated, can't be deleted", async () => {
    const owner = await createPerson();
    const stale = await newProject(owner);
    await updateDecisionDetails(owner.actor, stale.id, { applicant: "x" }, stale.rowVersion);
    await expect(deleteDecision(owner.actor, stale.id, stale.rowVersion)).rejects.toThrow(/changed since you loaded/);

    const generating = await newProject(owner);
    await forceStatus(generating.id, "finishing");
    const current = await getDecision(owner.actor, generating.id);
    await expect(deleteDecision(owner.actor, generating.id, current.rowVersion)).rejects.toThrow(/being generated/);
  });

  it("R14: someone else's project can't be deleted, and the answer reveals nothing", async () => {
    const owner = await createPerson();
    const other = await createPerson();
    const project = await newProject(owner);
    await expect(deleteDecision(other.actor, project.id, project.rowVersion)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDecision(owner.actor, project.id)).resolves.toMatchObject({ id: project.id });
  });

  it("race test: two deletes of one project fired at once — exactly one succeeds", async () => {
    const owner = await createPerson();
    const project = await newProject(owner);
    const results = await Promise.allSettled([
      deleteDecision(owner.actor, project.id, project.rowVersion),
      deleteDecision(owner.actor, project.id, project.rowVersion),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("R4: only in-progress decisions are requeued when rules or data change", () => {
  it("R4: listOpenDecisions excludes completed, generating, and deleted decisions", async () => {
    const owner = await createPerson();
    const open = await newProject(owner, "open");
    const completed = await newProject(owner, "completed");
    const generating = await newProject(owner, "generating");
    const deleted = await newProject(owner, "deleted");
    await forceStatus(completed.id, "report_released");
    await forceStatus(generating.id, "finishing");
    await deleteDecision(owner.actor, deleted.id, deleted.rowVersion);

    const ids = (await listOpenDecisions(city.id)).map((d) => d.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(completed.id);
    expect(ids).not.toContain(generating.id);
    expect(ids).not.toContain(deleted.id);
  });
});
