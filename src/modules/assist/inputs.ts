import { STUDY_LABEL, describeImpact, describeLimit, describeScreeningGap, describeScreeningRow, type AnalysisResults } from "@/modules/analysis";
import type { BufferRule, InForceRules, StudyTrigger } from "@/modules/profiles";
import { formatAcres, formatFeet, formatSqFt } from "@/modules/provenance";
import { sectionTableDefs } from "@/modules/reports";
import { contentSha256, type PhaseFacts, type PhaseKey, type PhaseView, type SectionContent } from "@/modules/workflow";
import { ValidationError } from "@/platform/errors";

import {
  ASSISTS,
  SECTION_ASSISTS,
  isSectionAssistKind,
  type AssistId,
  type SectionAssistKind,
  type StoredAssistId,
} from "./kinds";
import {
  AssistRequestSchema,
  type AssistRequest,
  type Passage,
  type Ref,
  type RuleValue,
  type SectionText,
  type TableFormat,
} from "./request";

// TechDesign/ai-assist.md, "What may be sent". This file is the only code that assembles a request, and it
// can only read the narrow types below: the phase outputs and results (class C4), the profile's rules (C3),
// dataset metadata (C2), and code text (C1). It is never handed a decision, so a project's title, parcel,
// applicant, notes, dates, and coordinates have no path into a request (F24 R8). The sentinel test in
// inputs.test.ts holds that line.

export type AssistWorkflow = { facts: PhaseFacts; phases: PhaseView[] };

/** One chunk of code text, as retrieved: `sectionPath` is the label a quote's section must equal. */
export type CodePassage = { id: string; sectionPath: string; body: string };

/** C2: the plain text fields of one dataset version, for EV2. */
export type DatasetMeta = {
  versionId: string;
  title: string;
  publisher: string;
  license: string;
  authority: string;
  spatialPrecision: string;
  sourceAsOfOn: string | null;
  sourceAsOfNote: string | null;
  limitation: string | null;
};

export type BuildContext = {
  workflow: AssistWorkflow | null;
  /** Retrieved code chunks (C1) for Find and rule drafts. */
  codePassages: CodePassage[];
  question: string | null;
  datasetMeta: DatasetMeta[];
  /** Text a staff member supplied: a publisher's metadata (EV3) or a city checklist (ST3). */
  suppliedText: { label: string; text: string } | null;
  /**
   * For assists that read no phase output (EV3, PR2): the hash of what the suggestion is bound to, computed by
   * the caller from the supplied text or the indexed code. Null for every phase assist.
   */
  boundTo: string | null;
  /** The profile's rules in force and the values a rule draft may change (PR1, ST3). */
  profile: { rules: InForceRules; ruleValues: RuleValue[]; documentSha256: string } | null;
};

export type BuiltRequest = {
  request: AssistRequest;
  /** The output this suggestion is bound to (F24 R10): a phase fingerprint, or a profile or text hash. */
  outputSha256: string;
  /** Section chat only (F21 R7): the hash of the section content the request was made on. */
  sectionSha256?: string | null;
  /** Part of the one-live-suggestion key (R13). '' for a whole phase. */
  subjectKey: string;
};

// ---------------------------------------------------------------------------------------------------------
// Passage and reference helpers.
// ---------------------------------------------------------------------------------------------------------

const labelOf = (rules: InForceRules, key: string): string => rules.resourceTypes.find((r) => r.key === key)?.label ?? key;

function citationOf(c: { codeSection: string; ordinance: string | null }): string {
  return c.ordinance ? `${c.codeSection} (${c.ordinance})` : c.codeSection;
}

function bufferRulePassage(rules: InForceRules, b: BufferRule): Passage {
  const when = b.appliesWhen ? `, when ${b.appliesWhen.attribute} is ${b.appliesWhen.equals}` : "";
  return {
    id: `rule:${b.key}`,
    label: `Rule ${b.key}`,
    text: `${labelOf(rules, b.resourceType)}: a buffer of ${formatFeet(b.widthFt)}${when}. Cited as ${citationOf(b.citation)}; in force from ${b.effectiveOn}.`,
  };
}

