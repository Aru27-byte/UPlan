import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { requireStaff, type Actor } from "@/modules/accounts";
import { STUDY_LABEL } from "@/modules/analysis";
import { getDecision } from "@/modules/decisions";
import { getDataset, setDatasetLimitation } from "@/modules/evidence";
import {
  ProfileDocumentSchema,
  applyDraftedChange,
  getCurrentProfile,
  getJurisdiction,
  type InForceRules,
  type ProfileDocument,
} from "@/modules/profiles";
import { formatTimestamp } from "@/modules/provenance";
import {
  PHASES,
  commitSectionChange,
  contentSha256,
  getWorkflow,
  type PhaseKey,
  type PhaseView,
  type SectionContent,
} from "@/modules/workflow";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isUniqueViolation } from "@/platform/errors";
import { GENERATE_MODEL_ID, ModelServiceError, chat, isModelConfigured } from "@/platform/model-client";

import { checkOutput, type CheckFailure } from "./checks";
import { loadDatasetMeta } from "./dataset-meta";
import { indexedTextHash, listSourceDocuments, retrieveCodePassages } from "./documents";
import { attachSection, buildRequest, buildSectionInput, type BuildContext, type CodePassage } from "./inputs";
import {
  ASSISTS,
  ASSIST_KINDS,
  ASSIST_PHASES,
  AssistIdSchema,
  MetadataDraftSchema,
  RuleDraftSchema,
  SECTION_ASSISTS,
  SectionEditSchema,
  StoredAssistIdSchema,
  isSectionAssistKind,
  type AssistDef,
  type AssistId,
  type AssistKind,
  type AssistPhase,
  type StoredAssistId,
  type SuggestionContent,
} from "./kinds";
import { buildMessages } from "./prompts";
import { AssistRequestSchema, type AssistRequest } from "./request";
import { applyRuleChanges, ruleValuesOf } from "./rule-changes";
import { aiSuggestion, aiSuggestionResponse, documentChunk } from "./tables";

// TechDesign/ai-assist.md, "Request lifecycle and consistency". One request is one model call inside one
// function invocation: no queue, no worker, no in-memory state. Every guard is a database constraint or a
// compare-and-set, because Vercel runs many instances at once.

/** Starting values, to tune from NVIDIA's live limit and the first month of use (ai-assist.md, "Caps"). */
export const PER_PERSON_DAILY_CAP = 40;
export const PER_CITY_DAILY_CAP = 400;

/** A `running` row older than this belongs to a function that was killed mid-call (the call's timeout is 45 s). */
const STALE_RUNNING_SECONDS = 120;
const MAX_ANSWER_TOKENS = 1_200;

export const NOT_CONFIGURED_MESSAGE = "UPlan Assist is not set up for this deployment.";

export type SuggestionView = {
  id: string;
  assistId: StoredAssistId;
  phase: AssistPhase;
  kind: AssistKind;
  subjectKey: string;
  outputSha256: string;
  sectionSha256: string | null;
  status: "running" | "ready" | "rejected" | "failed";
  modelId: string;
  promptVersion: number;
  content: SuggestionContent | null;
  checkFailures: CheckFailure[];
  errorDetail: string | null;
  request: AssistRequest | null;
  startedAt: Date;
  finishedAt: Date | null;
  requestedBy: string;
  responses: { response: string; note: string | null; createdBy: string; createdAt: Date }[];
};

const RequestInputSchema = z.object({
  assistId: AssistIdSchema,
  decisionId: z.uuid().nullable(),
  // Required for the city-level assists (the profile and datasets); a project's own city is read from the project.
  jurisdictionId: z.uuid().nullable(),
  subjectKey: z.string().max(300),
  question: z.string().trim().min(1, "Type a question to find in the code.").max(300, "Keep the question under 300 characters.").nullable(),
  documentId: z.uuid().nullable(),
  datasetId: z.uuid().nullable(),
  suppliedText: z.string().trim().min(1).max(12_000, "Keep the pasted metadata under 12,000 characters.").nullable(),
});
export type SuggestionRequestInput = z.input<typeof RequestInputSchema>;

const FailureListSchema = z.array(z.object({ check: z.string(), message: z.string() }));

type Row = typeof aiSuggestion.$inferSelect;

function toView(row: Row, responses: SuggestionView["responses"]): SuggestionView {
  const assistId = StoredAssistIdSchema.parse(row.assistId);
  const kind = z.enum(ASSIST_KINDS).parse(row.kind);
  const def = isSectionAssistKind(kind) ? SECTION_ASSISTS[kind] : ASSISTS[AssistIdSchema.parse(row.assistId)];
  const failures = FailureListSchema.parse(row.checkFailures).map((f) => ({
    check: z.enum(["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9"]).parse(f.check),
    message: f.message,
  }));
  return {
    id: row.id,
    assistId,
    phase: z.enum(ASSIST_PHASES).parse(row.phase),
    kind,
    subjectKey: row.subjectKey,
    outputSha256: row.outputSha256,
    sectionSha256: row.sectionSha256,
    status: z.enum(["running", "ready", "rejected", "failed"]).parse(row.status),
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    // Parsed, not cast: stored jsonb is untyped, and content that no longer matches its shape is a defect to see.
    content: row.content === null ? null : def.schema.parse(row.content),
    checkFailures: failures,
    errorDetail: row.errorDetail,
    request: row.request === null ? null : AssistRequestSchema.parse(row.request),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    requestedBy: row.requestedBy,
    responses,
  };
}

