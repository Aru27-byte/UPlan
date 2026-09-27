import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, NotFoundError, ValidationError, isForeignKeyViolation } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { decision } from "./tables";

// TechDesign/decisions.md. A decision belongs to the person who created it: every function that
// takes a decisionId reaches the row through `getDecision` or `lockEditableDecision`, and both put
// the owner and `deleted_at is null` in the query itself, so a caller never holds a row it may not see
// (accounts-roles.md R3, R6, R7).

export type Decision = typeof decision.$inferSelect;

export const DecisionStatusSchema = z.enum(["in_progress", "finishing", "report_released"]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

/** The dashboard lists at most this many of a person's projects, and says so when it reaches it (project-dashboard.md). */
export const LIST_LIMIT = 100;

const ApplicationTypeSchema = z.enum(["subdivision", "short_subdivision", "clearing_grading"]);
export type ApplicationType = z.infer<typeof ApplicationTypeSchema>;

// A blank form field arrives as "" and means "not recorded": null, never a placeholder (F5 R10).
const OptionalText = z
  .string()
  .trim()
  .max(300)
  .transform((s) => (s === "" ? null : s))
  .nullable();
const OptionalDate = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(z.iso.date("Enter a date as YYYY-MM-DD.").nullable())
  .nullable();

const NewDecisionSchema = z.object({
  jurisdictionId: z.uuid(),
  title: z.string().trim().min(1, "Give the project a title.").max(200),
  applicationType: ApplicationTypeSchema,
  parcelOrAddress: OptionalText.optional(),
  applicant: OptionalText.optional(),
  projectManager: OptionalText.optional(),
  targetDecisionOn: OptionalDate.optional(),
  applicationFiledOn: OptionalDate.optional(),
});
export type NewDecision = z.input<typeof NewDecisionSchema>;

const DetailsPatchSchema = z.object({
  title: z.string().trim().min(1, "Give the project a title.").max(200).optional(),
  applicationType: ApplicationTypeSchema.optional(),
  parcelOrAddress: OptionalText.optional(),
  applicant: OptionalText.optional(),
  projectManager: OptionalText.optional(),
  targetDecisionOn: OptionalDate.optional(),
  applicationFiledOn: OptionalDate.optional(),
});
export type DecisionDetailsPatch = z.input<typeof DetailsPatchSchema>;

function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  return parsed.data;
}

/**
 * Creates the decision inside the caller's transaction, so a sample project (F23) is created with its
 * boundaries or not at all. No analysis is queued: a decision with no study area has nothing to
 * analyze, and the first saved boundary queues it (geometry.ts).
 */
export async function insertDecision(tx: DbOrTx, actor: Actor, input: NewDecision): Promise<Decision> {
  const values = parseOrThrow(NewDecisionSchema, input);
  try {
    const [row] = await tx
      .insert(decision)
      .values({ ...values, status: "in_progress", createdBy: actor.userId })
      .returning();
    if (!row) throw new Error("insert into decision unexpectedly returned no row");
    return row;
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new ValidationError("That city isn't set up in UPlan yet. Ask UPlan staff to add it.");
    }
    throw err;
  }
}

export async function createDecision(actor: Actor, input: NewDecision): Promise<Decision> {
  return db.transaction((tx) => insertDecision(tx, actor, input));
}

export async function getDecision(actor: Actor, decisionId: string): Promise<Decision> {
  const [row] = await db
    .select()
    .from(decision)
    .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)));
  if (!row) throw new NotFoundError("project"); // R1: not yours, deleted, and absent are one answer
  return row;
}

/** The actor's own decisions, newest first — at most LIST_LIMIT (R2). */
export async function listDecisions(actor: Actor): Promise<Decision[]> {
  return db
    .select()
    .from(decision)
    .where(and(eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)))
    .orderBy(desc(decision.createdAt))
    .limit(LIST_LIMIT);
}

/**
 * The one guard every change takes (F21 R12, F22 R3, R8). Locks the decision row for the rest of the
 * transaction, so a change, a review, a finish, and a delete on one project serialize, and returns the
 * locked row. Only an in-progress decision can be changed.
 */
