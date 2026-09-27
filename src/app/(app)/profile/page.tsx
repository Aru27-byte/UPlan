import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { STUDY_LABEL } from "@/modules/analysis";
import {
  ProfileDocumentSchema,
  getCurrentProfile,
  getProfileOverview,
  listProfileChanges,
  type ProfileChange,
  type ProfileDocument,
} from "@/modules/profiles";
import { formatFeet, formatRuleProvenance, formatTimestamp } from "@/modules/provenance";
import { ActionForm } from "@/ui/action-form.client";
import { actionClassName, inputClassName } from "@/ui/action-styles";
import { Icon } from "@/ui/icons";
import { Metric } from "@/ui/metric";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { StatusLabel, type StatusTone } from "@/ui/status-label";
import { SubmitButton } from "@/ui/submit-button.client";

import { decideProfileChangeAction, installSampleEvidenceAction, uploadProfileAction } from "./actions";

const RULE_SET_LABEL = { "critical-areas": "Critical area rules", trees: "Tree rules" } as const;
const CHANGE_TONE: Record<string, StatusTone> = { pending: "warn", approved: "ok", rejected: "danger" };
const SOURCE_LABEL: Record<string, string> = { upload: "Excel upload", edit: "Edit in UPlan", code_change: "Code change" };

// The column has a check constraint, so an unknown source is a bug to surface, not a value to display as-is.
function sourceLabel(source: string): string {
  const label = SOURCE_LABEL[source];
  if (label === undefined) throw new Error(`profile change has an unknown source: ${source}`);
  return label;
}

