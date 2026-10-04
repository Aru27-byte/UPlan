import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDecision } from "@/modules/decisions";
import { db } from "@/platform/db";
import { NotFoundError, ValidationError } from "@/platform/errors";

import { expectDbError } from "../../../tests/support/db-errors";
import { createPerson, createReadyCity, type City } from "../../../tests/support/factories";

import { listSectionFeedback, recordSectionFeedback } from "./feedback";

// TechDesign/research-phases.md, "Report-section feedback" — integration tests against the real PostgreSQL.
// Requires Docker. Run with `npm run test:integration`.

let city: City;
beforeAll(async () => {
  city = await createReadyCity();
});

async function newProject() {
  const owner = await createPerson();
  const project = await createDecision(owner.actor, { jurisdictionId: city.id, title: "Feedback test", applicationType: "subdivision" });
  return { owner, project };
}

describe("F21 R15: feedback on the report section a step feeds", () => {
  it("R15: a note is recorded with its author and listed newest first, per step", async () => {
    const { owner, project } = await newProject();
    await recordSectionFeedback(owner.actor, project.id, { step: "evidence", note: "  Put the source table first.  " });
    await recordSectionFeedback(owner.actor, project.id, { step: "evidence", note: "Show the confidence beside each source." });
    await recordSectionFeedback(owner.actor, project.id, { step: "impact", note: "A different step." });

    const evidence = await listSectionFeedback(owner.actor, project.id, "evidence");
    expect(evidence.map((f) => f.note)).toEqual(["Show the confidence beside each source.", "Put the source table first."]);
    expect(evidence.every((f) => f.step === "evidence")).toBe(true);
    expect(await listSectionFeedback(owner.actor, project.id, "site")).toEqual([]);
  });

  it("R15: an empty note and a 2,001-character note are refused, and so is a step that feeds no section", async () => {
    const { owner, project } = await newProject();
    await expect(recordSectionFeedback(owner.actor, project.id, { step: "site", note: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordSectionFeedback(owner.actor, project.id, { step: "site", note: "x".repeat(2001) })).rejects.toBeInstanceOf(ValidationError);
    // The database says no as well, so no code path stores a blank note or a note for the Report step.
    await expectDbError(
      db.execute(sql`insert into report_section_feedback (decision_id, step, note, created_by) values (${project.id}, 'site', '  ', ${owner.userId})`),
      /report_section_feedback_note_shape/,
    );
    await expectDbError(
      db.execute(sql`insert into report_section_feedback (decision_id, step, note, created_by) values (${project.id}, 'report', 'x', ${owner.userId})`),
      /report_section_feedback_step_check/,
    );
  });

  it("R15: feedback is append-only, even by SQL", async () => {
    const { owner, project } = await newProject();
    await recordSectionFeedback(owner.actor, project.id, { step: "site", note: "Keep it short." });
    await expectDbError(db.execute(sql`update report_section_feedback set note = 'x' where decision_id = ${project.id}`), /append-only/);
    await expectDbError(db.execute(sql`delete from report_section_feedback where decision_id = ${project.id}`), /append-only/);
  });

  it("R15/R12: a completed project takes no feedback, and someone else's project can't be read", async () => {
    const { owner, project } = await newProject();
    await db.execute(sql`update decision set status = 'report_released' where id = ${project.id}`);
    await expect(recordSectionFeedback(owner.actor, project.id, { step: "site", note: "Too late." })).rejects.toThrow(/Start a research change/);
    const stranger = await createPerson();
    await expect(listSectionFeedback(stranger.actor, project.id, "site")).rejects.toBeInstanceOf(NotFoundError);
  });
});
