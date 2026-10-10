import { z } from "zod";

import { ASSIST_KINDS, AssistIdSchema, REF_KINDS } from "./kinds";

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

export const AssistRequestSchema = z
  .object({
    assistId: AssistIdSchema,
    kind: z.enum(ASSIST_KINDS),
    promptVersion: z.number().int().positive(),
    task: z.string().min(1),
    /** Find's question, or null. A planner's own words, so it is the one free-text field that leaves UPlan. */
    question: z.string().nullable(),
    /** Everything the model may quote. Each has an id a quote must name. */
    passages: z.array(PassageSchema),
    /** Everything the model may point at (a line, a row, a gap, a range). A reference to anything else is rejected. */
    refs: z.array(RefSchema),
    /** Rule drafts only: the current value at each rule-owned path, so `from` can be checked. */
    ruleValues: z.array(RuleValueSchema),
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
  for (const r of request.ruleValues) {
    add(r.path);
    add(String(r.value));
  }
  return found;
}