function triggerPassage(rules: InForceRules, t: StudyTrigger): Passage {
  return {
    id: `rule:${t.key}`,
    label: `Rule ${t.key}`,
    text: `${labelOf(rules, t.resourceType)}: ${STUDY_LABEL[t.study]} is named when a mapped feature is within ${formatFeet(t.withinFt)}. Cited as ${citationOf(t.citation)}; in force from ${t.effectiveOn}.`,
  };
}

function rulePassagesFor(rules: InForceRules, resourceType: string): Passage[] {
  return [
    ...rules.bufferRules.filter((b) => b.resourceType === resourceType).map((b) => bufferRulePassage(rules, b)),
    ...rules.studyTriggers.filter((t) => t.resourceType === resourceType).map((t) => triggerPassage(rules, t)),
  ];
}

const codePassageToPassage = (c: CodePassage): Passage => ({ id: c.id, label: c.sectionPath, text: c.body });

function viewOf(wf: AssistWorkflow, phase: PhaseKey): PhaseView {
  const view = wf.phases.find((p) => p.phase === phase);
  if (!view) throw new Error(`the workflow has no ${phase} phase`);
  return view;
}

function outputOf(wf: AssistWorkflow, phase: PhaseKey) {
  const output = viewOf(wf, phase).output;
  if (!output) throw new ValidationError(`The ${phase} phase has no output yet, so there is nothing to ask about.`);
  return output;
}

function runOf(wf: AssistWorkflow): { results: AnalysisResults; rules: InForceRules } {
  const { run, rules } = wf.facts;
  if (!run || !rules) throw new ValidationError("The analysis for this project's current inputs has not finished, so there is nothing to ask about.");
  return { results: run.results, rules };
}

function requireWorkflow(ctx: BuildContext): AssistWorkflow {
  if (!ctx.workflow) throw new Error("this assist needs a project's workflow");
  return ctx.workflow;
}

/** The drafted headline and lines as quotable passages: `line:0` is the headline. */
function linePassages(headline: string, lines: string[]): { passages: Passage[]; refs: Ref[] } {
  const all = [headline, ...lines];
  return {
    passages: all.map((text, i) => ({ id: `line:${i}`, label: `Drafted line ${i}`, text })),
    refs: all.map((_, i) => ({ id: `line:${i}`, kind: "line" as const })),
  };
}