export async function lockEditableDecision(tx: DbOrTx, actor: Actor, decisionId: string): Promise<Decision> {
  const [row] = await tx
    .select()
    .from(decision)
    .where(and(eq(decision.id, decisionId), eq(decision.createdBy, actor.userId), isNull(decision.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("project");
  const status = DecisionStatusSchema.parse(row.status);
  switch (status) {
    case "in_progress":
      return row;
    case "finishing":
      throw new ConflictError("A document is being generated for this project. Try again when it finishes.");
    case "report_released":
      throw new ConflictError("This project is completed. Start a research change to edit it.");
  }
}

// R11, R12: one function edits every project detail, so there is one compare-and-set and one place
// that decides whether an edit needs a new analysis run. It also holds the decision lock, so a details
// edit and a geometry save don't interleave; a geometry save does not bump row_version (its own
// revision key is its guard), so saving a boundary never makes an open details form stale.
export async function updateDecisionDetails(
  actor: Actor,
  decisionId: string,
  patch: DecisionDetailsPatch,
  expectedRowVersion: number,
): Promise<Decision> {
  const changes = parseOrThrow(DetailsPatchSchema, patch);
  return db.transaction(async (tx) => {
    const current = await lockEditableDecision(tx, actor, decisionId);
    const [row] = await tx
      .update(decision)
      .set({ ...definedEntries(changes), rowVersion: sql`row_version + 1` })
      .where(and(eq(decision.id, decisionId), eq(decision.rowVersion, expectedRowVersion)))
      .returning();
    if (!row) throw new ConflictError("This project changed since you loaded it. Reload and try again.");
    // R12: only the filing date is an analysis input, and the change and its job commit together.
    if (changes.applicationFiledOn !== undefined && changes.applicationFiledOn !== current.applicationFiledOn) {
      await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx);
    }
    return row;
  });
}

function definedEntries<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * R14: "Delete research" hides the project and keeps every record, because working data may be public
 * record (F16, D25). One compare-and-set, refused while a document is being generated.
 */
export async function deleteDecision(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<void> {
  const updated = await db
    .update(decision)
    .set({ deletedAt: sql`now()`, deletedBy: actor.userId, rowVersion: sql`row_version + 1` })
    .where(
      and(
        eq(decision.id, decisionId),
        eq(decision.createdBy, actor.userId),
        isNull(decision.deletedAt),
        eq(decision.rowVersion, expectedRowVersion),
        sql`${decision.status} <> 'finishing'`,
      ),
    )
    .returning({ id: decision.id });
  if (updated.length > 0) return;
  // Zero rows: say which reason, without revealing anything about a project that isn't the actor's.
  const current = await getDecision(actor, decisionId); // NotFoundError when it isn't theirs or is already deleted
  throw new ConflictError(
    current.status === "finishing"
      ? "A document is being generated for this project, so it can't be deleted yet."
      : "This project changed since you loaded it. Reload and try again.",
  );
}

/** R8: starts a research change on a completed project — one compare-and-set, and a fresh analysis in the same transaction, since the profile or the datasets may have moved since it was published (F22). */
export async function reopen(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<Decision> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(decision)
      .set({ status: "in_progress", rowVersion: sql`row_version + 1` })
      .where(
        and(
          eq(decision.id, decisionId),
          eq(decision.createdBy, actor.userId),
          isNull(decision.deletedAt),
          eq(decision.rowVersion, expectedRowVersion),
          eq(decision.status, "report_released"),
        ),
      )
      .returning();
    const [row] = updated;
    if (!row) throw new ConflictError("This project isn't completed, or it changed since you loaded it.");
    await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx);
    return row;
  });
}

// The three status moves of a document's life (research-changes.md). Each is one compare-and-set from
// the status the caller expects, and throws unless it affected exactly one row.
const STATUS_TEXT: Record<DecisionStatus, string> = {
  in_progress: "in progress",
  finishing: "generating its document",
  report_released: "completed",
};

async function moveStatus(tx: DbOrTx, decisionId: string, from: DecisionStatus, to: DecisionStatus): Promise<void> {
  const updated = await tx
    .update(decision)
    .set({ status: to, rowVersion: sql`row_version + 1` })
    .where(and(eq(decision.id, decisionId), eq(decision.status, from)))
    .returning({ id: decision.id });
  if (updated.length !== 1) {
    throw new ConflictError(`This project is no longer ${STATUS_TEXT[from]}. Reload the page and check its state.`);
  }
}

/** in_progress → finishing, inside finishResearch's transaction. Exactly one caller gets through (F22 R8). */
export function beginFinish(tx: DbOrTx, decisionId: string): Promise<void> {
  return moveStatus(tx, decisionId, "in_progress", "finishing");
}

/** finishing → report_released, in the transaction that stores the document (F22 R1). */
export function markReportReleased(decisionId: string, tx: DbOrTx = db): Promise<void> {
  return moveStatus(tx, decisionId, "finishing", "report_released");
}

/** finishing → in_progress, in the transaction that records a failed document after its last retry (F22 R8). */
export function markFinishFailed(decisionId: string, tx: DbOrTx = db): Promise<void> {
  return moveStatus(tx, decisionId, "finishing", "in_progress");
}

/** report_released ← in_progress, for cancelResearchChange: nothing changed, so the last version stands (F22 R7). */
export function restoreCompleted(tx: DbOrTx, decisionId: string): Promise<void> {
  return moveStatus(tx, decisionId, "in_progress", "report_released");
}

/** For internal (system-authority) callers, such as run_analysis, which run with no actor. */
export async function getDecisionForAnalysis(decisionId: string): Promise<Decision> {
  const [row] = await db.select().from(decision).where(eq(decision.id, decisionId));
  if (!row) throw new NotFoundError("decision");
  return row;
}

/** System-authority read for profile approval and previews: the open decisions of a jurisdiction. Deleted and completed ones are excluded (R4). */
export async function listOpenDecisions(jurisdictionId: string, tx: DbOrTx = db): Promise<Decision[]> {
  return tx
    .select()
    .from(decision)
    .where(
      and(eq(decision.jurisdictionId, jurisdictionId), eq(decision.status, "in_progress"), isNull(decision.deletedAt)),
    );
}

/** Used by evidence's dataset-refresh flow: only decisions whose study area intersects the refreshed dataset's coverage. */
export async function listOpenDecisionsIntersecting(tx: DbOrTx, coverage: GeoJSON.Geometry) {
  const rows = await tx.execute<{ id: string; jurisdiction_id: string }>(sql`
    select distinct d.id, d.jurisdiction_id
    from decision d
    join decision_geometry g on g.decision_id = d.id and g.kind = 'study_area'
    where d.status = 'in_progress'
      and d.deleted_at is null
      and ST_Intersects(g.geom, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(coverage)}), 4326))
  `);
  return rows.rows.map((r) => ({ id: r.id, jurisdictionId: r.jurisdiction_id }));
}
