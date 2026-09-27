import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDecision, createSampleProject, saveGeometry, SAMPLE_FOOTPRINT, updateDecisionDetails } from "@/modules/decisions";
import { buildSampleProfileDocument, type ProfileDocument } from "@/modules/profiles";
import { db } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";

import { expectDbError } from "../../../tests/support/db-errors";
import { createAnalyzedSampleProject, createPerson, createReadyCity, type City } from "../../../tests/support/factories";

import { pinInputs } from "./pin-inputs";
import { getRun, readRunResults, runAnalysis } from "./run";
import { listResolutions, saveResolution } from "./resolutions";
import { getAnalysisStatus } from "./status";

// TechDesign/decision-overview.md, evidence-base.md, study-scoping.md, evidence-review.md — integration
// tests against the real PostgreSQL with PostGIS, every migration applied.

let city: City;
beforeAll(async () => {
  city = await createReadyCity();
});

const square = (west: number) => ({
  type: "MultiPolygon" as const,
  coordinates: [[[[west, 47.6], [west + 0.01, 47.6], [west + 0.01, 47.61], [west, 47.61], [west, 47.6]]]],
});

async function analyzedSample() {
  const planner = await createPerson();
  const project = await createAnalyzedSampleProject(planner, city);
  return { planner, project };
}

