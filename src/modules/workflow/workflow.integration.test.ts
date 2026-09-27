import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { runAnalysis } from "@/modules/analysis";
import {
  createDecision,
  getDecision,
  reopen,
  saveGeometry,
  SAMPLE_FOOTPRINT,
  SAMPLE_STUDY_AREA,
} from "@/modules/decisions";
import { getDocumentFile, listDocumentVersions } from "@/modules/reports";
import { markReportFailed, renderAndStoreReport } from "@/modules/reports/render-and-store";
import { renderReportHtml } from "@/modules/reports/render";
import { db } from "@/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";

import { expectDbError } from "../../../tests/support/db-errors";
import { createAnalyzedSampleProject, createPerson, createReadyCity, type City, type Person } from "../../../tests/support/factories";

import { PHASES } from "./phases";
import { recordReview } from "./reviews";
import { cancelResearchChange, finishResearch } from "./finish";
import { getFinishReadiness } from "./readiness";
import { getWorkflow } from "./workflow";

// TechDesign/research-phases.md and research-changes.md — integration tests against the real PostgreSQL with
// PostGIS and, for the document, the real Chromium that prints the PDF. Requires Docker and Playwright's
// Chromium. Run with `npm run test:integration`.

let city: City;
beforeAll(async () => {
  city = await createReadyCity();
});

async function sampleProject(planner?: Person) {
  const owner = planner ?? (await createPerson());
  const project = await createAnalyzedSampleProject(owner, city);
  return { owner, project };
}

async function reviewAll(owner: Person, decisionId: string) {
  const w = await getWorkflow(owner.actor, decisionId);
  for (const view of w.phases) {
    if (view.state.kind === "reviewed" || !view.output) continue;
    await recordReview(owner.actor, decisionId, {
      phase: view.phase,
      verdict: "reviewed",
      note: null,
      expectedContentSha256: view.output.contentSha256,
    });
  }
}

async function finish(owner: Person, decisionId: string, changeNote: string | null = null) {
  const decision = await getDecision(owner.actor, decisionId);
  return finishResearch(owner.actor, decisionId, { changeNote, expectedRowVersion: decision.rowVersion });
}

describe("F21 R1–R5: every phase has a drafted output and a derived review state", () => {
  it("R4/R5: with a study area, a footprint, and a current analysis, all six phases have output and need review", async () => {
    const { owner, project } = await sampleProject();
    const w = await getWorkflow(owner.actor, project.id);
    expect(w.phases.map((p) => p.phase)).toEqual([...PHASES]);
    for (const view of w.phases) {
      expect(view.output, view.phase).not.toBeNull();
      expect(view.state.kind, view.phase).toBe("needs-review");
    }
    expect(w.usesSampleData).toBe(true);
  });

  it("R4: a project with no footprint has no Footprint or Impact output, and says why", async () => {
    const owner = await createPerson();
    const bare = await createDecision(owner.actor, { jurisdictionId: city.id, title: "No footprint", applicationType: "subdivision" });
    await saveGeometry(owner.actor, bare.id, "study_area", SAMPLE_STUDY_AREA, "Study area only", 1);
    await runAnalysis(bare.id, "current");
    const w = await getWorkflow(owner.actor, bare.id);
    const byPhase = Object.fromEntries(w.phases.map((p) => [p.phase, p]));
    expect(byPhase["footprint"]?.state).toEqual({ kind: "to-do", reason: "no-footprint" });
    expect(byPhase["impact"]?.state).toEqual({ kind: "to-do", reason: "no-footprint" });
    expect(byPhase["screening"]?.output).not.toBeNull(); // F14 R11: screening needs no footprint
    expect(byPhase["studies"]?.output).not.toBeNull();
  });

  it("R2/R3: the drafted output is deterministic, and never renders a verdict-shaped word", async () => {
    const { owner, project } = await sampleProject();
    const first = await getWorkflow(owner.actor, project.id);
    const second = await getWorkflow(owner.actor, project.id);
    expect(first.phases.map((p) => p.output?.contentSha256)).toEqual(second.phases.map((p) => p.output?.contentSha256));
    const text = first.phases.flatMap((p) => [p.output?.headline ?? "", ...(p.output?.lines ?? [])]).join("\n");
    expect(text).not.toMatch(/\b(safe|clear(ed|ance)?|waive[dr]?|acceptable|recommend\w*|approv\w*|den(y|ied|ial)|no study (is )?needed|not required)\b/i);
    // P2: the register never reads as a clearance, and a study with no flag says the city decides.
    expect(text).toContain("Nothing mapped is not the same as nothing present");
    expect(text).toContain("not flagged by mapped data. The city decides which studies an application needs.");
  });
});