// The city profile (TechDesign/jurisdiction-profile.md, project-dashboard.md R6): the rules and settings
// every project in the city is analyzed under, always one click from any page. Anyone signed in can read it
// and propose a change from an Excel workbook; UPlan staff approve a change before it reaches any project.
export default async function ProfilePage() {
  const { actor } = await requireActor();
  const cityResult = await getCity();
  if (cityResult.kind !== "city") return null;
  const city = cityResult.city;

  const [overview, profileVersion, changes] = await Promise.all([
    getProfileOverview(city.id),
    getCurrentProfile(city.id),
    listProfileChanges(city.id),
  ]);
  const profile = profileVersion ? ProfileDocumentSchema.parse(profileVersion.document) : null;

  return (
    <>
      <PageHeader
        title="City profile"
        breadcrumb={[{ href: "/dashboard", label: "Dashboard" }]}
        meta={
          overview.versionNumber === null
            ? `${city.name}, ${city.stateCode} — no profile has been approved yet.`
            : `${city.name}, ${city.stateCode} — version ${overview.versionNumber}${overview.changedAt ? `, changed ${formatTimestamp(overview.changedAt, city.timeZone)}` : ""}.`
        }
        actions={
          <a href="/api/profile/template" className={actionClassName("secondary")}>
            <Icon name="download" />
            Download Excel template
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Changes awaiting review" value={changes.filter((c) => c.status === "pending").length} />
        <Metric label="Resource types" value={overview.resourceTypeCount} />
        <Metric label="Rules" value={overview.ruleCount} />
      </div>

      {profile ? <ProfileRules profile={profile} /> : (
        <Panel title="No approved profile">
          <p className="text-sm text-text">
            No projects can be analyzed for {city.name} until a profile is approved. Upload the city&apos;s rules from the
            Excel template below; UPlan staff review the workbook before it applies.
          </p>
        </Panel>
      )}

      <Panel title="Change history" description="Every proposed change, newest first. Nothing reaches a project until UPlan staff approve it.">
        {changes.length === 0 ? (
          <p className="text-sm text-muted">No change has been proposed yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {changes.map((change) => (
              <ChangeRow key={change.id} change={change} timeZone={city.timeZone} actorId={actor.userId} isStaff={actor.isStaff} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Propose a change from Excel"
        description="Use this when the city's website blocks automated reading, or to correct a rule. The workbook must follow the template."
      >
        <ActionForm action={uploadProfileAction.bind(null, city.id)} encType="multipart/form-data" className="flex max-w-xl flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Workbook (.xlsx)
            <input type="file" name="file" accept=".xlsx" required className={inputClassName} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Reason for this change
            <textarea name="reason" required rows={3} maxLength={1000} className={inputClassName} />
          </label>
          <div>
            <SubmitButton pendingLabel="Uploading…">Propose change</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

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

function ProfileRules({ profile }: { profile: ProfileDocument }) {
  return (
    <>
      <Panel title="Settings" description="Set by planners in the profile, not confirmed with the city for each project.">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-muted">Vesting</dt>
            <dd className="mt-1 flex flex-col gap-1 text-text">
              {profile.settings.vesting.map((v) => (
                <span key={v.ruleSet}>
                  {RULE_SET_LABEL[v.ruleSet]}: {v.vests ? "vest to the filing date" : "use today's rules"}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Map status</dt>
            <dd className="mt-1 flex flex-col gap-1 text-text">
              {profile.resourceTypes.map((r) => (
                <span key={r.key}>
                  {r.label}: {r.mapStatus === "regulatory" ? "regulatory" : "approximate"}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Records</dt>
            <dd className="mt-1 flex flex-col gap-1 text-text">
              {profile.settings.retention.map((r) => (
                <span key={r.recordType}>
                  {r.recordType}: kept {r.retainYears} years from {r.countFrom === "created" ? "creation" : "release"}
                </span>
              ))}
              <span>Exports: {profile.settings.exportFormats.join(", ")}</span>
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Critical areas" description="Each rule cites its code section and effective date.">
        <div className="grid gap-4 lg:grid-cols-2">
          {profile.resourceTypes
            .filter((r) => r.ruleSet === "critical-areas")
            .map((rt) => {
              const buffers = profile.bufferRules.filter((b) => b.resourceType === rt.key);
              const triggers = profile.studyTriggers.filter((t) => t.resourceType === rt.key);
              return (
                <div key={rt.key} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-text">{rt.label}</h3>
                    <StatusLabel tone={rt.mapStatus === "approximate" ? "warn" : "neutral"}>
                      {rt.mapStatus === "approximate" ? "Approximate boundary" : "Regulatory boundary"}
                    </StatusLabel>
                  </div>
                  {buffers.length === 0 && triggers.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No buffer or study-trigger rule recorded.</p>
                  ) : (
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                      {buffers.map((b) => (
                        <li key={b.key}>
                          {formatFeet(b.widthFt)} buffer — {formatRuleProvenance({ ...b.citation, effectiveOn: b.effectiveOn }).citations[0]}
                        </li>
                      ))}
                      {triggers.map((t) => (
                        <li key={t.key}>
                          {STUDY_LABEL[t.study]} within {formatFeet(t.withinFt)} — {formatRuleProvenance({ ...t.citation, effectiveOn: t.effectiveOn }).citations[0]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </div>
      </Panel>

      <Panel title="Significant trees" description="Trees are regulated individually. Desk analysis can't count them.">
        {profile.treeRules.length === 0 ? (
          <p className="text-sm text-muted">No tree rule recorded.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
            {profile.treeRules.map((t) => (
              <li key={t.key}>
                {t.kind === "significant-tree"
                  ? `${t.group === "conifer" ? "Conifers" : "Deciduous trees"} of ${t.minDbhIn} inches DBH or larger`
                  : `Removals capped at ${t.maxCount} per ${t.periodYears} years`}{" "}
                — {formatRuleProvenance({ ...t.citation, effectiveOn: t.effectiveOn }).citations[0]}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function ChangeRow({ change, timeZone, actorId, isStaff }: { change: ProfileChange; timeZone: string; actorId: string; isStaff: boolean }) {
  const tone = CHANGE_TONE[change.status];
  if (tone === undefined) throw new Error(`profile change ${change.id} has an unknown status: ${change.status}`);
  const isOwn = change.proposedBy === actorId;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusLabel tone={tone}>{change.status.charAt(0).toUpperCase()}{change.status.slice(1)}</StatusLabel>
        <span className="text-sm font-medium text-text">{change.reason}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {sourceLabel(change.source)} · proposed {formatTimestamp(change.proposedAt, timeZone)}
        {change.decidedAt ? ` · decided ${formatTimestamp(change.decidedAt, timeZone)}` : ""}
        {change.decisionNote ? ` · “${change.decisionNote}”` : ""}
      </p>
      {change.status === "pending" ? (
        isStaff && !isOwn ? (
          <ActionForm action={decideProfileChangeAction} className="mt-3 flex max-w-xl flex-col gap-2">
            <input type="hidden" name="changeId" value={change.id} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Note (optional)
              <input name="note" maxLength={1000} className={inputClassName} />
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="outcome" value="approved" pendingLabel="Working…">
                Approve
              </SubmitButton>
              <SubmitButton name="outcome" value="rejected" variant="danger" pendingLabel="Working…">
                Reject
              </SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {isStaff ? "You proposed this, so another UPlan staff member decides it." : "Waiting for UPlan staff to review it."}
          </p>
        )
      ) : null}
    </li>
  );
}

