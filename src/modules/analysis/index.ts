export { runAnalysis, getRun, getRunDatasetVersionIds, getLatestSucceededRun, readRunResults } from "./run";

export { pinInputs, canonicalJson, sha256, todayInZone } from "./pin-inputs";
export type { PinnedInputs, PinResult, Clock } from "./pin-inputs";

export { getAnalysisStatus, getAnalysisStatusInternal, getAnalysisSnapshot } from "./status";
export type { AnalysisStatus, AnalysisSnapshot, InputChange } from "./status";

export {
  orderResults,
  sortScreening,
  compare,
  AnalysisResultsSchema,
  ScreeningRowSchema,
  StudyFlagSchema,
  RESULTS_VERSION,
} from "./results";
export type {
  AnalysisResults,
  Impact,
  Disagreement,
  Gap,
  Limit,
  ScreeningRow,
  StudyFlag,
  StudyName,
} from "./results";

export { MEASURE_LABEL, STUDY_LABEL, formatImpactQuantity, describeImpact } from "./impact-text";

export { describeLimit } from "./limit-text";
export type { LimitContext } from "./limit-text";

export { describeScreeningRow, describeScreeningGap, SCREENING_CANNOT_SEE, STUDY_NOT_FLAGGED } from "./screening-text";

export { evaluateAppliesWhen } from "./impact";

export {
  saveResolution,
  listResolutions,
  listResolutionsInternal,
  latestResolutions,
  matchResolutions,
} from "./resolutions";
export type { EvidenceResolution, SaveResolutionInput, ResolutionMatch } from "./resolutions";
