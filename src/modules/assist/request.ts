import { z } from "zod";

import { ASSIST_KINDS, REF_KINDS, StoredAssistIdSchema } from "./kinds";

// TechDesign/ai-assist.md, "What may be sent" (F24 R8). The request is the only thing that leaves UPlan, and
// this schema is its whole shape. It is `.strict()`: a field not named here is a parse error, so a builder
// cannot add a project's title or an address by accident, and an extra key at runtime is rejected. The
// request as built is stored beside the suggestion, so anyone can see exactly what was sent.

export const PassageSchema = z.object({ id: z.string().min(1), label: z.string().min(1), text: z.string().min(1) }).strict();
export type Passage = z.infer<typeof PassageSchema>;

export const RefSchema = z.object({ id: z.string().min(1), kind: z.enum(REF_KINDS) }).strict();
export type Ref = z.infer<typeof RefSchema>;

export const RuleValueSchema = z.object({ path: z.string().min(1), value: z.number() }).strict();
export type RuleValue = z.infer<typeof RuleValueSchema>;

/**
 * C5: the section as the planner sees it. Only the editable surface is named — the headline, the narrative
 * lines, and each printed table's key, caption, and column order. Table values, maps, notices, and quotes are
 * rendered by the report from its own records and have no field here.
 */
export const SectionTextSchema = z
  .object({
    headline: z.string(),
    lines: z.array(z.string()),
    tables: z.array(
      z
        .object({
          key: z.string().min(1),
          caption: z.string().nullable(),
          columnOrder: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export type SectionText = z.infer<typeof SectionTextSchema>;

/** The tables a section prints and the columns each must keep: what K9 checks and a rewrite may only reorder. */
export const TableFormatSchema = z.object({ key: z.string().min(1), columns: z.array(z.string().min(1)) }).strict();
export type TableFormat = z.infer<typeof TableFormatSchema>;

export const AssistRequestSchema = z
  .object({
    assistId: StoredAssistIdSchema,
    kind: z.enum(ASSIST_KINDS),
    promptVersion: z.number().int().positive(),
    task: z.string().min(1),
    /** Find's question, or null. A planner's own words, so it is one of the free-text fields that leave UPlan. */
    question: z.string().nullable(),
    /** Everything the model may quote. Each has an id a quote must name. */
    passages: z.array(PassageSchema),
    /** Everything the model may point at (a line, a row, a gap, a range). A reference to anything else is rejected. */
    refs: z.array(RefSchema),
    /** Rule drafts only: the current value at each rule-owned path, so `from` can be checked. */
    ruleValues: z.array(RuleValueSchema),
    /** Section chat only (C5). Null for every other assist. */
    section: SectionTextSchema.nullable().default(null),
    /** Section chat only (C6): the planner's chat message, after the identity check. */
    instruction: z.string().nullable().default(null),
    /** Section chat only: the canonical tables and columns a rewrite may reorder, never drop. */
    tableFormats: z.array(TableFormatSchema).default([]),
  })
  .strict();
export type AssistRequest = z.infer<typeof AssistRequestSchema>;

/** A digit run, with its own decimal point or thousands separators: "1.84", "12,500", "2023". */
const DIGIT_RUN = /\d+(?:[.,]\d+)*/g;

export function digitRuns(text: string): string[] {
  return text.match(DIGIT_RUN) ?? [];
}

/** Every number the model was given (K3): in a passage, a label, the question, or a rule's current value. */
export function numbersInRequest(request: AssistRequest): Set<string> {
  const found = new Set<string>();
  const add = (text: string) => {
    for (const run of digitRuns(text)) found.add(run);
  };
  for (const p of request.passages) {
    add(p.text);
    add(p.label);
  }
  if (request.question !== null) add(request.question);
  if (request.instruction !== null) add(request.instruction);
  if (request.section !== null) {
    add(request.section.headline);
    for (const line of request.section.lines) add(line);
    for (const table of request.section.tables) if (table.caption !== null) add(table.caption);
  }
  for (const r of request.ruleValues) {
    add(r.path);
    add(String(r.value));
  }
  return found;
}
