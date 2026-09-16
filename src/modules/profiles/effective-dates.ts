import { listOpenDecisions } from "@/modules/decisions";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { ProfileDocumentSchema } from "./schema";
import { getCurrentProfileForAnalysis } from "./versions";

/**
 * The apply_effective_dates job body (J3), daily per jurisdiction (R10 of jurisdiction-profile.md):
 * when a rule's effectiveOn/repealedOn falls on `today`, every open decision is queued for
 * re-analysis, so results never silently lag a rule taking effect.
 */
export async function applyEffectiveDates(jurisdictionId: string, today: string): Promise<void> {
  const profile = await getCurrentProfileForAnalysis(jurisdictionId);
  if (!profile) return;

  // Re-validate rather than `as`-cast: profile.document is untyped jsonb (conventions.md: "no
  // `as` casts on data from outside the process"), even though it was validated before storage.
  const document = ProfileDocumentSchema.parse(profile.document);
  const changesToday = [...document.bufferRules, ...document.studyTriggers, ...document.treeRules].some(
    (r) => r.effectiveOn === today || r.repealedOn === today,
  );
  if (!changesToday) return;

  const openDecisions = await listOpenDecisions(jurisdictionId);
  for (const decision of openDecisions) {
    await enqueueAnalysisRun(decision.id, { purpose: "current" });
  }
}
