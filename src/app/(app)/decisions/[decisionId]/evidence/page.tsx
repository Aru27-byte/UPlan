import { AnalysisResultsSchema, getLatestRun } from "@/modules/analysis";
import { getDecision } from "@/modules/decisions";
import { getDatasetVersionProvenance, getJurisdictionDatasetMappings } from "@/modules/evidence";
import { ProfileDocumentSchema, getCurrentProfile } from "@/modules/profiles";
import { formatEvidenceProvenance } from "@/modules/provenance";

import { requireActor } from "@/app/_lib/actor";
import { Badge } from "@/ui/badge";
import { Card, type CardColor } from "@/ui/card";

const CARD_COLORS: CardColor[] = ["yellow", "green", "blue", "tan"];

// UIDesign/Project_View_Evidence.png — one card per resource type in the current profile. Only
// structured facts are shown (provenance, confidence, gaps, disagreements) — never generated
// narrative text (see the plan's "known gaps" note: P2/posture forbid synthesizing findings).
export default async function EvidencePage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const [profileVersion, mappings, latestRun] = await Promise.all([
    getCurrentProfile(actor, decision.jurisdictionId),
    getJurisdictionDatasetMappings(decision.jurisdictionId),
    getLatestRun(decisionId, "current"),
  ]);

  if (!profileVersion) {
    return <p className="text-ink/70">This jurisdiction has no approved profile yet.</p>;
  }
  const profile = ProfileDocumentSchema.parse(profileVersion.document);

  const results = latestRun ? AnalysisResultsSchema.parse(latestRun.results) : null;
  const gaps = results?.evidenceBase.gaps ?? [];
  const disagreements = results?.evidenceBase.disagreements ?? [];

  const rows = await Promise.all(
    profile.resourceTypes.map(async (resourceType) => {
      const mapping = mappings.find((m) => m.resourceTypeKey === resourceType.key);
      const rawProvenance = mapping?.dataset.currentVersionId
        ? await getDatasetVersionProvenance(mapping.dataset.currentVersionId)
        : null;
      return {
        resourceType,
        provenance: rawProvenance ? formatEvidenceProvenance(rawProvenance) : null,
        confidence: rawProvenance?.confidence ?? null,
        gap: gaps.find((g) => g.resourceType === resourceType.key) ?? null,
        disagreementsFor: disagreements.filter((d) => d.resourceType === resourceType.key),
      };
    }),
  );

  return (
    <div>
      <p className="text-ink/70 mb-4 text-sm">
        The independent evidence base for this study area — gathered from public sources, not from the
        applicant. Where sources disagree or data is missing, that&apos;s shown too.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map(({ resourceType, provenance, confidence, gap, disagreementsFor }, i) => (
          <Card key={resourceType.key} color={CARD_COLORS[i % CARD_COLORS.length]}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold">{resourceType.label}</h2>
              {confidence ? <Badge tone={confidence}>{confidence}</Badge> : null}
            </div>
            {gap ? (
              <p className="mt-2 text-sm">
                {gap.reason === "no-dataset-mapped"
                  ? "No dataset is mapped for this resource type."
                  : "This resource type's mapped dataset does not cover the study area."}
              </p>
            ) : provenance ? (
              <div className="mt-2 space-y-1 text-sm">
                <p>{provenance.sourceLine}</p>
                <p className="text-xs">{provenance.retrievedLine}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm">No evidence recorded yet.</p>
            )}
            {disagreementsFor.length > 0 ? (
              <div className="bg-ink text-cream mt-3 rounded-md px-3 py-2 text-xs">
                Sources disagree on {disagreementsFor.length}{" "}
                {disagreementsFor.length === 1 ? "area" : "areas"} for this resource type.
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