describe("F21 R6–R8, R12: reviews", () => {
  it("R6/R5: a review makes the phase 'reviewed'; a revision request needs a note and makes it 'revision-requested'", async () => {
    const { owner, project } = await sampleProject();
    const w = await getWorkflow(owner.actor, project.id);
    const site = w.phases.find((p) => p.phase === "site");
    const evidence = w.phases.find((p) => p.phase === "evidence");
    if (!site?.output || !evidence?.output) throw new Error("expected outputs");

    await recordReview(owner.actor, project.id, { phase: "site", verdict: "reviewed", note: "Boundary matches the plan.", expectedContentSha256: site.output.contentSha256 });
    await expect(
      recordReview(owner.actor, project.id, { phase: "evidence", verdict: "revision_requested", note: "  ", expectedContentSha256: evidence.output.contentSha256 }),
    ).rejects.toThrow(/Say what needs work/);
    await recordReview(owner.actor, project.id, { phase: "evidence", verdict: "revision_requested", note: "Check the alternate wetlands source.", expectedContentSha256: evidence.output.contentSha256 });

    const after = await getWorkflow(owner.actor, project.id);
    expect(after.phases.find((p) => p.phase === "site")?.state.kind).toBe("reviewed");
    expect(after.phases.find((p) => p.phase === "evidence")?.state.kind).toBe("revision-requested");
    expect(after.phases.find((p) => p.phase === "screening")?.state.kind).toBe("needs-review");
  });

  it("R7: a review made on an output that has since changed is refused, and nothing is recorded", async () => {
    const { owner, project } = await sampleProject();
    const before = (await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "site");
    if (!before?.output) throw new Error("expected output");
    await saveGeometry(owner.actor, project.id, "study_area", { type: "MultiPolygon", coordinates: [[[[-122.05, 47.59], [-122.02, 47.59], [-122.02, 47.62], [-122.05, 47.62], [-122.05, 47.59]]]] }, "Redrawn", 2);
    await expect(
      recordReview(owner.actor, project.id, { phase: "site", verdict: "reviewed", note: null, expectedContentSha256: before.output.contentSha256 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "site")?.history).toHaveLength(0);
  });

  it("R5/R10: after an input changes, a reviewed phase asks again and shows the sentences added and removed", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    expect((await getWorkflow(owner.actor, project.id)).phases.every((p) => p.state.kind === "reviewed")).toBe(true);

    await saveGeometry(owner.actor, project.id, "study_area", { type: "MultiPolygon", coordinates: [[[[-122.05, 47.59], [-122.0, 47.59], [-122.0, 47.62], [-122.05, 47.62], [-122.05, 47.59]]]] }, "Redrawn wider", 2);
    const site = (await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "site");
    expect(site?.state.kind).toBe("needs-review");
    expect(site?.state.kind === "needs-review" && site.state.changedSince?.verdict).toBe("reviewed");
    expect(site?.changes?.added.some((l) => l.startsWith("Study area drawn:") || l.includes("Source:"))).toBe(true);
    expect(site?.changes?.removed.length).toBeGreaterThan(0);
    expect(site?.history).toHaveLength(1);

    // The analysis phases are 'updating' until the new run finishes, never showing the old output as current (R4).
    const evidence = (await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "evidence");
    expect(evidence?.state.kind).toBe("updating");
    expect(evidence?.output).toBeNull();
  });

  it("R8: reviews are append-only, even by SQL", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    await expectDbError(db.execute(sql`update phase_review set note = 'x' where decision_id = ${project.id}`), /append-only/);
    await expectDbError(db.execute(sql`delete from phase_review where decision_id = ${project.id}`), /append-only/);
  });

  it("R6: the database refuses a revision request with no note, whatever the application does", async () => {
    const { owner, project } = await sampleProject();
    await expectDbError(
      db.execute(sql`insert into phase_review (decision_id, phase, content_sha256, verdict, summary, reviewed_by) values (${project.id}, 'site', 'abc', 'revision_requested', '{}'::jsonb, ${owner.userId})`),
      /phase_review_note_shape/,
    );
  });

  it("R12: a completed project can't be reviewed, and someone else's project can't be seen", async () => {
    const { owner, project } = await sampleProject();
    const view = (await getWorkflow(owner.actor, project.id)).phases[0];
    await db.execute(sql`update decision set status = 'report_released' where id = ${project.id}`);
    await expect(
      recordReview(owner.actor, project.id, { phase: "site", verdict: "reviewed", note: null, expectedContentSha256: view?.output?.contentSha256 ?? "x".repeat(64) }),
    ).rejects.toThrow(/Start a research change/);
    const stranger = await createPerson();
    await expect(getWorkflow(stranger.actor, project.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("R7 race test: a review and a boundary save at once — the review is of the output it saw, or it is refused", async () => {
    const { owner, project } = await sampleProject();
    const site = (await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "site");
    if (!site?.output) throw new Error("expected output");
    const oldHash = site.output.contentSha256;

    const results = await Promise.allSettled([
      recordReview(owner.actor, project.id, { phase: "site", verdict: "reviewed", note: null, expectedContentSha256: oldHash }),
      saveGeometry(owner.actor, project.id, "study_area", { type: "MultiPolygon", coordinates: [[[[-122.05, 47.59], [-122.0, 47.59], [-122.0, 47.62], [-122.05, 47.62], [-122.05, 47.59]]]] }, "Concurrent redraw", 2),
    ]);
    expect(results[1].status).toBe("fulfilled"); // the boundary save always lands
    const after = (await getWorkflow(owner.actor, project.id)).phases.find((p) => p.phase === "site");
    // Whatever the order, no review is bound to an output other than the one the reviewer saw.
    expect(after?.history.every((r) => r.contentSha256 === oldHash)).toBe(true);
    if (results[0].status === "rejected") expect(results[0].reason).toBeInstanceOf(ConflictError);
    expect(after?.state.kind).toBe("needs-review"); // the new boundary is a new output either way
  });
});

describe("F22: finishing research, versions, and research changes (with a real PDF)", () => {
  it("R1: finishing needs every phase reviewed, and says which are not", async () => {
    const { owner, project } = await sampleProject();
    await expect(finish(owner, project.id)).rejects.toThrow(/Review Site, Evidence, Screening, Studies, Footprint and Impact first/);
    const readiness = await getFinishReadiness(owner.actor, project.id);
    expect(readiness.blocking.filter((b) => b.key === "phase-not-reviewed")).toHaveLength(6);
    expect(readiness.stated.map((s) => s.key)).toEqual(["evidence-gaps", "source-disagreements", "approximate-boundaries", "desk-analysis-limits"]);
  });

  it("R1/R2/R5/R6/R7/R8/R9/R10: version 1, a research change, version 2, and both versions kept", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    const readyReadiness = await getFinishReadiness(owner.actor, project.id);
    expect(readyReadiness.blocking).toEqual([]);

    // --- Finish: the project becomes read-only while the document is generated (R8).
    const { reportId } = await finish(owner, project.id);
    expect((await getDecision(owner.actor, project.id)).status).toBe("finishing");
    await expect(
      saveGeometry(owner.actor, project.id, "footprint", SAMPLE_FOOTPRINT, "during generation", 2),
    ).rejects.toThrow(/being generated/);
    await expect(finish(owner, project.id)).rejects.toThrow(/being generated/);

    // --- The worker's job body: renders from pinned records, prints the PDF, stores it as version 1.
    const html = await renderReportHtml(reportId);
    expect(html).toContain("Version 1");
    expect(html).toContain("Sample data (illustrative) —"); // provenance carries the sample label
    expect(html).toContain("Sample data."); // and the first page says so (F23 R6)
    expect(html).toContain("Review record");
    expect(html).not.toMatch(/\b(recommend\w*|clear to develop|should be approved|acceptable impact)\b/i);
    await renderAndStoreReport(reportId);
    await renderAndStoreReport(reportId); // a retry after success does nothing

    expect((await getDecision(owner.actor, project.id)).status).toBe("report_released");
    const v1 = await listDocumentVersions(owner.actor, project.id);
    expect(v1).toHaveLength(1);
    expect(v1[0]).toMatchObject({ versionNumber: 1, isLatest: true, previousVersion: null, usesSampleData: true });
    expect(v1[0]?.changedPhases).toHaveLength(6);
    const file1 = await getDocumentFile(owner.actor, project.id, 1);
    expect(file1.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(file1.filename).toBe("sammamish-ridge-estates-sample-v1.pdf");
    expect(file1.bytes.toString("latin1")).toContain("/StructTreeRoot"); // tagged (F10 R8)
    expect(file1.bytes.toString("latin1")).toContain("/Outlines"); // with an outline

    // --- A published row can't change or be deleted (R2).
    await expectDbError(db.execute(sql`update report set pdf_sha256 = 'x' where id = ${reportId}`), /is final/);
    await expectDbError(db.execute(sql`delete from report where id = ${reportId}`), /append-only/);

    // --- A completed project is read-only until a research change starts (R3).
    await expect(saveGeometry(owner.actor, project.id, "footprint", SAMPLE_FOOTPRINT, "edit", 2)).rejects.toThrow(/Start a research change/);

    // --- Start a research change: nothing differs yet, so it can't be finished, but it can be cancelled (R6, R7).
    const completed = await getDecision(owner.actor, project.id);
    await reopen(owner.actor, project.id, completed.rowVersion);
    await runAnalysis(project.id, "current"); // the enqueued run: identical inputs make it a no-op
    const open = await getWorkflow(owner.actor, project.id);
    expect(open.change?.hasChanges).toBe(false);
    expect(open.change?.baseVersion).toBe(1);
    await expect(finish(owner, project.id, "no change")).rejects.toThrow(/Nothing has changed since version 1/);
    const reopened = await getDecision(owner.actor, project.id);
    await cancelResearchChange(owner.actor, project.id, reopened.rowVersion);
    expect((await getDecision(owner.actor, project.id)).status).toBe("report_released");

    // --- Start again, and change the footprint: only Footprint and Impact change (R5).
    const again = await getDecision(owner.actor, project.id);
    await reopen(owner.actor, project.id, again.rowVersion);
    const smaller = { type: "MultiPolygon" as const, coordinates: [[[[-122.02, 47.595], [-122.01, 47.595], [-122.01, 47.605], [-122.02, 47.605], [-122.02, 47.595]]]] };
    await saveGeometry(owner.actor, project.id, "footprint", smaller, "Smaller footprint after the applicant revised the plan", 2);
    await runAnalysis(project.id, "current");
    const changed = await getWorkflow(owner.actor, project.id);
    expect(changed.change?.phases.filter((p) => p.changed).map((p) => p.phase).sort()).toEqual(["footprint", "impact"]);
    expect(changed.change?.phases.filter((p) => !p.changed).every((p) => p.reviewedAtCurrentOutput)).toBe(true); // unchanged phases keep their review
    await expect(finish(owner, project.id, "New footprint")).rejects.toThrow(/Review Footprint and Impact first/);

    // A cancel is refused once something changed.
    const withChange = await getDecision(owner.actor, project.id);
    await expect(cancelResearchChange(owner.actor, project.id, withChange.rowVersion)).rejects.toThrow(/has changes in it/);

    // --- Review the two changed phases, then finishing needs a reason (R6), and publishes version 2.
    await reviewAll(owner, project.id);
    await expect(finish(owner, project.id, null)).rejects.toThrow(/Give a short reason/);
    const second = await finish(owner, project.id, "New footprint after the applicant revised the plan");
    const html2 = await renderReportHtml(second.reportId);
    expect(html2).toContain("Version 2");
    expect(html2).toContain("What changed since version 1");
    expect(html2).toContain("New footprint after the applicant revised the plan");
    await renderAndStoreReport(second.reportId);

    // --- The history has both, newest first, and version 1 is byte-for-byte what it was (R2, R9).
    const versions = await listDocumentVersions(owner.actor, project.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ isLatest: true, previousVersion: 1, changeNote: "New footprint after the applicant revised the plan", detailsChanged: false });
    expect(versions[0]?.changedPhases.sort()).toEqual(["footprint", "impact"]);
    expect(versions[1]?.isLatest).toBe(false);
    expect((await getDocumentFile(owner.actor, project.id, 1)).sha256).toBe(file1.sha256);
    expect((await getDocumentFile(owner.actor, project.id, 2)).sha256).not.toBe(file1.sha256);
  }, 120_000);

  it("R12: someone else can't download a document, and an unpublished version doesn't exist", async () => {
    const { owner, project } = await sampleProject();
    const stranger = await createPerson();
    await expect(getDocumentFile(stranger.actor, project.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDocumentFile(owner.actor, project.id, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("R8: a document that fails after its last retry is recorded, the project returns to in progress, and no version number is used", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    const { reportId } = await finish(owner, project.id);

    await markReportFailed(reportId, "Chromium could not start");
    const decision = await getDecision(owner.actor, project.id);
    expect(decision.status).toBe("in_progress");
    const rows = await db.execute<{ status: string; version_number: number | null; error_detail: string }>(
      sql`select status, version_number, error_detail from report where id = ${reportId}`,
    );
    expect(rows.rows[0]).toEqual({ status: "failed", version_number: null, error_detail: "Chromium could not start" });
    await expectDbError(db.execute(sql`update report set error_detail = 'x' where id = ${reportId}`), /is final/);

    // finishing again works, and the eventual version is still version 1
    const retry = await finish(owner, project.id);
    await renderAndStoreReport(retry.reportId);
    expect((await listDocumentVersions(owner.actor, project.id)).map((v) => v.versionNumber)).toEqual([1]);
  }, 120_000);

  it("R8 race test: two finishes of one project at once — exactly one succeeds", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    const decision = await getDecision(owner.actor, project.id);
    const attempt = () => finishResearch(owner.actor, project.id, { changeNote: null, expectedRowVersion: decision.rowVersion });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
    const reports = await db.execute<{ n: number }>(sql`select count(*)::int as n from report where decision_id = ${project.id}`);
    expect(reports.rows[0]?.n).toBe(1);
  });

  it("R8/R11 race test: finishing and a boundary save at once — the document is of what was reviewed, or the finish fails", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    const decision = await getDecision(owner.actor, project.id);
    const results = await Promise.allSettled([
      finishResearch(owner.actor, project.id, { changeNote: null, expectedRowVersion: decision.rowVersion }),
      saveGeometry(owner.actor, project.id, "footprint", SAMPLE_FOOTPRINT, "concurrent edit", 2),
    ]);
    const finished = results[0].status === "fulfilled";
    const saved = results[1].status === "fulfilled";
    // One lock serializes them: the finish came first (and the save was refused as the project is
    // finishing), or the save came first (and the finish saw the unreviewed new output and refused).
    expect(finished !== saved).toBe(true);
    const status = (await getDecision(owner.actor, project.id)).status;
    expect(status).toBe(finished ? "finishing" : "in_progress");
  });

  it("R6: a finish with a stale page (the row version moved) is refused", async () => {
    const { owner, project } = await sampleProject();
    await reviewAll(owner, project.id);
    await expect(finishResearch(owner.actor, project.id, { changeNote: null, expectedRowVersion: 9999 })).rejects.toBeInstanceOf(ConflictError);
    await expect(finishResearch(owner.actor, project.id, { changeNote: "x".repeat(2000), expectedRowVersion: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
});
