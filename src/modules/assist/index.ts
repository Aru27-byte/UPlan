// F24, AI assist (TechDesign/ai-assist.md). The module's public API: the only file other code imports. `assist`
// sits above analysis, workflow, profiles, and evidence; only routes import it, and `reports` must not, so no
// suggestion can reach a released document (F24 R2).

export {
  ASSISTS,
  ASSIST_IDS,
  AssistIdSchema,
  SECTION_ASSISTS,
  SECTION_ASSIST_KINDS,
  StoredAssistIdSchema,
  assistsByPhase,
  isSectionAssistKind,
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
  SectionAssistKind,
  SectionExplainContent,
  SectionEditContent,
  StoredAssistId,
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
  requestSectionSuggestion,
  requestSuggestion,
  respondToSuggestion,
} from "./run";
export type { SuggestionView, SuggestionRequestInput, SectionRequestInput, ConfirmRuleInput } from "./run";

export { MAX_DOCUMENT_CHARS, addSourceDocument, indexedTextHash, listSourceDocuments } from "./documents";
export type { SourceDocumentSummary, NewDocument } from "./documents";

export type { CheckFailure } from "./checks";
export type { Quote } from "./kinds";

export { chatMessage } from "./tables";
export { saveChatMessage, listChatMessages } from "./chat";
export type { ChatMessage } from "./chat";

export { scanDocument } from "./scan";
export type { ExtractedFields } from "./scan";

export { answerDashboardQuestion } from "./dashboard";