async function viewsOf(rows: Row[]): Promise<SuggestionView[]> {
  if (rows.length === 0) return [];
  const responses = await db
    .select()
    .from(aiSuggestionResponse)
    .where(inArray(aiSuggestionResponse.suggestionId, rows.map((r) => r.id)))
    .orderBy(asc(aiSuggestionResponse.createdAt));
  return rows.map((row) =>
    toView(
      row,
      responses
        .filter((r) => r.suggestionId === row.id)
        .map((r) => ({ response: r.response, note: r.note, createdBy: r.createdBy, createdAt: r.createdAt })),
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------
// Reading suggestions.
// ---------------------------------------------------------------------------------------------------------

/** A project's suggestions for one phase, newest first. Reaching them goes through the project's own access check. */
export async function listPhaseSuggestions(actor: Actor, decisionId: string, phase: AssistPhase): Promise<SuggestionView[]> {
  await getDecision(actor, decisionId); // R9 of accounts-roles.md: someone else's project is a NotFoundError
  const rows = await db
    .select()
    .from(aiSuggestion)
    .where(and(eq(aiSuggestion.decisionId, decisionId), eq(aiSuggestion.phase, phase)))
    .orderBy(desc(aiSuggestion.startedAt));
  return viewsOf(rows);
}

/** City-level suggestions (the profile and datasets): the requester's own, and every one to staff. */
export async function listCitySuggestions(actor: Actor, jurisdictionId: string, assistIds: AssistId[]): Promise<SuggestionView[]> {
  const rows = await db
    .select()
    .from(aiSuggestion)
    .where(
      and(
        eq(aiSuggestion.jurisdictionId, jurisdictionId),
        isNull(aiSuggestion.decisionId),
        inArray(aiSuggestion.assistId, assistIds),
        actor.isStaff ? undefined : eq(aiSuggestion.requestedBy, actor.userId),
      ),
    )
    .orderBy(desc(aiSuggestion.startedAt))
    .limit(30);
  return viewsOf(rows);
}

// ---------------------------------------------------------------------------------------------------------
// Requesting one.
// ---------------------------------------------------------------------------------------------------------

type Prepared = {
  jurisdictionId: string;
  decisionId: string | null;
  ctx: BuildContext;
  outputSha256: string;
  sectionSha256?: string | null;
  baseDocument: ProfileDocument | null;
  documentId: string | null;
};

/** The rules a profile document holds that are in force now (not repealed): the set a rule draft is made against. */
function currentRules(doc: ProfileDocument): InForceRules {
  return {
    resourceTypes: doc.resourceTypes,
    bufferRules: doc.bufferRules.filter((r) => r.repealedOn === null),
    studyTriggers: doc.studyTriggers.filter((r) => r.repealedOn === null),
    treeRules: doc.treeRules.filter((r) => r.repealedOn === null),
  };
}

/** What a metadata draft is bound to: the dataset, the pasted text, and the limitation as recorded now (R10). */
export function metadataBinding(datasetId: string, text: string, limitation: string | null): string {
  return createHash("sha256").update(JSON.stringify([datasetId, text, limitation])).digest("hex");
}

async function documentText(jurisdictionId: string, documentId: string, kind: "code" | "checklist"): Promise<{ title: string; text: string }> {
  const docs = await listSourceDocuments(jurisdictionId);
  const doc = docs.find((d) => d.id === documentId && d.kind === kind);
  if (!doc) throw new ValidationError(`Choose a ${kind === "code" ? "code text" : "checklist"} that has been added for this city.`);
  const chunks = await db
    .select({ body: documentChunk.body })
    .from(documentChunk)
    .where(eq(documentChunk.sourceDocumentId, documentId))
    .orderBy(asc(documentChunk.ordinal));
  return { title: doc.title, text: chunks.map((c) => c.body).join("\n") };
}

const STUB_CODE: CodePassage = { id: "chunk:0", sectionPath: "stub", body: "stub" };

async function prepare(actor: Actor, assistId: AssistId, input: z.infer<typeof RequestInputSchema>): Promise<Prepared> {
  const empty: BuildContext = { workflow: null, codePassages: [], question: input.question, datasetMeta: [], suppliedText: null, boundTo: null, profile: null };
  const cityLevel = assistId === "PR1" || assistId === "PR2" || assistId === "EV3" || assistId === "ST3";

  if (!cityLevel) {
    if (input.decisionId === null) throw new ValidationError("Open a project to ask about its phase.");
    const workflow = await getWorkflow(actor, input.decisionId); // ownership: someone else's project is a NotFoundError
    const jurisdictionId = workflow.decision.jurisdictionId;
    const ctx: BuildContext = { ...empty, workflow: { facts: workflow.facts, phases: workflow.phases } };
    // EV2 compares two datasets' own metadata. With no finished run there is nothing to load, and the builder
    // below says so plainly.
    if (assistId === "EV2" && workflow.facts.run) ctx.datasetMeta = await loadDatasetMeta(workflow.facts.run.datasetVersionIds);
    // Validates the subject and the phase's output now, with a stand-in for the code text, so a request that
    // can't be built is refused before it claims a row or spends a call.
    const probe = buildRequest(assistId, input.subjectKey, { ...ctx, codePassages: [STUB_CODE] });
    return { jurisdictionId, decisionId: input.decisionId, ctx, outputSha256: probe.outputSha256, baseDocument: null, documentId: null };
  }

  if (input.decisionId !== null) throw new ValidationError("This assist belongs to the city, not to a project.");
  const jurisdictionId = input.jurisdictionId;
  if (jurisdictionId === null) throw new ValidationError("Choose the city.");
  await getJurisdiction(jurisdictionId); // NotFoundError for a city that doesn't exist

  if (assistId === "PR2") {
    const bound = await indexedTextHash(jurisdictionId);
    if (bound === null) throw new ValidationError("No code text has been added for this city yet. Staff add it on the profile page.");
    const ctx = { ...empty, boundTo: bound };
    buildRequest("PR2", "", { ...ctx, codePassages: [STUB_CODE] });
    return { jurisdictionId, decisionId: null, ctx, outputSha256: bound, baseDocument: null, documentId: null };
  }

  if (assistId === "EV3") {
    if (input.datasetId === null || input.suppliedText === null) throw new ValidationError("Choose a dataset and paste its publisher's metadata.");
    const dataset = await getDataset(input.datasetId);
    if (!dataset) throw new NotFoundError("dataset");
    const bound = metadataBinding(dataset.id, input.suppliedText, dataset.knownLimitation);
    const ctx: BuildContext = {
      ...empty,
      suppliedText: { label: `Publisher's metadata for ${dataset.title}`, text: input.suppliedText },
      boundTo: bound,
    };
    return { jurisdictionId, decisionId: null, ctx, outputSha256: bound, baseDocument: null, documentId: null };
  }

  // PR1 and ST3 read the current profile.
  const version = await getCurrentProfile(jurisdictionId);
  if (!version) throw new ValidationError("This city has no profile yet, so there are no rules to draft against.");
  const doc = ProfileDocumentSchema.parse(version.document);
  const profile = { rules: currentRules(doc), ruleValues: ruleValuesOf(doc), documentSha256: version.documentSha256 };
  if (input.documentId === null) throw new ValidationError(assistId === "PR1" ? "Choose the code text to draft from." : "Choose the checklist to compare with.");

  if (assistId === "PR1") {
    await documentText(jurisdictionId, input.documentId, "code"); // the document exists, is the city's, and is code text
    const ctx = { ...empty, profile };
    buildRequest("PR1", input.documentId, { ...ctx, codePassages: [STUB_CODE] });
    return { jurisdictionId, decisionId: null, ctx, outputSha256: version.documentSha256, baseDocument: doc, documentId: input.documentId };
  }
  const checklist = await documentText(jurisdictionId, input.documentId, "checklist");
  const ctx: BuildContext = { ...empty, profile, suppliedText: { label: checklist.title, text: checklist.text } };
  return { jurisdictionId, decisionId: null, ctx, outputSha256: version.documentSha256, baseDocument: null, documentId: input.documentId };
}

function retrievalPlan(assistId: AssistId, input: z.infer<typeof RequestInputSchema>, p: Prepared): { queries: string[]; perQuery: number; limit: number } | null {
  const rules = p.ctx.workflow?.facts.rules ?? null;
  const labelOf = (key: string) => rules?.resourceTypes.find((r) => r.key === key)?.label ?? key;
  switch (assistId) {
    case "PR2":
      return input.question === null ? null : { queries: [input.question], perQuery: 6, limit: 6 };
    case "SC3":
    case "IM3": {
      const resourceType = input.subjectKey.split(":")[assistId === "SC3" ? 1 : 0];
      if (!resourceType || !rules) return null;
      const sections = [...rules.bufferRules, ...rules.studyTriggers]
        .filter((r) => r.resourceType === resourceType)
        .map((r) => r.citation.codeSection);
      return { queries: [`${labelOf(resourceType)} buffer ${sections.join(" ")}`], perQuery: 4, limit: 4 };
    }
    case "ST1": {
      const triggers = rules?.studyTriggers.filter((t) => t.study === input.subjectKey) ?? [];
      const study = triggers[0]?.study;
      if (!study) return null;
      return { queries: [`${STUDY_LABEL[study]} ${triggers.map((t) => t.citation.codeSection).join(" ")}`], perQuery: 3, limit: 4 };
    }
    case "PR1": {
      const profile = p.ctx.profile;
      if (!profile) return null;
      const { rules: r } = profile;
      const queries = [
        ...r.bufferRules.map((b) => `${b.key} ${b.citation.codeSection} buffer width feet`),
        ...r.studyTriggers.map((t) => `${t.key} ${t.citation.codeSection} study within feet`),
        ...r.treeRules.map((t) => `${t.key} ${t.citation.codeSection} tree`),
      ].slice(0, 16);
      return { queries, perQuery: 2, limit: 12 };
    }
    case "EV1":
    case "EV2":
    case "EV3":
    case "SC1":
    case "SC2":
    case "ST2":
    case "ST3":
    case "IM1":
    case "IM2":
      return null; // these read supplied or measured text only, so they make no retrieval call
  }
}

type ClaimResult = { row: Row; created: boolean };

async function lockKey(tx: DbOrTx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

async function selectLive(
  tx: DbOrTx,
  scopeId: string,
  assistId: StoredAssistId,
  subjectKey: string,
  outputSha256: string,
  sectionSha256: string | null,
) {
  const [row] = await tx
    .select({
      row: aiSuggestion,
      isStale: sql<boolean>`${aiSuggestion.status} = 'running' and ${aiSuggestion.startedAt} < now() - make_interval(secs => ${STALE_RUNNING_SECONDS})`,
    })
    .from(aiSuggestion)
    .where(
      and(
        sql`coalesce(${aiSuggestion.decisionId}, ${aiSuggestion.jurisdictionId}) = ${scopeId}::uuid`,
        eq(aiSuggestion.assistId, assistId),
        eq(aiSuggestion.subjectKey, subjectKey),
        eq(aiSuggestion.outputSha256, outputSha256),
        sectionSha256 === null ? isNull(aiSuggestion.sectionSha256) : eq(aiSuggestion.sectionSha256, sectionSha256),
        sql`${aiSuggestion.status} <> 'failed'`,
      ),
    );
  return row ?? null;
}

async function capMessage(tx: DbOrTx, who: "person" | "city", windowFilter: ReturnType<typeof sql>, limit: number, timeZone: string): Promise<string> {
  const [oldest] = await tx
    .select({ at: sql<Date>`min(${aiSuggestion.startedAt})` })
    .from(aiSuggestion)
    .where(sql`${windowFilter} and ${aiSuggestion.startedAt} > now() - interval '24 hours'`);
  const resets = oldest?.at ? formatTimestamp(new Date(new Date(oldest.at).getTime() + 24 * 3_600_000), timeZone) : "within 24 hours";
  return who === "person"
    ? `You have used ${limit} of ${limit} UPlan Assist requests in the last 24 hours. The next one is available at ${resets}.`
    : `This city has used ${limit} of ${limit} UPlan Assist requests in the last 24 hours. The next one is available at ${resets}.`;
}

// R12 and R13 in one transaction. The advisory locks serialize the count and the insert for one person and one
// city, so two requests at the cap cannot both pass it; the unique index is the backstop that makes two
// identical requests one row. The row is claimed BEFORE retrieval or any call, so a double submission makes one
// model call (R13), and the transaction closes before the network is touched.
async function claim(
  actor: Actor,
  def: AssistDef,
  p: Prepared,
  subjectKey: string,
  timeZone: string,
): Promise<ClaimResult> {
  const scopeId = p.decisionId ?? p.jurisdictionId;
  return db.transaction(async (tx) => {
    await lockKey(tx, `ai-user:${actor.userId}`);
    await lockKey(tx, `ai-city:${p.jurisdictionId}`);

    const live = await selectLive(tx, scopeId, def.id, subjectKey, p.outputSha256, p.sectionSha256 ?? null);
    if (live && !live.isStale) return { row: live.row, created: false };
    if (live?.isStale) {
      // R13, "Interrupted": nobody is running it any more. Compare-and-set it to failed so the key is free.
      const freed = await tx
        .update(aiSuggestion)
        .set({ status: "failed", errorDetail: "interrupted", finishedAt: sql`now()` })
        .where(and(eq(aiSuggestion.id, live.row.id), eq(aiSuggestion.status, "running")))
        .returning({ id: aiSuggestion.id });
      if (freed.length !== 1) throw new ConflictError("This suggestion was finished by another request. Reload the page.");
    }

    const [mine] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiSuggestion)
      .where(sql`${aiSuggestion.requestedBy} = ${actor.userId} and ${aiSuggestion.startedAt} > now() - interval '24 hours'`);
    if ((mine?.n ?? 0) >= PER_PERSON_DAILY_CAP) {
      throw new ConflictError(
        await capMessage(tx, "person", sql`${aiSuggestion.requestedBy} = ${actor.userId}`, PER_PERSON_DAILY_CAP, timeZone),
      );
    }
    const [city] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiSuggestion)
      .where(sql`${aiSuggestion.jurisdictionId} = ${p.jurisdictionId} and ${aiSuggestion.startedAt} > now() - interval '24 hours'`);
    if ((city?.n ?? 0) >= PER_CITY_DAILY_CAP) {
      throw new ConflictError(
        await capMessage(tx, "city", sql`${aiSuggestion.jurisdictionId} = ${p.jurisdictionId}`, PER_CITY_DAILY_CAP, timeZone),
      );
    }

    const [inserted] = await tx
      .insert(aiSuggestion)
      .values({
        jurisdictionId: p.jurisdictionId,
        decisionId: p.decisionId,
        phase: def.phase,
        assistId: def.id,
        kind: def.kind,
        subjectKey,
        outputSha256: p.outputSha256,
        sectionSha256: p.sectionSha256 ?? null,
        modelId: GENERATE_MODEL_ID,
        promptVersion: def.promptVersion,
        status: "running",
        requestedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { row: inserted, created: true };
    const raced = await selectLive(tx, scopeId, def.id, subjectKey, p.outputSha256, p.sectionSha256 ?? null);
    if (!raced) throw new Error("a suggestion key conflicted but no live row holds it");
    return { row: raced.row, created: false };
  });
}

/** Moves a running suggestion to its final state. Exactly one row must change, or someone else finished it first. */
async function finish(
  dbOrTx: DbOrTx,
  id: string,
  patch: {
    status: "ready" | "rejected" | "failed";
    responseRaw?: string | null;
    content?: SuggestionContent | null;
    checkFailures?: CheckFailure[];
    errorDetail?: string | null;
    tokensIn?: number | null;
    tokensOut?: number | null;
  },
): Promise<void> {
  const updated = await dbOrTx
    .update(aiSuggestion)
    .set({
      status: patch.status,
      responseRaw: patch.responseRaw ?? null,
      content: patch.content ?? null,
      checkFailures: patch.checkFailures ?? [],
      errorDetail: patch.errorDetail ?? null,
      tokensIn: patch.tokensIn ?? null,
      tokensOut: patch.tokensOut ?? null,
      finishedAt: sql`now()`,
    })
    .where(and(eq(aiSuggestion.id, id), eq(aiSuggestion.status, "running")))
    .returning({ id: aiSuggestion.id });
  if (updated.length !== 1) throw new ConflictError("This suggestion was already finished.");
}

/**
 * The one entry point for a suggestion (R9: only ever called from a person's button press). Returns the stored
 * suggestion in whatever final state it reached: a rejection and a failure are results to show, not exceptions.
 */
export async function requestSuggestion(actor: Actor, raw: SuggestionRequestInput): Promise<SuggestionView> {
  const parsed = RequestInputSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const input = parsed.data;
  const def = ASSISTS[input.assistId];
  if (def.staff) requireStaff(actor);
  // Nothing is written for an unconfigured deployment: it is a state to show, not a failed request (ai-assist.md).
  if (!isModelConfigured()) throw new ValidationError(NOT_CONFIGURED_MESSAGE);

  const p = await prepare(actor, input.assistId, input);
  // The subject is part of the one-live-suggestion key (R13), so it must tell two different asks apart: the
  // document a draft is made from, the dataset a metadata draft is for, or the question a Find answers.
  const subjectKey =
    input.assistId === "PR1" || input.assistId === "ST3"
      ? (p.documentId ?? "")
      : input.assistId === "EV3"
        ? (input.datasetId ?? "")
        : input.assistId === "PR2"
          ? createHash("sha256").update((input.question ?? "").toLowerCase()).digest("hex")
          : input.subjectKey;
  const timeZone = (await getJurisdiction(p.jurisdictionId)).timeZone;

  const { row, created } = await claim(actor, def, p, subjectKey, timeZone);
  if (!created) {
    const [view] = await viewsOf([row]);
    if (!view) throw new Error("a claimed suggestion has no view");
    return view;
  }

  try {
    const plan = retrievalPlan(input.assistId, input, p);
    let codePassages: CodePassage[] = [];
    if (plan) {
      codePassages = await retrieveCodePassages(p.jurisdictionId, plan.queries, {
        perQuery: plan.perQuery,
        limit: plan.limit,
        documentId: input.assistId === "PR1" ? p.documentId : null,
      });
    }
    const built = buildRequest(input.assistId, subjectKey, { ...p.ctx, codePassages });
    if (built.outputSha256 !== p.outputSha256) {
      throw new ConflictError("The output changed while the request was being prepared. Try again.");
    }

    const stored = await db
      .update(aiSuggestion)
      .set({ request: built.request, inputSha256: createHash("sha256").update(JSON.stringify(built.request)).digest("hex") })
      .where(and(eq(aiSuggestion.id, row.id), eq(aiSuggestion.status, "running")))
      .returning({ id: aiSuggestion.id });
    if (stored.length !== 1) throw new ConflictError("This suggestion was already finished.");

    const answer = await chat(buildMessages(built.request), MAX_ANSWER_TOKENS);
    const checked = checkOutput({ assist: def, rawText: answer.content, request: built.request, baseDocument: p.baseDocument });
    if (checked.ok) {
      await finish(db, row.id, { status: "ready", content: checked.content, responseRaw: answer.content, tokensIn: answer.tokensIn, tokensOut: answer.tokensOut });
    } else {
      // R4–R6: the raw answer is kept for staff and the evaluation set; nothing from it is shown as an answer.
      await finish(db, row.id, { status: "rejected", responseRaw: answer.content, checkFailures: checked.failures, tokensIn: answer.tokensIn, tokensOut: answer.tokensOut });
    }
  } catch (err) {
    if (err instanceof ModelServiceError) {
      // R11: shown with its reason; nothing replaces it, and no other model is tried.
      await finish(db, row.id, { status: "failed", errorDetail: err.reason === "rate-limited" ? "rate-limited" : `${err.reason}: ${err.message}` });
    } else {
      // Not an expected outcome: record that the request did not finish, then let the defect reach the logs.
      await finish(db, row.id, { status: "failed", errorDetail: `internal error: ${err instanceof Error ? err.message : String(err)}` }).catch(() => undefined);
      throw err;
    }
  }

  const [done] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.id, row.id));
  if (!done) throw new Error("a finished suggestion disappeared");
  const [view] = await viewsOf([done]);
  if (!view) throw new Error("a finished suggestion has no view");
  return view;
}

// ---------------------------------------------------------------------------------------------------------
// The section chat (F21 R6, R7; F24 R19).
// ---------------------------------------------------------------------------------------------------------

const SectionRequestInputSchema = z
  .object({
    assistId: StoredAssistIdSchema,
    decisionId: z.uuid(),
    phase: z.enum(PHASES),
    instruction: z
      .string()
      .trim()
      .min(1, "Type a question or a change.")
      .max(2000, "Keep the message under 2,000 characters."),
    expectedContentSha256: z.string().regex(/^[0-9a-f]{64}$/, "Reload the page and try again."),
    expectedOutputSha256: z.string().regex(/^[0-9a-f]{64}$/, "Reload the page and try again."),
  })
  .strict();
export type SectionRequestInput = z.input<typeof SectionRequestInputSchema>;

/** The section the page shows: the stored version, or the analysis draft when none is stored. */
function shownSection(view: PhaseView): SectionContent {
  if (view.state.kind === "ready") return view.state.content;
  if (view.state.kind === "out-of-date") return view.state.version.content;
  throw new ValidationError(`The ${view.phase} section has no output yet, so there is nothing to ask about.`);
}

function sectionDefFor(assistId: StoredAssistId, phase: PhaseKey): AssistDef {
  if (isSectionAssistKind(assistId)) {
    const def = SECTION_ASSISTS[assistId];
    return {
      id: assistId,
      phase,
      kind: assistId,
      wave: 1,
      label: "",
      staff: false,
      subject: "phase",
      promptVersion: def.promptVersion,
      task: def.task,
      maxWords: def.maxWords,
      schema: def.schema,
    };
  }
  return ASSISTS[assistId];
}

/**
 * The section chat's one entry point. Explain changes nothing; a Change stores its section version in the same
 * transaction that finishes the suggestion, so a hash that moved rolls the version back and marks the
 * suggestion failed with the conflict's message (F21 R7).
 */
export async function requestSectionSuggestion(actor: Actor, raw: SectionRequestInput): Promise<SuggestionView> {
  const parsed = SectionRequestInputSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const input = parsed.data;
  if (!isModelConfigured()) throw new ValidationError(NOT_CONFIGURED_MESSAGE);

  const workflow = await getWorkflow(actor, input.decisionId); // ownership: someone else's project is NotFound
  const view = workflow.phases.find((p) => p.phase === input.phase);
  if (!view) throw new ValidationError(`There is no ${input.phase} phase.`);
  if (!view.output) throw new ValidationError(`The ${input.phase} phase has no output yet, so there is nothing to ask about.`);
  const section = shownSection(view);
  if (contentSha256(section) !== input.expectedContentSha256) {
    throw new ConflictError("This section changed while you were reading it. Reload the page and try again.");
  }
  if (view.output.contentSha256 !== input.expectedOutputSha256) {
    throw new ConflictError("The analysis changed while you were reading it. Reload the page and try again.");
  }

  if (!isSectionAssistKind(input.assistId)) {
    const filler = ASSISTS[input.assistId];
    if (filler.staff || filler.subject !== "phase" || filler.phase !== input.phase) {
      throw new ValidationError("That prompt does not belong to this section.");
    }
  }
  const def = sectionDefFor(input.assistId, input.phase);

  const ctx: BuildContext = {
    workflow: { facts: workflow.facts, phases: workflow.phases },
    codePassages: [],
    question: null,
    datasetMeta: [],
    suppliedText: null,
    boundTo: null,
    profile: null,
  };
  const built = isSectionAssistKind(input.assistId)
    ? buildSectionInput(
        input.assistId,
        {
          phase: input.phase,
          section,
          instruction: input.instruction,
          sampleData: workflow.usesSampleData,
          identity: {
            title: workflow.decision.title,
            parcelOrAddress: workflow.decision.parcelOrAddress,
            applicant: workflow.decision.applicant,
            projectManager: workflow.decision.projectManager,
          },
        },
        ctx,
      )
    : attachSection(buildRequest(input.assistId, "", ctx), {
        phase: input.phase,
        section,
        instruction: input.instruction,
      });

  // R13: the same instruction on the same section is one request; the section hash is in the key too.
  const subjectKey = createHash("sha256").update(input.instruction.toLowerCase()).digest("hex");
  const p: Prepared = {
    jurisdictionId: workflow.decision.jurisdictionId,
    decisionId: input.decisionId,
    ctx,
    outputSha256: built.outputSha256,
    sectionSha256: built.sectionSha256 ?? null,
    baseDocument: null,
    documentId: null,
  };

  const { row, created } = await claim(actor, def, p, subjectKey, workflow.timeZone);
  if (!created) {
    const [existing] = await viewsOf([row]);
    if (!existing) throw new Error("a claimed suggestion has no view");
    return existing;
  }

  try {
    const stored = await db
      .update(aiSuggestion)
      .set({ request: built.request, inputSha256: createHash("sha256").update(JSON.stringify(built.request)).digest("hex") })
      .where(and(eq(aiSuggestion.id, row.id), eq(aiSuggestion.status, "running")))
      .returning({ id: aiSuggestion.id });
    if (stored.length !== 1) throw new ConflictError("This suggestion was already finished.");

    const answer = await chat(buildMessages(built.request), MAX_ANSWER_TOKENS);
    const checked = checkOutput({ assist: def, rawText: answer.content, request: built.request, baseDocument: null });
    if (!checked.ok) {
      await finish(db, row.id, {
        status: "rejected",
        responseRaw: answer.content,
        checkFailures: checked.failures,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
      });
    } else if (def.kind === "section-edit") {
      const edit = SectionEditSchema.parse(checked.content);
      const content: SectionContent = {
        headline: edit.headline,
        lines: edit.lines,
        tables: (edit.tables ?? []).map((t) => ({ key: t.key, caption: t.caption ?? null, columnOrder: t.columnOrder })),
      };
      try {
        await db.transaction(async (tx) => {
          await finish(tx, row.id, {
            status: "ready",
            content: checked.content,
            responseRaw: answer.content,
            tokensIn: answer.tokensIn,
            tokensOut: answer.tokensOut,
          });
          await commitSectionChange(actor, input.decisionId, {
            phase: input.phase,
            content,
            instruction: input.instruction,
            suggestionId: row.id,
            expectedContentSha256: input.expectedContentSha256,
            expectedOutputSha256: input.expectedOutputSha256,
          });
        });
      } catch (err) {
        // The transaction rolled back, so no version exists and the suggestion is still running. Mark it failed
        // with the conflict's own message; the chat shows it and nothing was stored.
        if (!(err instanceof ConflictError)) throw err;
        await finish(db, row.id, { status: "failed", errorDetail: err.message }).catch(() => undefined);
      }
    } else {
      await finish(db, row.id, {
        status: "ready",
        content: checked.content,
        responseRaw: answer.content,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
      });
    }
  } catch (err) {
    if (err instanceof ModelServiceError) {
      await finish(db, row.id, { status: "failed", errorDetail: err.reason === "rate-limited" ? "rate-limited" : `${err.reason}: ${err.message}` });
    } else {
      await finish(db, row.id, { status: "failed", errorDetail: `internal error: ${err instanceof Error ? err.message : String(err)}` }).catch(() => undefined);
      throw err;
    }
  }

  const [done] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.id, row.id));
  if (!done) throw new Error("a finished suggestion disappeared");
  const [doneView] = await viewsOf([done]);
  if (!doneView) throw new Error("a finished suggestion has no view");
  return doneView;
}

