// F24, AI assist (TechDesign/ai-assist.md). The module's public API: the only file other code imports. `assist`
// sits above analysis, workflow, profiles, and evidence; only routes import it, and `reports` must not, so no
// suggestion can reach a released document (F24 R2).

export {
  ASSISTS,
  ASSIST_IDS,
  AssistIdSchema,
  assistsByPhase,
} from "./kinds";
export type {
  AssistDef,
  AssistId,
  AssistKind,
  AssistPhase,
  ExplainContent,
  QuestionsContent,
  FindContent,
  CompareReasonsContent,
  CompareChecklistContent,
  MetadataDraftContent,
  RuleDraftContent,
  SuggestionContent,
} from "./kinds";

export {
  PER_PERSON_DAILY_CAP,
  PER_CITY_DAILY_CAP,
  NOT_CONFIGURED_MESSAGE,
  assistAvailability,
  confirmMetadataDraft,
  confirmRuleDraft,
  listCitySuggestions,
  listPhaseSuggestions,
  metadataBinding,
  requestSuggestion,
  respondToSuggestion,
} from "./run";
export type { SuggestionView, SuggestionRequestInput, ConfirmRuleInput } from "./run";

export { MAX_DOCUMENT_CHARS, addSourceDocument, indexedTextHash, listSourceDocuments } from "./documents";
export type { SourceDocumentSummary, NewDocument } from "./documents";

export type { CheckFailure } from "./checks";
export type { Quote } from "./kinds";
