import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { canonicalJson, sha256 } from "@/modules/analysis";
import { getDecision, lockEditableDecision } from "@/modules/decisions";
import { isPermutation, sectionTableDefs, type SectionContent } from "@/modules/reports";
import { appUser } from "@/platform/auth-tables";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";
import { verdictWordIn } from "@/platform/verdict-words";

import { diffLines, type LineDiff } from "./diff";
import { loadPhaseFacts } from "./facts";
import {
  PHASES,
  derivePhaseOutputs,
  missingReason,
  type PhaseFacts,
  type PhaseKey,
  type PhaseOutput,
} from "./phases";
import { reportSectionVersion } from "./tables";

// TechDesign/research-phases.md, "Section versions" (R5, R7–R10). The analysis draft is never stored; the
// planner's adopted narrative is, one append-only row per change. A section's state is the comparison of the
// newest version's engine fingerprint with the current output's, so nothing here sets a flag a later change
// could leave wrong.

export type SectionVersion = {
  id: string;
  phase: PhaseKey;
  versionNumber: number;
  source: "analysis" | "ai" | "revert";
  content: SectionContent;
  contentSha256: string;
  outputSha256: string;
  instruction: string | null;
  sourceVersionNumber: number | null;
  createdByName: string;
  createdAt: Date;
};

export type SectionState =
  | { kind: "to-do"; reason: "no-study-area" | "no-footprint"; version: SectionVersion | null }
  | { kind: "updating"; status: PhaseFacts["status"]; version: SectionVersion | null }
  | { kind: "ready"; content: SectionContent; version: SectionVersion | null }
  | { kind: "out-of-date"; version: SectionVersion; reason: "no-study-area" | "no-footprint" | "analysis-not-current" };

export type PhaseView = {
  phase: PhaseKey;
  output: PhaseOutput | null;
  state: SectionState;
  versions: SectionVersion[]; // newest first
  changes: LineDiff | null; // R10: the current content against the one before it
};

const SectionTableFormatInputSchema = z.object({
  key: z.string().trim().min(1),
  caption: z
    .string()
    .trim()
    .max(300, "Keep a table caption under 300 characters.")
    .transform((c): string | null => (c === "" ? null : c))
    .nullable(),
  columnOrder: z.array(z.string().trim().min(1)).min(1),
});

const SectionContentInputSchema = z.object({
  headline: z.string().trim().min(1, "A section needs a headline.").max(300, "Keep the headline under 300 characters."),
  lines: z.array(z.string().trim().min(1).max(2000, "Keep each sentence under 2,000 characters.")).max(40),
  tables: z.array(SectionTableFormatInputSchema).max(4),
});

export function contentSha256(content: SectionContent): string {
  return sha256(canonicalJson(content));
}

/** The analysis draft as a section: no table formatting until a planner or a change supplies one. */
export function draftContent(output: PhaseOutput): SectionContent {
  return { headline: output.headline, lines: output.lines, tables: [] };
}

/**
 * R7: the same validation runs in `assist`'s K9 and again here, so no code path — model, Server Action, or a
 * future caller — can store a section that drops a locked provenance column or carries a verdict.
 */
export function validateSectionContent(phase: PhaseKey, input: unknown): SectionContent {
  const parsed = SectionContentInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const content = parsed.data;

  const defs = new Map(sectionTableDefs(phase).map((d) => [d.key, d]));
  const seen = new Set<string>();
  for (const table of content.tables) {
    if (seen.has(table.key)) throw new ValidationError(`The ${table.key} table appears twice.`);
    seen.add(table.key);
    const def = defs.get(table.key);
    if (!def) throw new ValidationError(`There is no ${table.key} table in this section.`);
    if (!isPermutation(table.columnOrder, def.columns)) {
      throw new ValidationError(`The ${table.key} table must keep every column; only the order may change.`);
    }
  }

  const texts = [content.headline, ...content.lines, ...content.tables.flatMap((t) => (t.caption === null ? [] : [t.caption]))];
  for (const text of texts) {
    const word = verdictWordIn(text);
    if (word) {
      throw new ValidationError(`The section uses "${word}", which carries a verdict. UPlan's sections state facts, not decisions.`);
    }
  }
  return content;
}

