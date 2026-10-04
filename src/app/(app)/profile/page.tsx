import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { STUDY_LABEL } from "@/modules/analysis";
import {
  ProfileDocumentSchema,
  getCurrentProfile,
  getProfileOverview,
  listSources,
  type Citation,
  type ProfileDocument,
} from "@/modules/profiles";
import { formatFeet, formatRuleProvenance, formatTimestamp } from "@/modules/provenance";
import { ActionForm } from "@/ui/action-form.client";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { installSampleEvidenceAction } from "./actions";
import { ProfileFlyout } from "./profile-flyout.client";
import { ResourceTypePanel, type ResourceTypeItem, type ResourceTypeRule } from "./resource-type-panel.client";
import { SettingsForm } from "./settings-form";
import { SourcesView } from "./sources-view";

const RULE_SET_LABEL = { "critical-areas": "Critical area rules", trees: "Tree rules" } as const;

// P1: every rule is shown with its code section and the date it took effect, through the one provenance formatter.
function citationLine(rule: { citation: Citation; effectiveOn: string }): string {
  const [line] = formatRuleProvenance({ ...rule.citation, effectiveOn: rule.effectiveOn }).citations;
  if (line === undefined) throw new Error("the provenance formatter returned no citation for a rule");
  return line;
}

// The profile's regulations, grouped under the resource type each applies to and worded for display. Tree rules
// carry no resource type of their own, so they belong to the resource types of the tree rule set.
function toResourceTypeItems(profile: ProfileDocument): ResourceTypeItem[] {
  return profile.resourceTypes.map((rt) => {
    const rules: ResourceTypeRule[] = [];
    for (const b of profile.bufferRules.filter((r) => r.resourceType === rt.key)) {
      rules.push({
        key: b.key,
        kind: "Buffer",
        summary: `${formatFeet(b.widthFt)} buffer${b.appliesWhen ? ` where ${b.appliesWhen.attribute} is ${b.appliesWhen.equals}` : ""}`,
        citation: citationLine(b),
      });
    }
    for (const t of profile.studyTriggers.filter((r) => r.resourceType === rt.key)) {
      rules.push({
        key: t.key,
        kind: "Study trigger",
        summary: `${STUDY_LABEL[t.study]} within ${formatFeet(t.withinFt)}`,
        citation: citationLine(t),
      });
    }
    if (rt.ruleSet === "trees") {
      for (const t of profile.treeRules) {
        rules.push({
          key: t.key,
          kind: t.kind === "significant-tree" ? "Significant tree" : "Removal cap",
          summary:
            t.kind === "significant-tree"
              ? `${t.group === "conifer" ? "Conifers" : "Deciduous trees"} of ${t.minDbhIn} inches DBH or larger`
              : `Removals capped at ${t.maxCount} per ${t.periodYears} years`,
          citation: citationLine(t),
        });
      }
    }
    return {
      key: rt.key,
      label: rt.label,
      ruleSetLabel: RULE_SET_LABEL[rt.ruleSet],
      isApproximate: rt.mapStatus === "approximate",
      rules,
    };
  });
}

// The city profile (TechDesign/jurisdiction-profile.md, project-dashboard.md R6): the rules and settings
// every project in the city is analyzed under, always one click from any page. Anyone signed in can read it
// and change it; a change applies at once (profile-upload-edit.md R5).
export default async function ProfilePage() {
  const { actor } = await requireActor();
  const cityResult = await getCity();
  if (cityResult.kind !== "city") return null;
  const city = cityResult.city;

  const [overview, profileVersion, sources] = await Promise.all([
    getProfileOverview(city.id),
    getCurrentProfile(city.id),
    listSources(city.id),
  ]);
  const profile = profileVersion ? ProfileDocumentSchema.parse(profileVersion.document) : null;

  return (
    <>
      <PageHeader
        eyebrow="Jurisdiction profile"
        title={`City of ${city.name} Profile`}
        breadcrumb={[{ href: "/dashboard", label: "Dashboard" }]}
        meta={
          <span className="mt-1.5 inline-flex flex-wrap items-center gap-x-3 gap-y-2">
            {overview.versionNumber === null ? (
              <span className="rounded-full bg-warn-soft px-3 py-1 text-sm font-bold text-warn">No profile yet</span>
            ) : (
              <span className="rounded-full bg-accent-gold px-3 py-1 text-sm font-bold text-ink">Version {overview.versionNumber}</span>
            )}
            <span className="text-lg font-semibold text-page-text">
              {city.name}, {city.stateCode}
            </span>
            <span className="text-base text-page-muted">
              {overview.changedAt ? `Last changed ${formatTimestamp(overview.changedAt, city.timeZone)}` : "Upload the city's rules from Sources to begin"}
            </span>
          </span>
        }
        actions={
          <ProfileFlyout
            sourceCount={sources.length}
            settings={
              profile && profileVersion ? (
                <SettingsForm key={profileVersion.id} jurisdictionId={city.id} versionId={profileVersion.id} profile={profile} />
              ) : (
                <p className="rounded-lg border-2 border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                  Settings appear once the city has a profile. Upload a workbook from Sources to create it.
                </p>
              )
            }
            sources={
              <SourcesView
                key={profileVersion?.id ?? "no-profile"}
                jurisdictionId={city.id}
                versionId={profileVersion?.id ?? null}
                sources={sources}
                timeZone={city.timeZone}
              />
            }
          />
        }
      />

      {profile ? (
        <ResourceTypePanel items={toResourceTypeItems(profile)} resourceTypeCount={overview.resourceTypeCount} ruleCount={overview.ruleCount} />
      ) : (
        <Panel title="No profile yet">
          <p className="text-sm text-text">
            No projects can be analyzed for {city.name} until it has a profile. Open the settings panel with the gear at the top right, choose
            Sources, and upload the city&apos;s rules from the Excel template.
          </p>
        </Panel>
      )}

      {actor.isStaff ? (
        <Panel
          title="Sample evidence"
          description="UPlan staff only. Installs illustrative datasets, labeled as sample data everywhere they appear, so projects have evidence to analyze before real datasets are ingested."
        >
          <ActionForm action={installSampleEvidenceAction.bind(null, city.id)}>
            <SubmitButton variant="secondary" pendingLabel="Installing…">
              Install sample evidence
            </SubmitButton>
          </ActionForm>
        </Panel>
      ) : null}
    </>
  );
}