function limitPassages(results: AnalysisResults, rules: InForceRules, facts: PhaseFacts): { passages: Passage[]; refs: Ref[] } {
  const passages: Passage[] = [];
  const refs: Ref[] = [];
  for (const limit of results.limits) {
    const id = `limit:${limit.key}:${limit.resourceType ?? ""}:${limit.datasetVersionId ?? ""}`;
    const text = describeLimit(limit, {
      resourceLabel: limit.resourceType ? labelOf(rules, limit.resourceType) : null,
      datasetLimitation: limit.datasetVersionId ? (facts.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
    });
    passages.push({ id, label: "A limit of desk analysis", text });
    refs.push({ id, kind: "limit" });
  }
  return { passages, refs };
}

function gapPassages(results: AnalysisResults, rules: InForceRules): { passages: Passage[]; refs: Ref[] } {
  const passages = results.evidenceBase.gaps.map((g) => ({
    id: `gap:${g.resourceType}:${g.reason}`,
    label: `Gap: ${labelOf(rules, g.resourceType)}`,
    text: `${labelOf(rules, g.resourceType)}: ${describeScreeningGap(g.reason)}`,
  }));
  return { passages, refs: passages.map((p) => ({ id: p.id, kind: "gap" as const })) };
}

function rowText(rules: InForceRules, row: AnalysisResults["screening"][number]): string {
  return `${labelOf(rules, row.resourceType)}: ${describeScreeningRow(row)}`;
}

function request(
  assistId: StoredAssistId,
  parts: {
    question?: string | null;
    passages: Passage[];
    refs?: Ref[];
    ruleValues?: RuleValue[];
    section?: SectionText | null;
    instruction?: string | null;
    tableFormats?: TableFormat[];
  },
): AssistRequest {
  const def = isSectionAssistKind(assistId) ? SECTION_ASSISTS[assistId] : ASSISTS[assistId];
  return AssistRequestSchema.parse({
    assistId,
    kind: def.kind,
    promptVersion: def.promptVersion,
    task: def.task,
    question: parts.question ?? null,
    passages: parts.passages,
    refs: parts.refs ?? [],
    ruleValues: parts.ruleValues ?? [],
    section: parts.section ?? null,
    instruction: parts.instruction ?? null,
    tableFormats: parts.tableFormats ?? [],
  });
}

function boundTo(ctx: BuildContext): string {
  if (ctx.boundTo === null) throw new Error("this assist needs the hash of the text it is bound to");
  return ctx.boundTo;
}

function requireCode(ctx: BuildContext): CodePassage[] {
  if (ctx.codePassages.length === 0) {
    throw new ValidationError("No indexed code text matched. Staff add the city's code text on the profile page first.");
  }
  return ctx.codePassages;
}

/** C2 as one passage of plain lines. A field the record does not have is left out, never written as "unknown". */
export function describeDatasetMeta(meta: DatasetMeta): string {
  const lines = [
    `Title: ${meta.title}`,
    `Publisher: ${meta.publisher}`,
    `License: ${meta.license}`,
    `Authority: ${meta.authority}`,
    `Spatial precision: ${meta.spatialPrecision}`,
    meta.sourceAsOfOn ? `Source as of: ${meta.sourceAsOfOn}` : null,
    meta.sourceAsOfNote ? `Source as-of note: ${meta.sourceAsOfNote}` : null,
    meta.limitation ? `Recorded limitation: ${meta.limitation}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

// ---------------------------------------------------------------------------------------------------------
// The section chat's input (F21 R6, R7; F24 R8).
// ---------------------------------------------------------------------------------------------------------

/** The project details an instruction must not carry: checked before the text leaves UPlan, never sent. */
export type SectionIdentity = {
  title: string;
  parcelOrAddress: string | null;
  applicant: string | null;
  projectManager: string | null;
};

export type SectionChatInput = {
  phase: PhaseKey;
  section: SectionContent;
  instruction: string;
  sampleData: boolean;
  identity: SectionIdentity;
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * C6: the one free-text field the section chat adds. It is refused, with the reason, when it carries the
 * project's identity or an email address; the model call is never made (TechDesign/ai-assist.md).
 */
export function identityProblem(instruction: string, identity: SectionIdentity): string | null {
  if (EMAIL.test(instruction)) return "The message contains an email address. Remove it before sending.";
  const terms: { value: string | null; label: string }[] = [
    { value: identity.title, label: "title" },
    { value: identity.parcelOrAddress, label: "parcel or address" },
    { value: identity.applicant, label: "applicant" },
    { value: identity.projectManager, label: "project manager" },
  ];
  for (const term of terms) {
    const value = term.value?.trim() ?? "";
    if (value.length === 0) continue;
    // A one- or two-letter value would match almost any sentence; those are matched as whole words.
    const hit =
      value.length >= 3
        ? instruction.toLowerCase().includes(value.toLowerCase())
        : new RegExp(`\\b${escapeRegExp(value)}\\b`, "i").test(instruction);
    if (hit) return `The message contains the project's ${term.label}. Remove it before sending.`;
  }
  return null;
}

function sectionTextOf(content: SectionContent): SectionText {
  return {
    headline: content.headline,
    lines: content.lines,
    tables: content.tables.map((t) => ({ key: t.key, caption: t.caption, columnOrder: t.columnOrder })),
  };
}

/** The section's own words as quotable passages, so an Explain answer can cite the sentence it explains (K2). */
function sectionLinePassages(content: SectionContent): Passage[] {
  const passages: Passage[] = [{ id: "section:0", label: "The section's headline", text: content.headline }];
  content.lines.forEach((line, i) => passages.push({ id: `section:${i + 1}`, label: "A line of the section", text: line }));
  for (const table of content.tables) {
    if (table.caption !== null) passages.push({ id: `section:caption:${table.key}`, label: "A table caption", text: table.caption });
  }
  return passages;
}

function tableFormatsOf(phase: PhaseKey): TableFormat[] {
  return sectionTableDefs(phase).map((d) => ({ key: d.key, columns: [...d.columns] }));
}

/** C4: the geometry summary, with no coordinates and no identifier (F21 R8). */
function geometryPassage(label: string, summary: NonNullable<PhaseFacts["studyArea"]>, sampleData: boolean): Passage {
  return {
    id: "geometry",
    label,
    text: `${label}: revision ${summary.revision}, ${formatAcres(summary.areaAcres)}. Source note: ${summary.sourceNote}.${
      sampleData ? " This project was built from sample data." : ""
    }`,
  };
}

function flagPassage(rules: InForceRules, flag: AnalysisResults["studyFlags"][number]): Passage {
  return {
    id: `flag:${flag.triggerKey}`,
    label: `Flag: ${STUDY_LABEL[flag.study]}`,
    text: `${STUDY_LABEL[flag.study]} is flagged by ${labelOf(rules, flag.resourceType)}; ${
      flag.nearestDistanceFt === 0
        ? "a mapped feature is inside the study area."
        : `the nearest mapped feature is ${formatFeet(flag.nearestDistanceFt)} away.`
    }`,
  };
}

/** C4: the measured facts the phase's section rests on, by phase. C3 rules join them where the phase uses rules. */
function sectionPassages(phase: PhaseKey, wf: AssistWorkflow, sampleData: boolean): { passages: Passage[]; refs: Ref[] } {
  const { facts } = wf;
  if (phase === "site" || phase === "footprint") {
    const summary = phase === "site" ? facts.studyArea : facts.footprint;
    if (!summary) throw new ValidationError(`The ${phase} phase has no boundary yet.`);
    return { passages: [geometryPassage(phase === "site" ? "The study area" : "The footprint", summary, sampleData)], refs: [] };
  }

  const { results, rules } = runOf(wf);
  const output = outputOf(wf, phase);
  const passages: Passage[] = [];
  const refs: Ref[] = [];

  if (phase === "evidence") {
    const lines = linePassages(output.headline, output.lines);
    passages.push(...lines.passages);
    refs.push(...lines.refs);
    for (const [versionId, text] of facts.datasetLimitations) {
      passages.push({
        id: `lim:${versionId}`,
        label: `${facts.datasetTitles.get(versionId) ?? "A dataset"}: what it can't show`,
        text,
      });
    }
  } else if (phase === "screening") {
    const gaps = gapPassages(results, rules);
    const limits = limitPassages(results, rules, facts);
    passages.push(...gaps.passages, ...limits.passages);
    refs.push(...gaps.refs, ...limits.refs);
    for (const row of results.screening) {
      const id = `row:${row.resourceType}:${row.datasetVersionId}`;
      passages.push({ id, label: "A screening row", text: rowText(rules, row) });
      refs.push({ id, kind: "row" });
    }
  } else if (phase === "studies") {
    const gaps = gapPassages(results, rules);
    passages.push(...gaps.passages);
    refs.push(...gaps.refs);
    for (const flag of results.studyFlags) {
      passages.push(flagPassage(rules, flag));
      refs.push({ id: `flag:${flag.triggerKey}`, kind: "flag" });
    }
  } else {
    const lines = linePassages(output.headline, output.lines);
    const limits = limitPassages(results, rules, facts);
    passages.push(...lines.passages, ...limits.passages);
    refs.push(...lines.refs, ...limits.refs);
    for (const impact of results.impacts) {
      const id = `impact:${impact.impactKey}`;
      passages.push({ id, label: "An impact row", text: describeImpact(impact, labelOf(rules, impact.resourceType)) });
      refs.push({ id, kind: "range" });
    }
  }

  // C3: the rules in force, so a quote about a buffer or a study trigger is checked against its own text.
  passages.push(
    ...rules.bufferRules.map((b) => bufferRulePassage(rules, b)),
    ...rules.studyTriggers.map((t) => triggerPassage(rules, t)),
  );
  return { passages, refs };
}

/** The section chat's request: C5, C6, the canonical table formats, and the phase's measured facts (C3/C4). */
export function buildSectionInput(kind: SectionAssistKind, input: SectionChatInput, ctx: BuildContext): BuiltRequest {
  const wf = requireWorkflow(ctx);
  const output = outputOf(wf, input.phase);
  const problem = identityProblem(input.instruction, input.identity);
  if (problem) throw new ValidationError(problem);

  const { passages, refs } = sectionPassages(input.phase, wf, input.sampleData);
  return {
    request: request(kind, {
      passages: [...passages, ...sectionLinePassages(input.section)],
      refs,
      section: sectionTextOf(input.section),
      instruction: input.instruction,
      tableFormats: tableFormatsOf(input.phase),
    }),
    outputSha256: output.contentSha256,
    sectionSha256: contentSha256(input.section),
    subjectKey: "",
  };
}

/** A prompt filler's request with the section and the instruction added: the filler's kind runs (F24 R19). */
export function attachSection(
  built: BuiltRequest,
  args: { phase: PhaseKey; section: SectionContent; instruction: string },
): BuiltRequest {
  return {
    ...built,
    request: AssistRequestSchema.parse({
      ...built.request,
      passages: [...built.request.passages, ...sectionLinePassages(args.section)],
      section: sectionTextOf(args.section),
      instruction: args.instruction,
      tableFormats: tableFormatsOf(args.phase),
    }),
    sectionSha256: contentSha256(args.section),
  };
}

// ---------------------------------------------------------------------------------------------------------
// One builder per assist. Each returns the request and the output it was made on.
// ---------------------------------------------------------------------------------------------------------

export function buildRequest(assistId: AssistId, subjectKey: string, ctx: BuildContext): BuiltRequest {
  switch (assistId) {
    case "EV1": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "evidence");
      runOf(wf); // the analysis must be current, as for every phase that reads it
      const lines = linePassages(output.headline, output.lines);
      const limits = [...wf.facts.datasetLimitations].map(([versionId, text]) => ({
        id: `lim:${versionId}`,
        label: `${wf.facts.datasetTitles.get(versionId) ?? "A dataset"}: what it can't show`,
        text,
      }));
      return {
        request: request("EV1", { passages: [...lines.passages, ...limits], refs: lines.refs }),
        outputSha256: output.contentSha256,
        subjectKey: "",
      };
    }

    case "EV2": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "evidence");
      const { results, rules } = runOf(wf);
      const [resourceType, mappedBy, notMappedBy] = subjectKey.split(":");
      const found = results.evidenceBase.disagreements.find(
        (d) => d.resourceType === resourceType && d.mappedBy === mappedBy && d.notMappedBy === notMappedBy,
      );
      if (!found) throw new ValidationError("That disagreement is not in the current analysis.");
      const meta = [found.mappedBy, found.notMappedBy].map((id) => {
        const m = ctx.datasetMeta.find((d) => d.versionId === id);
        if (!m) throw new Error(`no dataset metadata was supplied for ${id}`);
        return m;
      });
      const [a, b] = meta;
      if (!a || !b) throw new Error("a disagreement has two sources");
      return {
        request: request("EV2", {
          passages: [
            { id: "meta:a", label: `Metadata of ${a.title}`, text: describeDatasetMeta(a) },
            { id: "meta:b", label: `Metadata of ${b.title}`, text: describeDatasetMeta(b) },
            {
              id: "diff",
              label: "The measured difference",
              text: `${formatSqFt(found.area)} of ${labelOf(rules, found.resourceType)} is mapped by ${a.title} and not by ${b.title}.`,
            },
          ],
        }),
        outputSha256: output.contentSha256,
        subjectKey,
      };
    }

    case "EV3": {
      if (!ctx.suppliedText) throw new ValidationError("Paste the publisher's metadata text first.");
      return {
        request: request("EV3", { passages: [{ id: "meta:1", label: ctx.suppliedText.label, text: ctx.suppliedText.text }] }),
        outputSha256: boundTo(ctx),
        subjectKey,
      };
    }

    case "SC1": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "screening");
      const { results, rules } = runOf(wf);
      const [kind, resourceType, tail] = subjectKey.split(":");
      const passages: Passage[] = [];
      const refs: Ref[] = [];
      if (kind === "row") {
        const row = results.screening.find((r) => r.resourceType === resourceType && r.datasetVersionId === tail);
        if (!row) throw new ValidationError("That row is not in the current screening.");
        passages.push({ id: subjectKey, label: "The screening row", text: rowText(rules, row) });
        refs.push({ id: subjectKey, kind: "row" });
        const limitation = wf.facts.datasetLimitations.get(row.datasetVersionId);
        if (limitation) passages.push({ id: "lim", label: "What the dataset can't show", text: limitation });
      } else if (kind === "gap") {
        const gap = results.evidenceBase.gaps.find((g) => g.resourceType === resourceType && g.reason === tail);
        if (!gap) throw new ValidationError("That gap is not in the current screening.");
        passages.push({ id: subjectKey, label: "The screening gap", text: `${labelOf(rules, gap.resourceType)}: ${describeScreeningGap(gap.reason)}` });
        refs.push({ id: subjectKey, kind: "gap" });
      } else {
        throw new ValidationError("Choose a screening row to explain.");
      }
      if (resourceType) passages.push(...rulePassagesFor(rules, resourceType));
      return { request: request("SC1", { passages, refs }), outputSha256: output.contentSha256, subjectKey };
    }

    case "SC2": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "screening");
      const { results, rules } = runOf(wf);
      const gaps = gapPassages(results, rules);
      const limits = limitPassages(results, rules, wf.facts);
      const rows = results.screening
        .filter((r) => r.intersectingFeatureCount > 0)
        .map((r) => ({ id: `row:${r.resourceType}:${r.datasetVersionId}`, label: "A screening row with mapped features", text: rowText(rules, r) }));
      return {
        request: request("SC2", {
          passages: [...gaps.passages, ...limits.passages, ...rows],
          refs: [...gaps.refs, ...limits.refs, ...rows.map((p) => ({ id: p.id, kind: "row" as const }))],
        }),
        outputSha256: output.contentSha256,
        subjectKey: "",
      };
    }

    case "SC3":
    case "IM3": {
      const wf = requireWorkflow(ctx);
      const phase: PhaseKey = assistId === "SC3" ? "screening" : "impact";
      const output = outputOf(wf, phase);
      const { rules } = runOf(wf);
      const resourceType = subjectKey.split(":")[assistId === "SC3" ? 1 : 0];
      if (!resourceType) throw new ValidationError("Choose a row.");
      return {
        request: request(assistId, {
          question: `Which passage of the code sets the buffer or study trigger for ${labelOf(rules, resourceType)}?`,
          passages: [...rulePassagesFor(rules, resourceType), ...requireCode(ctx).map(codePassageToPassage)],
        }),
        outputSha256: output.contentSha256,
        subjectKey,
      };
    }

    case "ST1": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "studies");
      const { rules } = runOf(wf);
      const triggers = rules.studyTriggers.filter((t) => t.study === subjectKey);
      const first = triggers[0];
      if (!first) throw new ValidationError("The profile has no rule that names that study.");
      return {
        request: request("ST1", {
          question: `Which passage of the code names the ${STUDY_LABEL[first.study]}?`,
          passages: [...triggers.map((t) => triggerPassage(rules, t)), ...requireCode(ctx).map(codePassageToPassage)],
        }),
        outputSha256: output.contentSha256,
        subjectKey,
      };
    }

    case "ST2": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "studies");
      const { results, rules } = runOf(wf);
      if (results.studyFlags.length === 0) {
        throw new ValidationError("No study is flagged by mapped data, so there are no flagged rows to ask about.");
      }
      const flags = results.studyFlags.map((f) => ({
        id: `flag:${f.triggerKey}`,
        label: `Flag: ${STUDY_LABEL[f.study]}`,
        text: `${STUDY_LABEL[f.study]} is flagged by ${labelOf(rules, f.resourceType)}; ${
          f.nearestDistanceFt === 0 ? "a mapped feature is inside the study area." : `the nearest mapped feature is ${formatFeet(f.nearestDistanceFt)} away.`
        }`,
      }));
      const gaps = gapPassages(results, rules);
      return {
        request: request("ST2", {
          passages: [...flags, ...gaps.passages],
          refs: [...flags.map((p) => ({ id: p.id, kind: "flag" as const })), ...gaps.refs],
        }),
        outputSha256: output.contentSha256,
        subjectKey: "",
      };
    }

    case "ST3": {
      if (!ctx.suppliedText) throw new ValidationError("Choose the checklist text to compare with.");
      if (!ctx.profile) throw new Error("this assist needs the profile's rules");
      const engine = [...new Set(ctx.profile.rules.studyTriggers.map((t) => t.study))].sort().map((s) => STUDY_LABEL[s]);
      return {
        request: request("ST3", {
          passages: [
            { id: "engine", label: "The studies the profile names", text: engine.length > 0 ? engine.join("\n") : "The profile names no studies." },
            { id: "checklist", label: ctx.suppliedText.label, text: ctx.suppliedText.text },
          ],
        }),
        outputSha256: ctx.profile.documentSha256,
        subjectKey,
      };
    }

    case "IM1": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "impact");
      const lines = linePassages(output.headline, output.lines);
      return { request: request("IM1", { passages: lines.passages, refs: lines.refs }), outputSha256: output.contentSha256, subjectKey: "" };
    }

    case "IM2": {
      const wf = requireWorkflow(ctx);
      const output = outputOf(wf, "impact");
      const { results, rules } = runOf(wf);
      const impact = results.impacts.find((i) => `range:${i.impactKey}` === subjectKey);
      if (!impact || impact.min === impact.max) throw new ValidationError("That row is not a range in the current impact.");
      const rulePassages = [
        ...rules.bufferRules.filter((b) => impact.ruleKeys.includes(b.key)).map((b) => bufferRulePassage(rules, b)),
        ...rules.studyTriggers.filter((t) => impact.ruleKeys.includes(t.key)).map((t) => triggerPassage(rules, t)),
      ];
      return {
        request: request("IM2", {
          passages: [
            { id: subjectKey, label: "The impact range", text: describeImpact(impact, labelOf(rules, impact.resourceType)) },
            ...rulePassages,
          ],
          refs: [{ id: subjectKey, kind: "range" }],
        }),
        outputSha256: output.contentSha256,
        subjectKey,
      };
    }

    case "PR1": {
      if (!ctx.profile) throw new Error("this assist needs the profile's rules");
      const passages = requireCode(ctx).map(codePassageToPassage);
      return {
        request: request("PR1", { passages, ruleValues: ctx.profile.ruleValues }),
        outputSha256: ctx.profile.documentSha256,
        subjectKey,
      };
    }

    case "PR2": {
      if (!ctx.question) throw new ValidationError("Type a question to find in the code.");
      return {
        request: request("PR2", { question: ctx.question, passages: requireCode(ctx).map(codePassageToPassage) }),
        outputSha256: boundTo(ctx),
        subjectKey,
      };
    }
  }
}