const textOf = (content: SectionContent): string[] => [
  content.headline,
  ...content.lines,
  ...content.tables.flatMap((t) => (t.caption === null ? [] : [t.caption])),
];

/** R10: the sentences added and removed, in the new content's order. Table captions are part of the text. */
export function sectionDiff(previous: SectionContent, current: SectionContent): LineDiff {
  return diffLines(textOf(previous), textOf(current));
}

/**
 * R5's state table. A stored version whose engine fingerprint matches the current output is Ready and is
 * what the page shows; one whose fingerprint differs is Out of date and is never shown as current. With no
 * output, the phase says what is missing (To do) or that the analysis is not finished (Updating).
 */
export function buildSectionViews(facts: PhaseFacts, versions: SectionVersion[]): PhaseView[] {
  const outputs = derivePhaseOutputs(facts);
  const byPhase = new Map<PhaseKey, SectionVersion[]>();
  for (const version of versions) {
    const list = byPhase.get(version.phase) ?? [];
    list.push(version);
    byPhase.set(version.phase, list);
  }

  return PHASES.map((phase) => {
    const output = outputs[phase] ?? null;
    const phaseVersions = byPhase.get(phase) ?? [];
    const newest = phaseVersions[0] ?? null;

    let state: SectionState;
    let changes: LineDiff | null = null;

    if (output) {
      if (!newest) {
        state = { kind: "ready", content: draftContent(output), version: null };
      } else if (newest.outputSha256 === output.contentSha256) {
        state = { kind: "ready", content: newest.content, version: newest };
        if (phaseVersions[1]) changes = sectionDiff(phaseVersions[1].content, newest.content);
      } else {
        const draft = draftContent(output);
        state = { kind: "out-of-date", version: newest, reason: "analysis-not-current" };
        changes = sectionDiff(newest.content, draft);
      }
    } else {
      const reason = missingReason(phase, facts);
      if (!reason) throw new Error(`phase ${phase} has no output but no missing reason either`);
      state =
        reason === "analysis-not-current"
          ? { kind: "updating", status: facts.status, version: newest }
          : { kind: "to-do", reason, version: newest };
    }

    return { phase, output, state, versions: phaseVersions, changes };
  });
}

const SourceSchema = z.enum(["analysis", "ai", "revert"]);

export async function listSectionVersionsInternal(decisionId: string, dbOrTx: DbOrTx = db): Promise<SectionVersion[]> {
  const sourceVersion = alias(reportSectionVersion, "source_version");
  const rows = await dbOrTx
    .select({
      id: reportSectionVersion.id,
      phase: reportSectionVersion.phase,
      versionNumber: reportSectionVersion.versionNumber,
      source: reportSectionVersion.source,
      content: reportSectionVersion.content,
      contentSha256: reportSectionVersion.contentSha256,
      outputSha256: reportSectionVersion.outputSha256,
      instruction: reportSectionVersion.instruction,
      sourceVersionNumber: sourceVersion.versionNumber,
      createdByName: appUser.name,
      createdAt: reportSectionVersion.createdAt,
    })
    .from(reportSectionVersion)
    .innerJoin(appUser, eq(appUser.id, reportSectionVersion.createdBy))
    .leftJoin(sourceVersion, eq(sourceVersion.id, reportSectionVersion.sourceVersionId))
    .where(eq(reportSectionVersion.decisionId, decisionId))
    .orderBy(asc(reportSectionVersion.phase), desc(reportSectionVersion.versionNumber));

  return rows.map((r) => ({
    id: r.id,
    phase: z.enum(PHASES).parse(r.phase),
    versionNumber: r.versionNumber,
    source: SourceSchema.parse(r.source),
    content: SectionContentInputSchema.parse(r.content), // untyped jsonb: parsed, never `as`-cast
    contentSha256: r.contentSha256,
    outputSha256: r.outputSha256,
    instruction: r.instruction,
    sourceVersionNumber: r.sourceVersionNumber,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
  }));
}

