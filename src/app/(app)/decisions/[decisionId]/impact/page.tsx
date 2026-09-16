import { AnalysisResultsSchema, getLatestRun } from "@/modules/analysis";
import { getDecision } from "@/modules/decisions";
import { ProfileDocumentSchema, getCurrentProfile } from "@/modules/profiles";

import { requireActor } from "@/app/_lib/actor";
import { Badge } from "@/ui/badge";
import { Card, type CardColor } from "@/ui/card";

const UNIT_LABEL: Record<string, string> = {
  "us-survey-sq-ft": "sq ft",
  "us-survey-ft": "ft",
};

const CARD_COLORS: CardColor[] = ["blue", "tan", "yellow", "green"];

// UIDesign/Project_View_Impact.png — one card per Impact from the latest run. Quantities and
// tones come straight from AnalysisResults; no narrative caption is invented (see the plan's
// "known gaps" note — the mockup's sentences like "creek-adjacent habitat…" have no backing field).
export default async function ImpactPage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const [profileVersion, latestRun] = await Promise.all([
    getCurrentProfile(actor, decision.jurisdictionId),
    getLatestRun(decisionId, "current"),
  ]);

  const profile = profileVersion ? ProfileDocumentSchema.parse(profileVersion.document) : null;
  const labelFor = (resourceTypeKey: string): string =>
    profile?.resourceTypes.find((r) => r.key === resourceTypeKey)?.label ?? resourceTypeKey;

  if (!latestRun) {
    return <p className="text-ink/70">No analysis run yet — trace a study area and footprint first.</p>;
  }
  const results = AnalysisResultsSchema.parse(latestRun.results);

  const impacts = results.impacts;
  if (impacts.length === 0) {
    return (
      <p className="text-ink/70">
        No impact — the footprint does not overlap any regulated resource or buffer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink/70 text-sm">
        What the proposal&apos;s footprint would remove or disturb, measured against the evidence. UPlan shows
        this impact — it never says whether it&apos;s acceptable.
      </p>
      {impacts.map((impact, i) => (
        <Card key={impact.impactKey} color={CARD_COLORS[i % CARD_COLORS.length]}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-bold">{labelFor(impact.resourceType)}</h2>
              <p className="mt-1 text-lg font-semibold">
                {impact.min === impact.max
                  ? `${impact.min.toFixed(2)} ${UNIT_LABEL[impact.unit] ?? impact.unit}`
                  : `${impact.min.toFixed(2)}–${impact.max.toFixed(2)} ${UNIT_LABEL[impact.unit] ?? impact.unit}`}
              </p>
            </div>
            <Badge tone={impact.approximate ? "approximate" : "regulatory"}>
              {impact.approximate ? "Approximate" : "Regulatory"}
            </Badge>
          </div>
          {impact.dependsOn ? (
            <p className="mt-2 text-sm">
              This range depends on <code>{impact.dependsOn}</code>, an attribute the evidence doesn&apos;t
              carry for this feature.
            </p>
          ) : null}
        </Card>
      ))}
      {results.limits.length > 0 ? (
        <Card color="neutral">
          <h2 className="font-bold">What desk analysis can&apos;t see</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {results.limits.map((limit) => (
              <li key={`${limit.key}:${limit.resourceType ?? ""}`}>
                {limit.key === "significant-trees-not-countable"
                  ? "How many significant trees the proposal would remove — canopy data shows extent, not trunk diameters."
                  : "The regulated boundary is set by a site-specific study, not this map."}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
