import { z } from "zod";

// TechDesign/ai-assist.md, "The eight kinds" and "Assist by phase". The model never writes free prose into a
// page: it fills one of these `.strict()` shapes, and every shape has a place for the exact quote behind it.
// A model asked to "recommend" has nowhere to put it (F24 R6). A key the shape doesn't name is a parse error,
// so there is no way to smuggle an extra field through.

export const ASSIST_KINDS = [
  "explain",
  "questions",
  "find",
  "compare",
  "metadata-draft",
  "rule-draft",
  "section-explain",
  "section-edit",
] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];

export const ASSIST_PHASES = ["profile", "site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type AssistPhase = (typeof ASSIST_PHASES)[number];

export const SECTION_ASSIST_KINDS = ["section-explain", "section-edit"] as const;
export type SectionAssistKind = (typeof SECTION_ASSIST_KINDS)[number];

/** What `ai_suggestion.assist_id` holds: a phase's button, or a section chat kind when no button was chosen. */
export type StoredAssistId = AssistId | SectionAssistKind;

export function isSectionAssistKind(kind: string): kind is SectionAssistKind {
  return (SECTION_ASSIST_KINDS as readonly string[]).includes(kind);
}

export const REF_KINDS = ["line", "row", "gap", "limit", "flag", "range", "study", "rule"] as const;
export type RefKind = (typeof REF_KINDS)[number];

/** A quote names the passage it was taken from; the check is that its text is in that passage, word for word. */
export const QuoteSchema = z.object({ sourceId: z.string().min(1), text: z.string().min(1) }).strict();
export type Quote = z.infer<typeof QuoteSchema>;

// F24's section chat (TechDesign/ai-assist.md, "The section chat"). Explain answers a question about one report
// section and changes nothing; Change returns the narrative and table formats the planner asked for. Neither
// shape has a field for a table value, a map, a list, a notice, or a verdict.
export const SectionExplainSchema = z
  .object({
    paragraphs: z
      .array(z.object({ text: z.string().min(1), quotes: z.array(QuoteSchema) }).strict())
      .min(1)
      .max(8),
  })
  .strict();

export const SectionEditTableSchema = z
  .object({
    key: z.string().min(1),
    caption: z.string().min(1).max(300).nullish(),
    columnOrder: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const SectionEditSchema = z
  .object({
    headline: z.string().min(1).max(300),
    lines: z.array(z.string().min(1).max(2000)).min(1).max(40),
    tables: z.array(SectionEditTableSchema).max(4).optional(),
  })
  .strict();

export const ExplainSchema = z
  .object({
    paragraphs: z
      .array(z.object({ text: z.string().min(1), restates: z.array(z.string().min(1)).min(1), quotes: z.array(QuoteSchema) }).strict())
      .min(1)
      .max(8),
  })
  .strict();

export const QuestionsSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            text: z.string().min(1),
            basis: z.object({ kind: z.enum(REF_KINDS), ref: z.string().min(1) }).strict(),
            quote: QuoteSchema.nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export const FindSchema = z.union([
  z
    .object({
      found: z.literal(true),
      passages: z.array(z.object({ sectionPath: z.string().min(1), quote: QuoteSchema }).strict()).min(1).max(4),
      gloss: z.string().nullish(),
    })
    .strict(),
  z.object({ found: z.literal(false) }).strict(),
]);

export const COMPARE_REASONS = ["vintage", "scale", "definition", "coverage", "method", "unknown"] as const;
export const CompareReasonsSchema = z
  .object({
    reasons: z
      .array(z.object({ reason: z.enum(COMPARE_REASONS), text: z.string().min(1), quotes: z.array(QuoteSchema) }).strict())
      .max(6),
    notStated: z.array(z.string().min(1)).max(6),
  })
  .strict();

export const CompareChecklistSchema = z
  .object({
    differences: z
      .array(z.object({ study: z.string().min(1), inEngine: z.boolean(), inChecklist: z.boolean(), quote: QuoteSchema }).strict())
      .max(6),
  })
  .strict();

export const METADATA_KEYS = ["limitation", "vintage", "scale", "method"] as const;
export const MetadataDraftSchema = z
  .object({
    fields: z
      .array(z.object({ key: z.enum(METADATA_KEYS), value: z.string().min(1), quote: QuoteSchema }).strict())
      .max(4),
  })
  .strict();

export const RuleDraftSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            path: z.string().min(1),
            from: z.number(),
            to: z.number(),
            sectionPath: z.string().min(1),
            quote: QuoteSchema,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export type ExplainContent = z.infer<typeof ExplainSchema>;
export type QuestionsContent = z.infer<typeof QuestionsSchema>;
export type FindContent = z.infer<typeof FindSchema>;
export type CompareReasonsContent = z.infer<typeof CompareReasonsSchema>;
export type CompareChecklistContent = z.infer<typeof CompareChecklistSchema>;
export type MetadataDraftContent = z.infer<typeof MetadataDraftSchema>;
export type RuleDraftContent = z.infer<typeof RuleDraftSchema>;
export type SectionExplainContent = z.infer<typeof SectionExplainSchema>;
export type SectionEditContent = z.infer<typeof SectionEditSchema>;

export type SuggestionContent =
  | ExplainContent
  | QuestionsContent
  | FindContent
  | CompareReasonsContent
  | CompareChecklistContent
  | MetadataDraftContent
  | RuleDraftContent
  | SectionExplainContent
  | SectionEditContent;

export const ASSIST_IDS = ["PR1", "PR2", "EV1", "EV2", "EV3", "SC1", "SC2", "SC3", "ST1", "ST2", "ST3", "IM1", "IM2", "IM3"] as const;
export type AssistId = (typeof ASSIST_IDS)[number];
export const AssistIdSchema = z.enum(ASSIST_IDS);
export const StoredAssistIdSchema = z.union([AssistIdSchema, z.enum(SECTION_ASSIST_KINDS)]);

// What a person points at when they press the button. The subject key is part of the unique key (R13).
export type SubjectType = "phase" | "row" | "gap" | "range" | "study" | "dataset" | "document" | "question";

export type AssistDef = {
  id: StoredAssistId;
  phase: AssistPhase;
  kind: AssistKind;
  wave: 1 | 2 | 3;
  /** The button's words, as the design names them. */
  label: string;
  /** Staff-only assists (the city profile and dataset drafts, the checklist comparison). */
  staff: boolean;
  subject: SubjectType;
  /** Bumped on any change to this assist's task text or shape (conventions.md, "Prompt versions"). */
  promptVersion: number;
  /** The one sentence of instruction. The shape and the rules of quoting are the same for every assist. */
  task: string;
  /** Word cap over everything the model wrote, excluding quotes (K7). */
  maxWords: number;
  schema: z.ZodType<SuggestionContent>;
};

// The prompt version of each kind is one integer constant (conventions.md); an assist's own version is its
// kind's constant, so a change to a kind's shape or prompt moves every assist of that kind together.
export const EXPLAIN_PROMPT_VERSION = 1;
export const QUESTIONS_PROMPT_VERSION = 1;
export const FIND_PROMPT_VERSION = 1;
export const COMPARE_PROMPT_VERSION = 1;
export const METADATA_DRAFT_PROMPT_VERSION = 1;
export const RULE_DRAFT_PROMPT_VERSION = 1;
export const SECTION_EXPLAIN_PROMPT_VERSION = 1;
export const SECTION_EDIT_PROMPT_VERSION = 1;

export type SectionAssistDef = {
  kind: SectionAssistKind;
  promptVersion: number;
  task: string;
  maxWords: number;
  schema: z.ZodType<SuggestionContent>;
};

// The two kinds the section chat adds (F24 R19). They have no button and no phase of their own: a request
// carries the phase it was made on, and a prompt filler runs its own kind instead.
export const SECTION_ASSISTS: Record<SectionAssistKind, SectionAssistDef> = {
  "section-explain": {
    kind: "section-explain",
    promptVersion: SECTION_EXPLAIN_PROMPT_VERSION,
    task: "Answer the planner's question about this report section in plain words. Quote the section or the data, naming the passage each quote comes from. Do not propose a change unless the question asks for one.",
    maxWords: 300,
    schema: SectionExplainSchema,
  },
  "section-edit": {
    kind: "section-edit",
    promptVersion: SECTION_EDIT_PROMPT_VERSION,
    task: "Rewrite this report section's headline and narrative lines as the instruction asks. You may set a table's caption and reorder its columns, but every table keeps every column and you write no table value. Copy every figure exactly as it appears in the section or the data.",
    maxWords: 400,
    schema: SectionEditSchema,
  },
};

export const ASSISTS: Record<AssistId, AssistDef> = {
  PR1: {
    id: "PR1",
    phase: "profile",
    kind: "rule-draft",
    wave: 3,
    label: "Draft rule changes from this code text",
    staff: true,
    subject: "document",
    promptVersion: RULE_DRAFT_PROMPT_VERSION,
    task: "For each current rule value listed under ruleValues, say whether the code passages state a different value for that same rule. Propose a change only when a passage states the different value in so many words; quote that passage.",
    maxWords: 120,
    schema: RuleDraftSchema,
  },
  PR2: {
    id: "PR2",
    phase: "profile",
    kind: "find",
    wave: 1,
    label: "Find in the code",
    staff: false,
    subject: "question",
    promptVersion: FIND_PROMPT_VERSION,
    task: "Return the passage or passages that answer the question, quoting them exactly. If no passage answers it, return found false.",
    maxWords: 80,
    schema: FindSchema,
  },
  EV1: {
    id: "EV1",
    phase: "evidence",
    kind: "explain",
    wave: 1,
    label: "Explain this evidence",
    staff: false,
    subject: "phase",
    promptVersion: EXPLAIN_PROMPT_VERSION,
    task: "Restate each drafted line for a reader who is not a GIS analyst. Cite the line each paragraph restates. Copy every figure exactly as written; do not add, round, or convert any.",
    maxWords: 400,
    schema: ExplainSchema,
  },
  EV2: {
    id: "EV2",
    phase: "evidence",
    kind: "compare",
    wave: 2,
    label: "Why might these differ?",
    staff: false,
    subject: "row",
    promptVersion: COMPARE_PROMPT_VERSION,
    task: "List reasons why the two sources may differ that their own metadata supports: vintage, scale, definition, coverage, or method. Quote the metadata for each. Say in notStated what the metadata does not state. Do not say which source is right.",
    maxWords: 300,
    schema: CompareReasonsSchema,
  },
  EV3: {
    id: "EV3",
    phase: "evidence",
    kind: "metadata-draft",
    wave: 2,
    label: "Draft from metadata",
    staff: true,
    subject: "dataset",
    promptVersion: METADATA_DRAFT_PROMPT_VERSION,
    task: "From the publisher's metadata, propose what the dataset cannot show (limitation) and its vintage, scale, and method. Give a field only when the metadata states it, and quote the sentence. Leave a field out when it is not stated.",
    maxWords: 200,
    schema: MetadataDraftSchema,
  },
  SC1: {
    id: "SC1",
    phase: "screening",
    kind: "explain",
    wave: 1,
    label: "Explain",
    staff: false,
    subject: "row",
    promptVersion: EXPLAIN_PROMPT_VERSION,
    task: "Say in plain words what this screening row's wording and the quoted rule mean together. One paragraph. Quote the rule and any limitation. Do not say the row is or is not a concern.",
    maxWords: 150,
    schema: ExplainSchema,
  },
  SC2: {
    id: "SC2",
    phase: "screening",
    kind: "questions",
    wave: 2,
    label: "What might this screen miss?",
    staff: false,
    subject: "phase",
    promptVersion: QUESTIONS_PROMPT_VERSION,
    task: "Turn each recorded gap, limit, or flagged row into one concrete question a planner could ask in the field or at a pre-application conference. Each question must name the gap, limit, or row it comes from in basis. Questions only.",
    maxWords: 250,
    schema: QuestionsSchema,
  },
  SC3: {
    id: "SC3",
    phase: "screening",
    kind: "find",
    wave: 1,
    label: "Where does the code say this?",
    staff: false,
    subject: "row",
    promptVersion: FIND_PROMPT_VERSION,
    task: "Return the passage that sets the buffer or the trigger for this resource, quoting it exactly. If no passage does, return found false.",
    maxWords: 80,
    schema: FindSchema,
  },
  ST1: {
    id: "ST1",
    phase: "studies",
    kind: "find",
    wave: 1,
    label: "Why is this study listed?",
    staff: false,
    subject: "study",
    promptVersion: FIND_PROMPT_VERSION,
    task: "Return the passage that names this study, and the checklist line it appears on if one was supplied, quoting each exactly. If none does, return found false.",
    maxWords: 80,
    schema: FindSchema,
  },
  ST2: {
    id: "ST2",
    phase: "studies",
    kind: "questions",
    wave: 2,
    label: "Questions for the conference",
    staff: false,
    subject: "phase",
    promptVersion: QUESTIONS_PROMPT_VERSION,
    task: "For each flagged study, ask what information would show whether the flagged resource is on or near the site. Each question must name the flagged row it comes from in basis. Questions about information only, never about what an applicant must do.",
    maxWords: 250,
    schema: QuestionsSchema,
  },
  ST3: {
    id: "ST3",
    phase: "studies",
    kind: "compare",
    wave: 3,
    label: "Compare with the checklist",
    staff: true,
    subject: "document",
    promptVersion: COMPARE_PROMPT_VERSION,
    task: "List each study that appears in the engine's list but not in the checklist text, or in the checklist text but not in the engine's list, with the checklist sentence quoted. If there are no differences, return an empty list.",
    maxWords: 120,
    schema: CompareChecklistSchema,
  },
  IM1: {
    id: "IM1",
    phase: "impact",
    kind: "explain",
    wave: 1,
    label: "Explain this impact",
    staff: false,
    subject: "phase",
    promptVersion: EXPLAIN_PROMPT_VERSION,
    task: "Restate each impact row for a reader who has not seen the table, copying its figures exactly as written. Do not round, sum, convert, compare resources, or call any impact large, small, or acceptable. Include both ends of any range.",
    maxWords: 400,
    schema: ExplainSchema,
  },
  IM2: {
    id: "IM2",
    phase: "impact",
    kind: "questions",
    wave: 2,
    label: "What would narrow this range?",
    staff: false,
    subject: "range",
    promptVersion: QUESTIONS_PROMPT_VERSION,
    task: "Ask what field-rated fact decides which end of this range applies. Do not assume the fact, and do not say which end is likely. basis must name the range row.",
    maxWords: 120,
    schema: QuestionsSchema,
  },
  IM3: {
    id: "IM3",
    phase: "impact",
    kind: "find",
    wave: 1,
    label: "Where does the code set this width?",
    staff: false,
    subject: "row",
    promptVersion: FIND_PROMPT_VERSION,
    task: "Return the passage that sets this width, quoting it exactly. If no passage does, return found false.",
    maxWords: 80,
    schema: FindSchema,
  },
};

export const assistsByPhase = (phase: AssistPhase): AssistDef[] =>
  ASSIST_IDS.map((id) => ASSISTS[id]).filter((a) => a.phase === phase);