// ---------------------------------------------------------------------------------------------------------
// Responses and confirmation.
// ---------------------------------------------------------------------------------------------------------

async function getReachable(actor: Actor, suggestionId: string): Promise<Row> {
  const [row] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.id, suggestionId));
  if (!row) throw new NotFoundError("suggestion");
  if (row.decisionId !== null) await getDecision(actor, row.decisionId); // the project's owner only
  else if (!actor.isStaff && row.requestedBy !== actor.userId) throw new NotFoundError("suggestion");
  return row;
}

const ResponseNoteSchema = z.string().trim().min(1).max(2000).nullable();

/** R14: dismiss, or mark helpful or not helpful, with an optional note. Recorded, never edited. */
export async function respondToSuggestion(
  actor: Actor,
  suggestionId: string,
  response: "dismissed" | "helpful" | "not-helpful",
  note: string | null,
): Promise<void> {
  const parsedNote = ResponseNoteSchema.safeParse(note === "" ? null : note);
  if (!parsedNote.success) throw new ValidationError("Keep the note between 1 and 2,000 characters.");
  await getReachable(actor, suggestionId);
  await db.insert(aiSuggestionResponse).values({ suggestionId, response, note: parsedNote.data, createdBy: actor.userId });
}

const ConfirmRuleSchema = z.object({
  acceptedPaths: z.array(z.string().min(1)).min(1, "Choose at least one change to confirm."),
  effectiveOn: z.iso.date("Enter the date the new values take effect."),
  ordinance: z.string().trim().min(1, "Name the ordinance or code update these values come from.").max(200),
});
export type ConfirmRuleInput = z.input<typeof ConfirmRuleSchema>;