export async function loadSectionViews(decisionId: string, facts: PhaseFacts, dbOrTx: DbOrTx = db): Promise<PhaseView[]> {
  return buildSectionViews(facts, await listSectionVersionsInternal(decisionId, dbOrTx));
}

export async function getSection(actor: Actor, decisionId: string, phase: PhaseKey): Promise<PhaseView> {
  const decision = await getDecision(actor, decisionId); // ownership
  const { facts } = await loadPhaseFacts(decision);
  const view = (await loadSectionViews(decision.id, facts)).find((v) => v.phase === phase);
  if (!view) throw new ValidationError(`There is no ${phase} phase.`);
  return view;
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "Reload the page and try again.");
const Hashes = {
  expectedContentSha256: Sha256,
  expectedOutputSha256: Sha256,
};

const CommitSchema = z.object({
  phase: z.enum(PHASES),
  content: z.unknown(),
  instruction: z
    .string()
    .trim()
    .min(1, "Say what you want changed.")
    .max(2000, "Keep the instruction under 2,000 characters."),
  suggestionId: z.string().uuid(),
  ...Hashes,
});
export type CommitSectionChangeInput = z.input<typeof CommitSchema>;

const RevertSchema = z.object({
  phase: z.enum(PHASES),
  versionId: z.string().uuid(),
  ...Hashes,
});
export type RevertSectionInput = z.input<typeof RevertSchema>;

const UpdateSchema = z.object({
  phase: z.enum(PHASES),
  ...Hashes,
});
export type UpdateSectionToCurrentInput = z.input<typeof UpdateSchema>;

function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  return parsed.data;
}

function noOutputMessage(phase: PhaseKey, facts: PhaseFacts): string {
  switch (missingReason(phase, facts)) {
    case "no-study-area":
      return "There is no study area yet, so this section has nothing to build on.";
    case "no-footprint":
      return "There is no footprint yet, so this section has nothing to build on.";
    case "analysis-not-current":
      return "The analysis for the current inputs is not ready yet. Try again when it has finished.";
    case null:
      return "There is no current analysis to build this section on.";
  }
}

function outputOf(facts: PhaseFacts, phase: PhaseKey): PhaseOutput {
  const output = derivePhaseOutputs(facts)[phase];
  if (!output) throw new ConflictError(noOutputMessage(phase, facts));
  return output;
}

function newestOf(versions: SectionVersion[], phase: PhaseKey): SectionVersion | null {
  return versions.find((v) => v.phase === phase) ?? null;
}

function checkOutputHash(output: PhaseOutput, expected: string): void {
  if (output.contentSha256 !== expected) {
    throw new ConflictError("The analysis changed while you were reading it. Reload the page and try again.");
  }
}

function checkContentHash(newest: SectionVersion | null, output: PhaseOutput | null, expected: string): void {
  const current = newest ? newest.contentSha256 : output ? contentSha256(draftContent(output)) : null;
  if (current !== expected) {
    throw new ConflictError("This section changed while you were reading it. Reload the page and try again.");
  }
}

async function insertVersion(
  tx: DbOrTx,
  args: {
    decisionId: string;
    phase: PhaseKey;
    versions: SectionVersion[];
    content: SectionContent;
    contentSha256: string;
    outputSha256: string;
    source: SectionVersion["source"];
    instruction: string | null;
    suggestionId: string | null;
    sourceVersionId: string | null;
    actor: Actor;
  },
): Promise<SectionVersion> {
  const newest = newestOf(args.versions, args.phase);
  const versionNumber = (newest?.versionNumber ?? 0) + 1;
  const [row] = await tx
    .insert(reportSectionVersion)
    .values({
      decisionId: args.decisionId,
      phase: args.phase,
      versionNumber,
      source: args.source,
      content: args.content,
      contentSha256: args.contentSha256,
      outputSha256: args.outputSha256,
      instruction: args.instruction,
      suggestionId: args.suggestionId,
      sourceVersionId: args.sourceVersionId,
      createdBy: args.actor.userId,
    })
    .returning({ id: reportSectionVersion.id });
  if (!row) throw new Error("insert into report_section_version unexpectedly returned no row");

  const stored = (await listSectionVersionsInternal(args.decisionId, tx)).find((v) => v.id === row.id);
  if (!stored) throw new Error(`section version ${row.id} could not be read back`);
  return stored;
}