async function runCount(decisionId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from analysis_run where decision_id = ${decisionId}`);
  return rows.rows[0]?.n ?? 0;
}

describe("F18 R7: the analysis status for the current inputs", () => {
  it("R7: 'none' with no study area, then 'out-of-date' once one is saved and no run exists yet", async () => {
    const planner = await createPerson();
    const project = await createDecision(planner.actor, { jurisdictionId: city.id, title: "Status", applicationType: "subdivision" });
    expect(await getAnalysisStatus(planner.actor, project.id)).toEqual({ kind: "none", reason: "no-study-area" });

    await saveGeometry(planner.actor, project.id, "study_area", square(-122.03), "v1", 1);
    expect(await getAnalysisStatus(planner.actor, project.id)).toEqual({ kind: "out-of-date", changes: [] });
  });

  it("R7: 'current' after the run, and 'out-of-date' with the exact change after a new footprint", async () => {
    const { planner, project } = await analyzedSample();
    const current = await getAnalysisStatus(planner.actor, project.id);
    expect(current.kind).toBe("current");

    await saveGeometry(planner.actor, project.id, "footprint", SAMPLE_FOOTPRINT, "moved", 2);
    expect(await getAnalysisStatus(planner.actor, project.id)).toEqual({
      kind: "out-of-date",
      changes: [{ kind: "footprint", from: 1, to: 2 }],
    });

    await runAnalysis(project.id, "current");
    expect((await getAnalysisStatus(planner.actor, project.id)).kind).toBe("current");
  });

  it("R7: a new study area is reported as such, with both revisions", async () => {
    const { planner, project } = await analyzedSample();
    await saveGeometry(planner.actor, project.id, "study_area", square(-122.05), "redrawn", 2);
    expect(await getAnalysisStatus(planner.actor, project.id)).toEqual({
      kind: "out-of-date",
      changes: [{ kind: "study-area", from: 1, to: 2 }],
    });
  });

  it("R7: 'running' while a run for the current inputs is in flight, and 'failed' with its error", async () => {
    const { planner, project } = await analyzedSample();
    await saveGeometry(planner.actor, project.id, "study_area", square(-122.05), "redrawn", 2);
    const pin = await pinInputs(project.id, "current");
    if (pin.kind !== "ready") throw new Error("expected to pin");

    await db.execute(sql`
      insert into analysis_run (decision_id, purpose, profile_version_id, rules_resolved_for, study_area_revision, footprint_revision, results_version, input_sha256, status)
      values (${project.id}, 'current', ${pin.pinned.profileVersionId}, ${JSON.stringify(pin.pinned.resolvedFor)}::jsonb, 2, 1, ${pin.pinned.resultsVersion}, ${pin.pinned.inputSha256}, 'running')`);
    const running = await getAnalysisStatus(planner.actor, project.id);
    expect(running.kind).toBe("running");

    // A crashed attempt's running row is taken over and finished by the retry.
    await runAnalysis(project.id, "current");
    expect((await getAnalysisStatus(planner.actor, project.id)).kind).toBe("current");
  });

  it("R7: a failed run for the current inputs shows its error, and a retry computes again beside it", async () => {
    const { planner, project } = await analyzedSample();
    await saveGeometry(planner.actor, project.id, "study_area", square(-122.05), "redrawn", 2);
    const pin = await pinInputs(project.id, "current");
    if (pin.kind !== "ready") throw new Error("expected to pin");
    await db.execute(sql`
      insert into analysis_run (decision_id, purpose, profile_version_id, rules_resolved_for, study_area_revision, footprint_revision, results_version, input_sha256, status, error_detail, finished_at)
      values (${project.id}, 'current', ${pin.pinned.profileVersionId}, ${JSON.stringify(pin.pinned.resolvedFor)}::jsonb, 2, 1, ${pin.pinned.resultsVersion}, ${pin.pinned.inputSha256}, 'failed', 'connection reset', now())`);

    expect(await getAnalysisStatus(planner.actor, project.id)).toMatchObject({ kind: "failed", errorDetail: "connection reset" });
    await runAnalysis(project.id, "current"); // the failed run is final; the retry inserts a new one
    expect((await getAnalysisStatus(planner.actor, project.id)).kind).toBe("current");
  });

  it("R7: a vesting rule set with no filing date is 'blocked' with the reason, and no default date stands in", async () => {
    const vesting: ProfileDocument = {
      ...buildSampleProfileDocument(),
      settings: { ...buildSampleProfileDocument().settings, vesting: [{ ruleSet: "critical-areas", vests: true }, { ruleSet: "trees", vests: false }] },
    };
    const vestingCity = await createReadyCity({ profile: vesting });
    const planner = await createPerson();
    const project = await createSampleProject(planner.actor, vestingCity.id);
    // the sample carries a filing date; clear it the way a person would, then check the message
    const noDate = await createDecision(planner.actor, { jurisdictionId: vestingCity.id, title: "No date", applicationType: "subdivision" });
    await saveGeometry(planner.actor, noDate.id, "study_area", square(-122.03), "v1", 1);
    expect(await getAnalysisStatus(planner.actor, noDate.id)).toMatchObject({ kind: "blocked", reason: expect.stringContaining("no application_filed_on") });
    // The job's own pinInputs throws the same ValidationError: the run fails visibly, and no run row is written.
    await expect(runAnalysis(noDate.id, "current")).rejects.toBeInstanceOf(ValidationError);
    expect(await runCount(noDate.id)).toBe(0);
    expect(project.applicationFiledOn).toBe("2026-08-01");
  });

  it("R7: someone else's project can't be asked about", async () => {
    const { project } = await analyzedSample();
    const other = await createPerson();
    await expect(getAnalysisStatus(other.actor, project.id)).rejects.toThrow("project not found");
  });
});

describe("F18 R7: the pinned inputs don't go out of date at midnight", () => {
  it("R7: a non-vesting decision hashes the same on two consecutive days", async () => {
    const { project } = await analyzedSample();
    const day1 = await pinInputs(project.id, "current", undefined, () => new Date("2026-09-27T20:00:00Z"));
    const day2 = await pinInputs(project.id, "current", undefined, () => new Date("2026-09-28T20:00:00Z"));
    if (day1.kind !== "ready" || day2.kind !== "ready") throw new Error("expected to pin");
    expect(day1.pinned.resolvedFor["critical-areas"]).not.toBe(day2.pinned.resolvedFor["critical-areas"]); // the dates differ...
    expect(day1.pinned.inputSha256).toBe(day2.pinned.inputSha256); // ...the hash doesn't
  });

  it("R7: the hash changes when a rule takes effect, which is a change to the rules in force", async () => {
    const future = buildSampleProfileDocument();
    future.bufferRules.push({
      key: "wetlands-buffer-later",
      resourceType: "wetlands",
      appliesWhen: null,
      widthFt: 150,
      citation: { codeSection: "Test section", ordinance: null, sourceUrl: "https://example.test/rule" },
      effectiveOn: "2031-01-01",
      repealedOn: null,
    });
    const laterCity = await createReadyCity({ profile: future });
    const planner = await createPerson();
    const project = await createSampleProject(planner.actor, laterCity.id);
    const before = await pinInputs(project.id, "current", undefined, () => new Date("2030-12-31T20:00:00Z"));
    const after = await pinInputs(project.id, "current", undefined, () => new Date("2031-01-01T20:00:00Z"));
    if (before.kind !== "ready" || after.kind !== "ready") throw new Error("expected to pin");
    expect(before.pinned.inputSha256).not.toBe(after.pinned.inputSha256);
  });
});

describe("F7 R8 / F14 R13: an analysis run is deterministic and never duplicated", () => {
  it("R8: running twice on unchanged inputs inserts one run", async () => {
    const { project } = await analyzedSample();
    expect(await runCount(project.id)).toBe(1);
    await runAnalysis(project.id, "current");
    expect(await runCount(project.id)).toBe(1);
  });

  it("R8: two runs started at once leave one run, and neither fails", async () => {
    const planner = await createPerson();
    const project = await createSampleProject(planner.actor, city.id);
    await Promise.all([runAnalysis(project.id, "current"), runAnalysis(project.id, "current")]);
    expect(await runCount(project.id)).toBe(1);
  });

  it("R13: a finished run can't be changed or deleted, by SQL either", async () => {
    const { project } = await analyzedSample();
    await expectDbError(db.execute(sql`update analysis_run set error_detail = 'x' where decision_id = ${project.id}`), /is final/);
    await expectDbError(db.execute(sql`delete from analysis_run where decision_id = ${project.id}`), /append-only/);
  });

  it("R13: an old results version is reported as out of date and never parsed", async () => {
    const { project } = await analyzedSample();
    const status = await getAnalysisStatus((await createPerson()).actor, project.id).catch((e: unknown) => e);
    expect(status).toBeInstanceOf(Error); // not their project
    const [run] = (await db.execute<{ id: string }>(sql`select id from analysis_run where decision_id = ${project.id}`)).rows;
    const row = await getRun(run?.id ?? "");
    expect(readRunResults({ resultsVersion: 1, results: row?.results })).toBeNull();
    expect(readRunResults({ resultsVersion: 2, results: row?.results })).not.toBeNull();
  });
});

describe("F23 R5: the sample exercises every phase", () => {
  it("R5: the sample project's run has a direct impact, a buffer impact, a disagreement, a gap, a flag, and an unflagged study", async () => {
    const { planner, project } = await analyzedSample();
    const status = await getAnalysisStatus(planner.actor, project.id);
    if (status.kind !== "current") throw new Error("expected a current run");
    const run = await getRun(status.runId);
    const results = run ? readRunResults(run) : null;
    if (!results) throw new Error("expected results");

    expect(results.impacts.some((i) => i.measure === "feature-area-in-footprint" && i.resourceType === "wetlands")).toBe(true);
    expect(results.impacts.some((i) => i.measure === "buffer-area-in-footprint")).toBe(true);
    expect(results.evidenceBase.disagreements.some((d) => d.resourceType === "wetlands")).toBe(true);
    expect(results.evidenceBase.gaps).toContainEqual({ resourceType: "critical-aquifer-recharge-areas", reason: "no-dataset-mapped" });
    expect(results.studyFlags.length).toBeGreaterThan(0);
    const flagged = new Set(results.studyFlags.map((f) => f.study));
    expect(flagged.has("critical-area-study")).toBe(true);
    expect(flagged.has("arborist-report")).toBe(false); // the canopy sits outside the study area: not flagged by mapped data
    expect(results.screening.some((r) => r.approximate)).toBe(true);
    expect(results.limits.map((l) => l.key)).toEqual(
      expect.arrayContaining(["significant-trees-not-countable", "boundary-set-by-site-study", "dataset-limitation"]),
    );
  });

  it("R4: sample data is labeled in provenance, and nothing in the run reads the label", async () => {
    const { planner, project } = await analyzedSample();
    const status = await getAnalysisStatus(planner.actor, project.id);
    if (status.kind !== "current") throw new Error("expected a current run");
    const datasets = await db.execute<{ is_sample: boolean }>(
      sql`select d.is_sample from analysis_run_dataset ard join dataset_version v on v.id = ard.dataset_version_id join dataset d on d.id = v.dataset_id where ard.analysis_run_id = ${status.runId}`,
    );
    expect(datasets.rows.length).toBeGreaterThan(0);
    expect(datasets.rows.every((r) => r.is_sample)).toBe(true);
  });
});

describe("F19: a resolution is a note, never an input", () => {
  async function firstDisagreement() {
    const { planner, project } = await analyzedSample();
    const status = await getAnalysisStatus(planner.actor, project.id);
    if (status.kind !== "current") throw new Error("expected a current run");
    const run = await getRun(status.runId);
    const results = run ? readRunResults(run) : null;
    const d = results?.evidenceBase.disagreements[0];
    if (!d) throw new Error("the sample has a disagreement");
    return { planner, project, disagreement: d, runId: status.runId, results };
  }
  const input = (d: { resourceType: string; mappedBy: string; notMappedBy: string }, revision = 1) => ({
    resourceType: d.resourceType,
    mappedBy: d.mappedBy,
    notMappedBy: d.notMappedBy,
    reliedOn: "mapped_by" as const,
    rationale: "The county's delineation is the more recent survey.",
    expectedRevision: revision,
  });

  it("R7/R8: recording one changes no measurement and queues no run, and it is kept as a revision", async () => {
    const { planner, project, disagreement, runId, results } = await firstDisagreement();
    const runsBefore = await runCount(project.id);
    const saved = await saveResolution(planner.actor, project.id, input(disagreement));
    expect(saved.revision).toBe(1);

    expect(await runCount(project.id)).toBe(runsBefore);
    expect(await getAnalysisStatus(planner.actor, project.id)).toEqual({ kind: "current", runId }); // the same run, still current
    const after = await getRun(runId);
    expect(after?.results).toEqual(results); // jsonb keeps content, not key order: compared structurally

    const second = await saveResolution(planner.actor, project.id, { ...input(disagreement, 2), reliedOn: "neither" });
    expect(second.revision).toBe(2);
    expect((await listResolutions(planner.actor, project.id)).map((r) => r.revision)).toEqual([1, 2]);
  });

  it("R8: a saved resolution can't be edited or deleted", async () => {
    const { planner, project, disagreement } = await firstDisagreement();
    await saveResolution(planner.actor, project.id, input(disagreement));
    await expectDbError(db.execute(sql`update evidence_resolution set rationale = 'x' where decision_id = ${project.id}`), /append-only/);
    await expectDbError(db.execute(sql`delete from evidence_resolution where decision_id = ${project.id}`), /append-only/);
  });

  it("R11: a resolution for a pair the run doesn't report is rejected", async () => {
    const { planner, project, disagreement } = await firstDisagreement();
    await expect(
      saveResolution(planner.actor, project.id, { ...input(disagreement), resourceType: "streams" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      saveResolution(planner.actor, project.id, { ...input(disagreement), rationale: "   " }),
    ).rejects.toThrow(/Say why/);
  });

  it("R10 race test: two saves of one revision at once — exactly one succeeds, the other is a conflict", async () => {
    const { planner, project, disagreement } = await firstDisagreement();
    const results = await Promise.allSettled([
      saveResolution(planner.actor, project.id, input(disagreement)),
      saveResolution(planner.actor, project.id, { ...input(disagreement), reliedOn: "not_mapped_by" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("R13 of decisions.md: a resolution can't be recorded on a completed project", async () => {
    const { planner, project, disagreement } = await firstDisagreement();
    await db.execute(sql`update decision set status = 'report_released' where id = ${project.id}`);
    await expect(saveResolution(planner.actor, project.id, input(disagreement))).rejects.toThrow(/Start a research change/);
  });

  it("R11: the filing date can change without a run for unchanged inputs being duplicated", async () => {
    const { planner, project } = await analyzedSample();
    const current = (await db.execute<{ row_version: number }>(sql`select row_version from decision where id = ${project.id}`)).rows[0];
    await updateDecisionDetails(planner.actor, project.id, { applicationFiledOn: "2026-08-01" }, current?.row_version ?? 0);
    await runAnalysis(project.id, "current");
    expect(await runCount(project.id)).toBe(1);
  });
});