/**
 * R7: a rule draft takes effect only when a staff member other than the requester confirms it, through the
 * same change path as any profile edit. The new values start on the date staff enter, and the rule in force ends
 * that day, so a decision filed under the old values is still judged under them where the profile vests.
 */
export async function confirmRuleDraft(actor: Actor, suggestionId: string, raw: ConfirmRuleInput): Promise<{ versionNumber: number }> {
  requireStaff(actor);
  const input = ConfirmRuleSchema.safeParse(raw);
  if (!input.success) throw new ValidationError(input.error.issues.map((i) => i.message).join(" "));

  const row = await getReachable(actor, suggestionId);
  if (row.assistId !== "PR1" || row.status !== "ready") throw new ValidationError("Only a finished rule draft can be confirmed.");
  if (row.requestedBy === actor.userId) {
    throw new ForbiddenError("A draft is confirmed by a staff member other than the one who requested it.");
  }
  const draft = RuleDraftSchema.parse(row.content);
  const accepted = draft.changes.filter((c) => input.data.acceptedPaths.includes(c.path));
  if (accepted.length === 0) throw new ValidationError("None of the chosen changes are in this draft.");

  const current = await getCurrentProfile(row.jurisdictionId);
  if (!current) throw new ValidationError("This city has no profile.");
  // R10: made on a profile that has since changed is out of date, and says so rather than applying.
  if (current.documentSha256 !== row.outputSha256) {
    throw new ConflictError("The city's profile changed after this draft was made. Draft again from the current profile.");
  }

  try {
    return await db.transaction(async (tx) => {
      const applied = await applyDraftedChange(tx, actor, {
        jurisdictionId: row.jurisdictionId,
        baseVersionId: current.id,
        proposedBy: row.requestedBy,
        reason: `UPlan Assist-drafted rule change from code text, confirmed by staff: ${input.data.ordinance}`,
        build: (doc) =>
          applyRuleChanges(
            doc,
            accepted.map((c) => ({ path: c.path, to: c.to })),
            { effectiveOn: input.data.effectiveOn, ordinance: input.data.ordinance },
          ),
      });
      await tx.insert(aiSuggestionResponse).values({
        suggestionId,
        response: "confirmed",
        note: `Applied: ${accepted.map((c) => `${c.path} ${c.from} to ${c.to}`).join("; ")}`.slice(0, 2000),
        profileChangeId: applied.changeId,
        createdBy: actor.userId,
      });
      return { versionNumber: applied.versionNumber };
    });
  } catch (err) {
    // The one-confirmation index: two staff confirming at once, and exactly one succeeds (R7).
    if (isUniqueViolation(err)) throw new ConflictError("This draft was already confirmed.");
    throw err;
  }
}