/**
 * R7, R8: a chat change. Both hashes the page carried must still describe the current records, and the
 * content is validated again here. The caller (`assist`) runs this in the transaction that finalizes the
 * suggestion, so a conflict rolls that suggestion back and no version exists without it.
 */
export async function commitSectionChange(
  actor: Actor,
  decisionId: string,
  input: CommitSectionChangeInput,
): Promise<SectionVersion> {
  const parsed = parseOrThrow(CommitSchema, input);
  const content = validateSectionContent(parsed.phase, parsed.content);

  return db.transaction(async (tx) => {
    const decision = await lockEditableDecision(tx, actor, decisionId); // R13: in progress only
    const { facts } = await loadPhaseFacts(decision);
    const output = outputOf(facts, parsed.phase);
    checkOutputHash(output, parsed.expectedOutputSha256);

    const versions = await listSectionVersionsInternal(decisionId, tx);
    const newest = newestOf(versions, parsed.phase);
    checkContentHash(newest, output, parsed.expectedContentSha256);

    return insertVersion(tx, {
      decisionId,
      phase: parsed.phase,
      versions,
      content,
      contentSha256: contentSha256(content),
      outputSha256: output.contentSha256,
      source: "ai",
      instruction: parsed.instruction,
      suggestionId: parsed.suggestionId,
      sourceVersionId: null,
      actor,
    });
  });
}

/**
 * R9: revert copies the target's content and the target's engine fingerprint, not the current one, so a
 * revert onto earlier figures leaves the section Out of date and blocks publishing until Update to current
 * analysis. Every version stays.
 */
export async function revertSection(actor: Actor, decisionId: string, input: RevertSectionInput): Promise<SectionVersion> {
  const parsed = parseOrThrow(RevertSchema, input);

  return db.transaction(async (tx) => {
    const decision = await lockEditableDecision(tx, actor, decisionId);
    const { facts } = await loadPhaseFacts(decision);
    const output = derivePhaseOutputs(facts)[parsed.phase] ?? null;

    const versions = await listSectionVersionsInternal(decisionId, tx);
    const newest = newestOf(versions, parsed.phase);
    if (!newest) throw new ValidationError("This section has no versions to revert.");
    checkContentHash(newest, output, parsed.expectedContentSha256);
    if (output) checkOutputHash(output, parsed.expectedOutputSha256);

    const target = versions.find((v) => v.id === parsed.versionId && v.phase === parsed.phase);
    if (!target) throw new ValidationError("That version is not part of this section.");

    return insertVersion(tx, {
      decisionId,
      phase: parsed.phase,
      versions,
      content: target.content,
      contentSha256: target.contentSha256,
      outputSha256: target.outputSha256,
      source: "revert",
      instruction: null,
      suggestionId: null,
      sourceVersionId: target.id,
      actor,
    });
  });
}

/** R9: the only path that turns an out-of-date section into a Ready one without a chat change. */
export async function updateSectionToCurrent(
  actor: Actor,
  decisionId: string,
  input: UpdateSectionToCurrentInput,
): Promise<SectionVersion> {
  const parsed = parseOrThrow(UpdateSchema, input);

  return db.transaction(async (tx) => {
    const decision = await lockEditableDecision(tx, actor, decisionId);
    const { facts } = await loadPhaseFacts(decision);
    const output = outputOf(facts, parsed.phase);
    checkOutputHash(output, parsed.expectedOutputSha256);

    const versions = await listSectionVersionsInternal(decisionId, tx);
    const newest = newestOf(versions, parsed.phase);
    checkContentHash(newest, output, parsed.expectedContentSha256);

    const content = draftContent(output);
    return insertVersion(tx, {
      decisionId,
      phase: parsed.phase,
      versions,
      content,
      contentSha256: contentSha256(content),
      outputSha256: output.contentSha256,
      source: "analysis",
      instruction: null,
      suggestionId: null,
      sourceVersionId: null,
      actor,
    });
  });
}