/**
 * R7: a metadata draft takes effect only when a staff member other than the requester confirms it. Only the
 * dataset's limitation is a stored field; vintage, scale, and method are shown for staff to read, not written.
 */
export async function confirmMetadataDraft(actor: Actor, suggestionId: string): Promise<void> {
  requireStaff(actor);
  const row = await getReachable(actor, suggestionId);
  if (row.assistId !== "EV3" || row.status !== "ready") throw new ValidationError("Only a finished metadata draft can be confirmed.");
  if (row.requestedBy === actor.userId) {
    throw new ForbiddenError("A draft is confirmed by a staff member other than the one who requested it.");
  }
  const draft = MetadataDraftSchema.parse(row.content);
  const limitation = draft.fields.find((f) => f.key === "limitation");
  if (!limitation) throw new ValidationError("This draft states no limitation, so there is nothing to confirm.");

  const request = AssistRequestSchema.parse(row.request);
  const source = request.passages[0];
  const dataset = await getDataset(row.subjectKey);
  if (!source || !dataset) throw new NotFoundError("dataset");
  // R10: the dataset's recorded limitation must still be what the draft was made against.
  if (metadataBinding(dataset.id, source.text, dataset.knownLimitation) !== row.outputSha256) {
    throw new ConflictError("This dataset's record changed after the draft was made. Draft again from the current record.");
  }

  try {
    await db.transaction(async (tx) => {
      await setDatasetLimitation(tx, dataset.id, dataset.knownLimitation, limitation.value);
      await tx.insert(aiSuggestionResponse).values({
        suggestionId,
        response: "confirmed",
        note: `Limitation set. Previously: ${dataset.knownLimitation ?? "not recorded"}`.slice(0, 2000),
        createdBy: actor.userId,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("This draft was already confirmed.");
    throw err;
  }
}

/** Used by the panel to say what to show in place of a request button when assist is off. */
export function assistAvailability(): { configured: boolean; notConfiguredMessage: string } {
  return { configured: isModelConfigured(), notConfiguredMessage: NOT_CONFIGURED_MESSAGE };
}

